const QRCode = require('qrcode');
const os = require('os');
const net = require('net');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

// Store paired devices
const pairedDevices = new Map();
const pendingPairs = new Map();

const VIRTUAL_INTERFACE_HINTS = [
  'virtual',
  'vmware',
  'vbox',
  'docker',
  'hyper-v',
  'wsl',
  'vethernet',
  'loopback',
  'tailscale',
  'tun',
  'tap'
];

// Generate QR code data
function generatePairingCode(deviceInfo) {
  const pairingCode = {
    id: uuidv4(),
    deviceName: deviceInfo.deviceName,
    ip: deviceInfo.ip,
    port: deviceInfo.port,
    timestamp: Date.now(),
    expiresIn: 300000 // 5 minutes
  };
  
  pendingPairs.set(pairingCode.id, pairingCode);
  
  return pairingCode;
}

// Generate QR code image
async function generateQRCode(pairingCodeOrData) {
  const qrData = typeof pairingCodeOrData === 'string'
    ? pairingCodeOrData
    : JSON.stringify(pairingCodeOrData);
  const qrImage = await QRCode.toDataURL(qrData);
  return qrImage;
}

// Build URL payload for easy scan-and-connect
function createPairingURL(pairingCode) {
  const pairingUrl = new URL(`http://${pairingCode.ip}:${pairingCode.port}/qr-pairing.html`);
  pairingUrl.searchParams.set('pairingCode', pairingCode.id);
  pairingUrl.searchParams.set('deviceName', pairingCode.deviceName);
  pairingUrl.searchParams.set('ip', pairingCode.ip);
  pairingUrl.searchParams.set('port', String(pairingCode.port));
  pairingUrl.searchParams.set('expiresAt', String(pairingCode.timestamp + pairingCode.expiresIn));
  return pairingUrl.toString();
}

function isPrivateIPv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) {
    return false;
  }

  if (parts[0] === 10) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  return false;
}

function isLinkLocalIPv4(address) {
  return address.startsWith('169.254.');
}

function isVirtualInterface(interfaceName) {
  const normalized = String(interfaceName || '').toLowerCase();
  return VIRTUAL_INTERFACE_HINTS.some((hint) => normalized.includes(hint));
}

function isIPv4Family(family) {
  return family === 'IPv4' || family === 4 || family === '4';
}

function scoreNetworkCandidate(candidate) {
  let score = 0;

  if (isPrivateIPv4(candidate.ip)) score += 100;
  if (isLinkLocalIPv4(candidate.ip)) score -= 150;
  if (isVirtualInterface(candidate.interface)) score -= 120;

  const iface = candidate.interface.toLowerCase();
  if (iface.includes('wi-fi') || iface.includes('wifi') || iface.includes('wlan')) score += 30;
  if (iface.includes('ethernet') || iface.includes('eth') || iface.includes('lan')) score += 20;

  return score;
}

function getNetworkCandidates() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs || []) {
      if (!isIPv4Family(addr.family) || addr.internal || !addr.address) {
        continue;
      }

      candidates.push({
        interface: name,
        ip: addr.address,
        netmask: addr.netmask,
        score: 0
      });
    }
  }

  candidates.forEach((candidate) => {
    candidate.score = scoreNetworkCandidate(candidate);
  });

  candidates.sort((a, b) => b.score - a.score || a.interface.localeCompare(b.interface));
  return candidates;
}

function normalizeHostAndPort(rawHost, rawPort) {
  let hostInput = String(rawHost || '').trim();
  let port = Number.parseInt(rawPort, 10);

  if (!hostInput) {
    return { error: 'Device IP is required' };
  }

  if (hostInput.startsWith('http://') || hostInput.startsWith('https://')) {
    try {
      const parsed = new URL(hostInput);
      hostInput = parsed.hostname;
      if (!Number.isInteger(port) && parsed.port) {
        port = Number.parseInt(parsed.port, 10);
      }
    } catch {
      return { error: 'Invalid device URL/IP format' };
    }
  } else if (hostInput.includes(':') && hostInput.split(':').length === 2) {
    const [hostPart, portPart] = hostInput.split(':');
    hostInput = hostPart.trim();
    if (!Number.isInteger(port) && portPart) {
      port = Number.parseInt(portPart.trim(), 10);
    }
  }

  if (!Number.isInteger(port)) {
    port = 3000;
  }

  if (port < 1 || port > 65535) {
    return { error: 'Invalid port. Use a value between 1 and 65535' };
  }

  if (net.isIP(hostInput) !== 4) {
    return { error: 'Invalid IPv4 address' };
  }

  return { ip: hostInput, port };
}

function checkRemoteServer(ip, port) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: ip,
        port,
        path: '/health',
        method: 'GET',
        timeout: 3000
      },
      (resp) => {
        resolve(resp.statusCode >= 200 && resp.statusCode < 500);
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.on('error', () => {
      resolve(false);
    });

    req.end();
  });
}

// Verify and pair device
function pairDevice(pairingCode, clientId) {
  const pending = pendingPairs.get(pairingCode.id);
  
  if (!pending) {
    return { success: false, error: 'Invalid pairing code' };
  }
  
  if (Date.now() - pending.timestamp > pending.expiresIn) {
    pendingPairs.delete(pairingCode.id);
    return { success: false, error: 'Pairing code expired' };
  }
  
  const device = {
    ...pairingCode,
    clientId,
    pairedAt: Date.now()
  };
  
  pairedDevices.set(clientId, device);
  pendingPairs.delete(pairingCode.id);
  
  return { success: true, device };
}

