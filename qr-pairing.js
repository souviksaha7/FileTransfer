const QRCode = require('qrcode');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

// Store paired devices
const pairedDevices = new Map();
const pendingPairs = new Map();

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
async function generateQRCode(pairingCode) {
  const qrData = JSON.stringify(pairingCode);
  const qrImage = await QRCode.toDataURL(qrData);
  return qrImage;
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
  const interfaces = os.networkInterfaces();
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
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
      const { deviceName } = req.body;
      const ip = getLocalIP();
      const port = process.env.PORT || 3000;
      
      const deviceInfo = {
        deviceName: deviceName || `Device-${uuidv4().slice(0, 8)}`,
        ip,
        port
      };
      
      const pairingCode = generatePairingCode(deviceInfo);
      const qrImage = await generateQRCode(pairingCode);
      
      res.json({
        success: true,
        qrCode: qrImage,
        pairingCode: pairingCode.id,
        deviceInfo,
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
  app.post('/api/qr/pair-by-ip', (req, res) => {
    try {
      const { ip, port, clientId, deviceName } = req.body;
      
      if (!ip || !clientId) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      const device = {
        clientId,
        deviceName: deviceName || `Device at ${ip}`,
        ip,
        port: port || 3000,
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
    const interfaces = os.networkInterfaces();
    const networks = [];
    
    for (const [name, addrs] of Object.entries(interfaces)) {
      for (const addr of addrs) {
        if (addr.family === 'IPv4' && !addr.internal) {
          networks.push({
            interface: name,
            ip: addr.address,
            netmask: addr.netmask
          });
        }
      }
    }
    
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
  pairDevice,
  getPairedDevices,
  unpairDevice,
  getLocalIP
};