// Get network interface
function getLocalIP() {
  const candidates = getNetworkCandidates();
  if (candidates.length > 0) {
    return candidates[0].ip;
  }

  return 'localhost';
}

// Get all paired devices
function getPairedDevices() {
  return Array.from(pairedDevices.values());
}

// Remove paired device
function unpairDevice(clientId) {
  return pairedDevices.delete(clientId);
}

// Register QR endpoints
function registerQREndpoints(app) {
  // Generate QR code for pairing
  app.post('/api/qr/generate', async (req, res) => {
    try {
      const { deviceName, ip: requestedIp } = req.body || {};
      const candidates = getNetworkCandidates();
      const selectedCandidate = candidates.find((candidate) => candidate.ip === requestedIp);
      const ip = selectedCandidate?.ip || getLocalIP();
      const port = process.env.PORT || 3000;
      
      const deviceInfo = {
        deviceName: deviceName || `Device-${uuidv4().slice(0, 8)}`,
        ip,
        port
      };
      
      const pairingCode = generatePairingCode(deviceInfo);
      const qrData = createPairingURL(pairingCode);
      const qrImage = await generateQRCode(qrData);
      
      res.json({
        success: true,
        qrCode: qrImage,
        qrData,
        pairingCode: pairingCode.id,
        deviceInfo,
        recommendedIP: ip,
        availableIPs: candidates.map((candidate) => ({
          interface: candidate.interface,
          ip: candidate.ip
        })),
        expiresIn: 300
      });
    } catch (error) {
      console.error('QR generation error:', error);
      res.status(500).json({ error: 'Failed to generate QR code' });
    }
  });
  
  // Verify pairing code
  app.post('/api/qr/pair', (req, res) => {
    try {
      const { pairingCode, clientId, deviceName } = req.body;
      
      if (!pairingCode || !clientId) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      const pending = pendingPairs.get(pairingCode);
      if (!pending) {
        return res.status(400).json({ error: 'Invalid pairing code' });
      }
      
      const device = {
        clientId,
        deviceName: deviceName || pending.deviceName,
        ip: pending.ip,
        port: pending.port,
        pairedAt: Date.now(),
        lastSeen: Date.now()
      };
      
      pairedDevices.set(clientId, device);
      pendingPairs.delete(pairingCode);
      
      res.json({
        success: true,
        message: 'Device paired successfully',
        device
      });
    } catch (error) {
      console.error('Pairing error:', error);
      res.status(500).json({ error: 'Pairing failed' });
    }
  });
  
  // Get paired devices
  app.get('/api/qr/devices', (req, res) => {
    res.json({
      devices: getPairedDevices()
    });
  });
  
  // Manual IP pairing
  app.post('/api/qr/pair-by-ip', async (req, res) => {
    try {
      const { ip, port, clientId, deviceName } = req.body || {};
      
      if (!ip || !clientId) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const normalizedTarget = normalizeHostAndPort(ip, port);
      if (normalizedTarget.error) {
        return res.status(400).json({ error: normalizedTarget.error });
      }

      const reachable = await checkRemoteServer(normalizedTarget.ip, normalizedTarget.port);
      if (!reachable) {
        return res.status(400).json({
          error: `Cannot reach device at ${normalizedTarget.ip}:${normalizedTarget.port}. Ensure both devices are on same Wi-Fi, app is running, and firewall allows port ${normalizedTarget.port}.`
        });
      }
      
      const device = {
        clientId,
        deviceName: deviceName || `Device at ${normalizedTarget.ip}`,
        ip: normalizedTarget.ip,
        port: normalizedTarget.port,
        pairedAt: Date.now(),
        lastSeen: Date.now(),
        pairingMethod: 'manual-ip'
      };
      
      pairedDevices.set(clientId, device);
      
      res.json({
        success: true,
        message: 'Device paired by IP',
        device
      });
    } catch (error) {
      console.error('IP pairing error:', error);
      res.status(500).json({ error: 'IP pairing failed' });
    }
  });
  
  // Unpair device
  app.post('/api/qr/unpair', (req, res) => {
    try {
      const { clientId } = req.body;
      
      if (!clientId) {
        return res.status(400).json({ error: 'Client ID required' });
      }
      
      const success = unpairDevice(clientId);
      
      res.json({
        success,
        message: success ? 'Device unpaired' : 'Device not found'
      });
    } catch (error) {
      console.error('Unpair error:', error);
      res.status(500).json({ error: 'Unpairing failed' });
    }
  });
  
  // Get network info
  app.get('/api/network-info', (req, res) => {
    const networks = getNetworkCandidates().map(({ interface: ifaceName, ip, netmask }) => ({
      interface: ifaceName,
      ip,
      netmask
    }));
    
    res.json({
      localhost: getLocalIP(),
      port: process.env.PORT || 3000,
      networks,
      hostname: os.hostname()
    });
  });
}

module.exports = {
  registerQREndpoints,
  generatePairingCode,
  generateQRCode,
  createPairingURL,
  pairDevice,
  getPairedDevices,
  unpairDevice,
  getLocalIP,
  getNetworkCandidates
};
