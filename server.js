const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const compression = require('compression');
const os = require('os');
const { registerQREndpoints, getLocalIP } = require('./qr-pairing');

// CORS middleware for cross-device connectivity
const corsOptions = {
  origin: true, // Allow all origins (necessary for device-to-device communication)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Auth-Token', 'X-Private-Key-Digest'],
  credentials: true,
  timeout: 0
};

const app = express();

// Apply CORS headers for all responses
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token, X-Private-Key-Digest, Accept, Authorization');
  res.header('Access-Control-Max-Age', '86400');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Configuration
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const TRANSFER_INDEX_FILE = path.join(UPLOAD_DIR, '.transfer-index.json');
const CHUNK_SIZE = 1024 * 1024; // 1MB chunks

// Password configuration
const WEBPAGE_PASSWORD = 'Specxy';
const DELETE_PASSWORD = 'zxc100@P';

// Create uploads directory
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Middleware
app.use(compression());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Authentication middleware - serve index.html only if authenticated
app.use((req, res, next) => {
  // Public API routes that don't need authentication
  const publicApiRoutes = ['/api/login', '/api/health', '/api/auth-check', '/api/network-info', '/health'];
  const isPublicApiRoute = publicApiRoutes.includes(req.path) || req.path.startsWith('/api/qr/');

  if (isPublicApiRoute) {
    return next();
  }
  
  // Check for auth token in query, body, or headers
  const authToken = req.query.token || req.body?.token || req.headers['x-auth-token'];
  console.log(`[AUTH MIDDLEWARE] ${req.method} ${req.path} - authToken present: ${!!authToken}`);
  
  // Allow index, share pages, and the public download endpoint (used by shared links)
  if (req.path === '/' || req.path.startsWith('/share/') || req.path.startsWith('/api/download')) {
    console.log(`[AUTH MIDDLEWARE] Allowing public access to ${req.path}`);
    return next(); // Allow index, share pages, and public downloads to be served
  }
  
  // For API routes, check authentication
  if (req.path.startsWith('/api/')) {
    if (authToken === WEBPAGE_PASSWORD || req.session?.authenticated) {
      return next();
    }
    console.log(`[AUTH MIDDLEWARE] Blocking ${req.method} ${req.path} - missing/invalid token`);
    return res.status(401).json({ error: 'Unauthorized. Password required.' });
  }
  
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Serve LICENSE file
app.get('/LICENSE', (req, res) => {
  res.sendFile(path.join(__dirname, 'LICENSE'));
});

// Storage configuration for multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 100 * 1024 * 1024 * 1024 } // 100GB limit
});

// Store active transfers and connected clients
const activeTransfers = new Map();
const connectedClients = new Set();
let bluetoothConnected = false;

function inferOriginalName(fileName) {
  const match = String(fileName || '').match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-(.+)$/i);
  return match ? match[1] : fileName;
}

function getSafeUploadTime(value, fallbackTime = new Date()) {
  const parsed = value ? new Date(value) : fallbackTime;
  return Number.isNaN(parsed.getTime()) ? fallbackTime : parsed;
}

const BASE64_SAFE_PATTERN = /^[A-Za-z0-9+/_=-]+$/;

function sanitizeBase64Value(value, maxLength = 512) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > maxLength || !BASE64_SAFE_PATTERN.test(normalized)) {
    return '';
  }
  return normalized;
}

function sanitizePrivateMetadata(input) {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const algorithm = String(input.algorithm || '').trim().toUpperCase();
  const originalName = String(input.originalName || '').trim().slice(0, 255);
  const mimeType = String(input.mimeType || 'application/octet-stream').trim().slice(0, 120) || 'application/octet-stream';
  const salt = sanitizeBase64Value(input.salt, 256);
  const iv = sanitizeBase64Value(input.iv, 128);
  const keyDigest = sanitizeBase64Value(input.keyDigest, 256);
  const iterations = Number.parseInt(input.iterations, 10);
  const originalSize = Number.parseInt(input.originalSize, 10);

  if (algorithm !== 'AES-GCM') {
    return null;
  }

  if (!originalName || !salt || !iv || !keyDigest) {
    return null;
  }

  if (!Number.isInteger(iterations) || iterations < 10000 || iterations > 2000000) {
    return null;
  }

  if (!Number.isFinite(originalSize) || originalSize < 0) {
    return null;
  }

  return {
    algorithm: 'AES-GCM',
    originalName,
    mimeType,
    salt,
    iv,
    keyDigest,
    iterations,
    originalSize
  };
}

function parsePrivateUploadMetadata(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return { meta: null };
  }

  let parsedValue = rawValue;
  if (typeof rawValue === 'string') {
    try {
      parsedValue = JSON.parse(rawValue);
    } catch {
      return { error: 'Invalid private upload metadata JSON' };
    }
  }

  const sanitized = sanitizePrivateMetadata(parsedValue);
  if (!sanitized) {
    return { error: 'Invalid private upload metadata' };
  }

  return { meta: sanitized };
}

function getPrivateKeyDigest(req) {
  return String(req.headers['x-private-key-digest'] || req.query.privateKeyDigest || '').trim();
}

function canAccessPrivateFile(fileInfo, privateKeyDigest) {
  if (!fileInfo || !fileInfo.isPrivate) {
    return true;
  }

  const expectedDigest = fileInfo.encryption && fileInfo.encryption.keyDigest
    ? String(fileInfo.encryption.keyDigest)
    : '';

  return Boolean(privateKeyDigest && expectedDigest && privateKeyDigest === expectedDigest);
}

function getClientFileView(fileInfo, transferId) {
  const payload = {
    transferId,
    name: fileInfo.originalName,
    size: fileInfo.size,
    uploadTime: fileInfo.uploadTime,
    transferType: fileInfo.transferType,
    isPrivate: Boolean(fileInfo.isPrivate)
  };

  if (fileInfo.isPrivate && fileInfo.encryption) {
    payload.encryption = {
      algorithm: fileInfo.encryption.algorithm,
      salt: fileInfo.encryption.salt,
      iv: fileInfo.encryption.iv,
      iterations: fileInfo.encryption.iterations,
      mimeType: fileInfo.encryption.mimeType,
      originalSize: fileInfo.encryption.originalSize
    };
  }

  return payload;
}

function cleanupUploadedFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error('[UPLOAD] Cleanup error:', error.message);
  }
}

function toTransferFileInfo({
  transferId = uuidv4(),
  originalName,
  fileName,
  size = 0,
  filePath,
  uploadTime = new Date(),
  transferType = 'WiFi',
  isPrivate = false,
  encryption = null
}) {
  const resolvedFileName = fileName || path.basename(filePath || '');
  const resolvedPath = path.resolve(filePath || path.join(UPLOAD_DIR, resolvedFileName));
  const normalizedEncryption = isPrivate ? sanitizePrivateMetadata(encryption) : null;
  const normalizedPrivate = Boolean(isPrivate && normalizedEncryption);

  return {
    transferId,
    originalName: originalName || inferOriginalName(resolvedFileName),
    fileName: resolvedFileName,
    size: Number(size) || 0,
    path: resolvedPath,
    uploadTime: getSafeUploadTime(uploadTime),
    transferType: transferType || (normalizedPrivate ? 'Private (E2E)' : 'WiFi'),
    isPrivate: normalizedPrivate,
    encryption: normalizedPrivate ? normalizedEncryption : null
  };
}

function persistTransfersIndex() {
  try {
    const entries = [];

    activeTransfers.forEach((fileInfo, transferId) => {
      try {
        if (!fs.existsSync(fileInfo.path) || !fs.statSync(fileInfo.path).isFile()) {
          return;
        }

        entries.push({
          transferId,
          originalName: fileInfo.originalName,
          fileName: fileInfo.fileName,
          size: fileInfo.size,
          uploadTime: fileInfo.uploadTime,
          transferType: fileInfo.transferType,
          isPrivate: Boolean(fileInfo.isPrivate),
          encryption: fileInfo.isPrivate ? fileInfo.encryption : null
        });
      } catch (err) {
        console.error(`[TRANSFER INDEX] Skipping invalid entry ${transferId}:`, err.message);
      }
    });

    const tempPath = `${TRANSFER_INDEX_FILE}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(entries, null, 2), 'utf8');
    fs.renameSync(tempPath, TRANSFER_INDEX_FILE);
  } catch (error) {
    console.error('[TRANSFER INDEX] Failed to persist transfer index:', error);
  }
}

function registerTransfer(fileInfoInput, persist = true) {
  const fileInfo = toTransferFileInfo(fileInfoInput);
  activeTransfers.set(fileInfo.transferId, fileInfo);

  if (persist) {
    persistTransfersIndex();
  }

  return fileInfo;
}

function removeMissingTransfers() {
  let changed = false;

  activeTransfers.forEach((fileInfo, transferId) => {
    try {
      if (!fs.existsSync(fileInfo.path) || !fs.statSync(fileInfo.path).isFile()) {
        activeTransfers.delete(transferId);
        changed = true;
      }
    } catch {
      activeTransfers.delete(transferId);
      changed = true;
    }
  });

  if (changed) {
    persistTransfersIndex();
  }
}

function loadTransfersFromDisk() {
  const diskFiles = new Map();
  const uploadEntries = fs.readdirSync(UPLOAD_DIR, { withFileTypes: true });

  uploadEntries.forEach((entry) => {
    if (!entry.isFile()) {
      return;
    }

    if (entry.name === path.basename(TRANSFER_INDEX_FILE)) {
      return;
    }

    const fullPath = path.join(UPLOAD_DIR, entry.name);

    try {
      const stats = fs.statSync(fullPath);
      diskFiles.set(path.resolve(fullPath), {
        fileName: entry.name,
        filePath: fullPath,
        size: stats.size,
        uploadTime: stats.birthtimeMs ? stats.birthtime : stats.mtime
      });
    } catch (err) {
      console.error(`[STARTUP] Could not read file metadata for ${entry.name}:`, err.message);
    }
  });

  let restoredCount = 0;

  if (fs.existsSync(TRANSFER_INDEX_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(TRANSFER_INDEX_FILE, 'utf8'));
      if (Array.isArray(parsed)) {
        parsed.forEach((entry) => {
          const transferId = entry.transferId || uuidv4();
          const fileName = entry.fileName;
          if (!fileName) {
            return;
          }

          const filePath = path.resolve(path.join(UPLOAD_DIR, fileName));
          const diskMeta = diskFiles.get(filePath);
          if (!diskMeta) {
            return;
          }

          registerTransfer({
            transferId,
            originalName: entry.originalName,
            fileName,
            size: entry.size || diskMeta.size,
            filePath,
            uploadTime: entry.uploadTime || diskMeta.uploadTime,
            transferType: entry.transferType || 'WiFi',
            isPrivate: Boolean(entry.isPrivate),
            encryption: entry.encryption || null
          }, false);

          diskFiles.delete(filePath);
          restoredCount += 1;
        });
      }
    } catch (error) {
      console.error('[STARTUP] Failed to load transfer index. Rebuilding from uploads folder:', error.message);
    }
  }

  diskFiles.forEach((meta) => {
    registerTransfer({
      transferId: uuidv4(),
      originalName: inferOriginalName(meta.fileName),
      fileName: meta.fileName,
      size: meta.size,
      filePath: meta.filePath,
      uploadTime: meta.uploadTime,
      transferType: 'WiFi'
    }, false);
    restoredCount += 1;
  });

  persistTransfersIndex();
  console.log(`[STARTUP] Restored ${restoredCount} uploaded file(s) from disk.`);
}

loadTransfersFromDisk();

// ==================== AUTHENTICATION ENDPOINTS ====================

// Login endpoint
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  
  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }
  
  if (password === WEBPAGE_PASSWORD) {
    return res.json({ 
      success: true, 
      message: 'Authenticated',
      token: WEBPAGE_PASSWORD 
    });
  }
  
  return res.status(401).json({ error: 'Invalid password' });
});

// Check authentication status
app.get('/api/auth-check', (req, res) => {
  const token = req.query.token || req.headers['x-auth-token'];
  
  if (token === WEBPAGE_PASSWORD) {
    return res.json({ authenticated: true });
  }
  
  return res.json({ authenticated: false });
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  const clientId = uuidv4();
  connectedClients.add(ws);
  
  console.log(`Client connected: ${clientId}`);
  ws.send(JSON.stringify({ 
    type: 'connection',
    clientId,
    message: 'Connected to file transfer server'
  }));

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      handleWebSocketMessage(ws, message);
    } catch (e) {
      console.error('WebSocket message error:', e);
    }
  });

  ws.on('close', () => {
    connectedClients.delete(ws);
    console.log(`Client disconnected: ${clientId}`);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Handle WebSocket messages
function handleWebSocketMessage(ws, message) {
  switch (message.type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }));
      break;
    case 'transfer-status':
      broadcastTransferStatus(message);
      break;
    case 'bluetooth-enable':
      enableBluetoothTransfer(ws);
      break;
    default:
      break;
  }
}

// Broadcast transfer status to all connected clients
function broadcastTransferStatus(status) {
  connectedClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(status));
    }
  });
}

// Enable Bluetooth transfer simulation
function enableBluetoothTransfer(ws) {
  bluetoothConnected = true;
  ws.send(JSON.stringify({
    type: 'bluetooth-status',
    status: 'enabled',
    message: 'Bluetooth transfer enabled'
  }));
  
  broadcastTransferStatus({
    type: 'system-status',
    bluetooth: true,
    message: 'Bluetooth connectivity enabled for parallel transfers'
  });
}

// REST API endpoints

// Get system info
app.get('/api/system-info', (req, res) => {
  const networkInterfaces = os.networkInterfaces();
  const ipAddresses = [];
  const preferredIp = getLocalIP();

  for (const [name, interfaces] of Object.entries(networkInterfaces)) {
    interfaces.forEach(iface => {
      if (iface.family === 'IPv4' && !iface.internal) {
        ipAddresses.push({
          interface: name,
          address: iface.address,
          preferred: iface.address === preferredIp
        });
      }
    });
  }

  ipAddresses.sort((a, b) => {
    if (a.preferred && !b.preferred) return -1;
    if (!a.preferred && b.preferred) return 1;
    return a.interface.localeCompare(b.interface);
  });

  res.json({
    hostname: os.hostname(),
    port: PORT,
    preferredIp,
    ipAddresses,
    bluetoothSupported: process.platform !== 'win32' || true,
    bluetoothEnabled: bluetoothConnected
  });
});

// File upload endpoint (WiFi)
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  const parsedPrivateMeta = parsePrivateUploadMetadata(req.body && req.body.privateMeta);
  if (parsedPrivateMeta.error) {
    cleanupUploadedFile(req.file.path);
    return res.status(400).json({ error: parsedPrivateMeta.error });
  }

  const privateMeta = parsedPrivateMeta.meta;
  const isPrivateUpload = Boolean(privateMeta);
  const displayName = isPrivateUpload ? privateMeta.originalName : req.file.originalname;
  const displaySize = isPrivateUpload ? privateMeta.originalSize : req.file.size;

  const fileInfo = registerTransfer({
    originalName: displayName,
    fileName: req.file.filename,
    size: displaySize,
    filePath: req.file.path,
    transferType: isPrivateUpload ? 'Private (E2E)' : 'WiFi',
    isPrivate: isPrivateUpload,
    encryption: privateMeta
  });
  const transferId = fileInfo.transferId;

  if (!isPrivateUpload) {
    // Broadcast public files to all clients.
    broadcastTransferStatus({
      type: 'file-uploaded',
      transferId,
      fileName: req.file.originalname,
      size: req.file.size,
      uploadTime: new Date(),
      transferType: 'WiFi'
    });
  }

  res.json({
    success: true,
    transferId,
    fileName: displayName,
    size: displaySize,
    transferType: fileInfo.transferType,
    isPrivate: fileInfo.isPrivate,
    encryption: fileInfo.isPrivate ? {
      algorithm: fileInfo.encryption.algorithm,
      salt: fileInfo.encryption.salt,
      iv: fileInfo.encryption.iv,
      iterations: fileInfo.encryption.iterations,
      mimeType: fileInfo.encryption.mimeType,
      originalSize: fileInfo.encryption.originalSize
    } : null
  });
});

// File download endpoint
app.get('/api/download/:transferId', (req, res) => {
  const { transferId } = req.params;
  const privateKeyDigest = getPrivateKeyDigest(req);
  console.log(`[DOWNLOAD] ${req.method} /api/download/${transferId} - headers:`, {
    referer: req.headers.referer,
    accept: req.headers.accept,
    authHeader: req.headers['x-auth-token'] || null,
    privateDigestPresent: Boolean(privateKeyDigest)
  });

  const fileInfo = activeTransfers.get(transferId);

  if (!fileInfo) {
    console.log(`[DOWNLOAD] File not found for transferId=${transferId}`);
    return res.status(404).json({ error: 'File not found' });
  }

  if (!canAccessPrivateFile(fileInfo, privateKeyDigest)) {
    return res.status(403).json({ error: 'Private sharing key is missing or invalid for this file' });
  }

  const filePath = fileInfo.path;

  if (!fs.existsSync(filePath)) {
    console.log(`[DOWNLOAD] File missing on disk: ${filePath}`);
    activeTransfers.delete(transferId);
    persistTransfersIndex();
    return res.status(404).json({ error: 'File not found on disk' });
  }

  if (fileInfo.isPrivate && fileInfo.encryption) {
    const encryptedName = fileInfo.originalName.endsWith('.enc')
      ? fileInfo.originalName
      : `${fileInfo.originalName}.enc`;
    res.setHeader('Content-Disposition', `attachment; filename="${encryptedName}"`);
    res.setHeader('X-Private-File', '1');
    res.setHeader('X-Private-Original-Name', encodeURIComponent(fileInfo.originalName));
    res.setHeader('X-Private-Original-Size', String(fileInfo.encryption.originalSize));
    res.setHeader('X-Private-Mime-Type', fileInfo.encryption.mimeType || 'application/octet-stream');
    res.setHeader('X-Private-Enc-Algorithm', fileInfo.encryption.algorithm);
    res.setHeader('X-Private-Enc-Salt', fileInfo.encryption.salt);
    res.setHeader('X-Private-Enc-Iv', fileInfo.encryption.iv);
    res.setHeader('X-Private-Enc-Iterations', String(fileInfo.encryption.iterations));
  } else {
    res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.originalName}"`);
  }
  res.setHeader('Content-Type', 'application/octet-stream');

  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);

  fileStream.on('error', (err) => {
    console.error('File stream error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'File download error' });
    }
  });
});

// Get list of available files
app.get('/api/files', (req, res) => {
  removeMissingTransfers();
  const files = [];
  const privateKeyDigest = getPrivateKeyDigest(req);
  
  activeTransfers.forEach((fileInfo, transferId) => {
    if (!fs.existsSync(fileInfo.path)) {
      return;
    }

    if (!canAccessPrivateFile(fileInfo, privateKeyDigest)) {
      return;
    }

    files.push(getClientFileView(fileInfo, transferId));
  });

  res.json({ files });
});

// Chunked upload for large files (Parallel WiFi)
// Create temporary storage for chunked uploads - increase limit to 500MB per chunk
const chunkStorage = multer.memoryStorage();
const chunkUpload = multer({ storage: chunkStorage, limits: { fileSize: 500 * 1024 * 1024 } });

app.post('/api/upload-chunk', chunkUpload.single('chunk'), (req, res) => {
  try {
    const { chunkIndex, totalChunks, fileId, fileName } = req.body;
    const chunk = req.file;

    if (!chunk) {
      return res.status(400).json({ error: 'No chunk provided' });
    }

    const chunkDir = path.join(UPLOAD_DIR, fileId);
    if (!fs.existsSync(chunkDir)) {
      fs.mkdirSync(chunkDir, { recursive: true });
    }

    const chunkPath = path.join(chunkDir, `chunk-${chunkIndex}`);
    
    // Write chunk file safely
    try {
      fs.writeFileSync(chunkPath, chunk.buffer);
    } catch (writeErr) {
      console.error(`Error writing chunk ${chunkIndex}:`, writeErr);
      return res.status(500).json({ error: `Failed to write chunk ${chunkIndex}` });
    }

    // Check if all chunks are uploaded
    const uploadedChunks = fs.readdirSync(chunkDir).length;
    console.log(`Chunk ${chunkIndex}/${totalChunks} uploaded. Total in dir: ${uploadedChunks}`);
    
    if (uploadedChunks === parseInt(totalChunks)) {
      // Merge chunks asynchronously
      console.log(`All chunks received for ${fileId}, merging...`);
      mergeChunks(fileId, fileName, totalChunks);
    }

    res.json({
      success: true,
      chunkIndex,
      uploadedChunks: uploadedChunks,
      totalChunks: parseInt(totalChunks)
    });
  } catch (error) {
    console.error('Chunk upload error:', error);
    res.status(500).json({ error: 'Chunk upload failed: ' + error.message });
  }
});

// Merge uploaded chunks - properly handle async stream operations
function mergeChunks(fileId, fileName, totalChunks) {
  try {
    const chunkDir = path.join(UPLOAD_DIR, fileId);
    const outputPath = path.join(UPLOAD_DIR, `${uuidv4()}-${fileName}`);
    
    console.log(`Merging ${totalChunks} chunks from ${chunkDir} to ${outputPath}`);

    // Set up finish handler BEFORE any writes
    const writeStream = fs.createWriteStream(outputPath, { flags: 'w' });
    let pendingWrites = 0;
    let allChunksQueued = false;
    let hasError = false;

    const finalize = () => {
      if (hasError || !allChunksQueued || pendingWrites > 0) {
        return;
      }

      console.log(`Merge completed for ${fileId}, cleaning up chunks...`);
      
      // Clean up chunk files
      try {
        for (let i = 0; i < totalChunks; i++) {
          const chunkPath = path.join(chunkDir, `chunk-${i}`);
          if (fs.existsSync(chunkPath)) {
            fs.unlinkSync(chunkPath);
          }
        }
        // Remove chunk directory
        if (fs.existsSync(chunkDir)) {
          fs.rmdirSync(chunkDir);
        }
      } catch (cleanupErr) {
        console.error('Cleanup error:', cleanupErr);
      }

      // Register the merged file
      try {
        const stats = fs.statSync(outputPath);
        const transferId = uuidv4();
        
        registerTransfer({
          transferId,
          originalName: fileName,
          fileName: path.basename(outputPath),
          size: stats.size,
          filePath: outputPath,
          uploadTime: new Date(),
          transferType: 'WiFi (Chunked)'
        });

        console.log(`File registered: ${fileName} (${stats.size} bytes)`);

        // Broadcast success
        broadcastTransferStatus({
          type: 'file-uploaded',
          transferId,
          fileName,
          size: stats.size,
          uploadTime: new Date(),
          transferType: 'WiFi (Chunked)'
        });
      } catch (statErr) {
        console.error('Error finalizing file:', statErr);
      }
    };

    writeStream.on('finish', finalize);

    writeStream.on('error', (err) => {
      console.error('Write stream error:', err);
      hasError = true;
      writeStream.destroy();
    });

    // Write chunks in order
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(chunkDir, `chunk-${i}`);
      
      if (!fs.existsSync(chunkPath)) {
        console.error(`Missing chunk file: ${chunkPath}`);
        hasError = true;
        writeStream.destroy();
        return;
      }

      try {
        const data = fs.readFileSync(chunkPath);
        pendingWrites++;
        
        const canContinue = writeStream.write(data);
        
        pendingWrites--;
        
        if (!canContinue) {
          writeStream.once('drain', () => {
            console.log(`Drain event received after chunk ${i}`);
          });
        }
        
        console.log(`Chunk ${i}/${totalChunks} written (size: ${data.length} bytes)`);
      } catch (readErr) {
        console.error(`Error reading chunk ${i}:`, readErr);
        hasError = true;
        writeStream.destroy();
        return;
      }
    }

    allChunksQueued = true;
    writeStream.end();
    console.log(`All chunks queued for write, ending stream...`);
  } catch (error) {
    console.error('Merge chunks error:', error);
  }
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Delete file endpoint - requires delete password
app.delete('/api/files/:transferId', (req, res) => {
  try {
    const { transferId } = req.params;
    const { password } = req.body;

    // Verify delete password
    if (password !== DELETE_PASSWORD) {
      return res.status(401).json({ error: 'Invalid delete password' });
    }

    const fileInfo = activeTransfers.get(transferId);

    if (!fileInfo) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete the file
    if (fs.existsSync(fileInfo.path)) {
      fs.unlinkSync(fileInfo.path);
    }

    // Remove from active transfers
    activeTransfers.delete(transferId);
    persistTransfersIndex();

    // Broadcast deletion
    broadcastTransferStatus({
      type: 'file-deleted',
      transferId,
      fileName: fileInfo.originalName
    });

    res.json({ success: true, message: 'File deleted' });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Share file endpoint - generate share link
app.get('/api/files/:transferId/share', (req, res) => {
  try {
    const { transferId } = req.params;
    const fileInfo = activeTransfers.get(transferId);

    if (!fileInfo) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (fileInfo.isPrivate) {
      return res.status(403).json({ error: 'Private files cannot be shared with public links' });
    }

    // Generate share URL with the transfer ID
    const shareUrl = `${req.protocol}://${req.get('host')}/share/${transferId}`;

    res.json({
      success: true,
      shareUrl,
      fileName: fileInfo.originalName,
      fileSize: fileInfo.size,
      transferId
    });
  } catch (error) {
    console.error('Share file error:', error);
    res.status(500).json({ error: 'Failed to generate share link' });
  }
});

// Share page endpoint
app.get('/share/:transferId', (req, res) => {
  try {
    const { transferId } = req.params;
    const fileInfo = activeTransfers.get(transferId);

    if (!fileInfo || !fs.existsSync(fileInfo.path)) {
      if (fileInfo) {
        activeTransfers.delete(transferId);
        persistTransfersIndex();
      }
      return res.status(404).send('File not found or has been deleted');
    }

    if (fileInfo.isPrivate) {
      return res.status(403).send('This file is private and requires a private sharing key inside the app.');
    }

    // Serve a share page
    const fileName = fileInfo.originalName;
    const fileSize = fileInfo.size;
    const formattedSize = formatFileSize(fileSize);

    const shareHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Download - ${fileName}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          .share-container {
            background: white;
            border-radius: 12px;
            padding: 40px;
            max-width: 500px;
            width: 100%;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
            text-align: center;
          }
          .file-icon {
            font-size: 64px;
            margin-bottom: 20px;
          }
          h1 {
            color: #333;
            margin-bottom: 10px;
            word-break: break-word;
          }
          .file-size {
            color: #666;
            font-size: 14px;
            margin-bottom: 30px;
          }
          .download-btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 14px 40px;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
            display: inline-block;
            text-decoration: none;
          }
          .download-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
          }
          .back-link {
            display: block;
            margin-top: 20px;
            color: #667eea;
            text-decoration: none;
            font-size: 14px;
          }
          .back-link:hover {
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <div class="share-container">
          <div class="file-icon">📦</div>
          <h1>${escapeHtml(fileName)}</h1>
          <div class="file-size">${formattedSize}</div>
          <a href="/share/${transferId}/download" class="download-btn">⬇️ Download File</a>
          <a href="/" class="back-link">← Back to Upload</a>
        </div>
      </body>
      </html>
    `;

    res.send(shareHtml);
  } catch (error) {
    console.error('Share page error:', error);
    res.status(500).send('Error loading shared file');
  }
});

// Public share-download endpoint (serves file directly without API auth)
app.get('/share/:transferId/download', (req, res) => {
  try {
    const { transferId } = req.params;
    console.log(`[SHARE DOWNLOAD] Request for transferId=${transferId} from ${req.ip}`);

    const fileInfo = activeTransfers.get(transferId);
    if (!fileInfo || !fs.existsSync(fileInfo.path)) {
      if (fileInfo) {
        activeTransfers.delete(transferId);
        persistTransfersIndex();
      }
      console.log(`[SHARE DOWNLOAD] File not available for ${transferId}`);
      return res.status(404).send('File not found or has been removed');
    }

    if (fileInfo.isPrivate) {
      return res.status(403).send('This file is private and cannot be downloaded from a public link.');
    }

    res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.originalName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');

    const stream = fs.createReadStream(fileInfo.path);
    stream.pipe(res);

    stream.on('error', (err) => {
      console.error('Share download stream error:', err);
      if (!res.headersSent) {
        res.status(500).send('Error downloading file');
      }
    });
  } catch (err) {
    console.error('Share download error:', err);
    res.status(500).send('Error processing download');
  }
});

// Utility function to escape HTML
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Utility function to format file size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n========================================`);
  console.log(`File Transfer Server Running`);
  console.log(`========================================`);
  console.log(`🌐 HTTP: http://localhost:${PORT}`);
  console.log(`\n📱 Access from other devices using:`);
  
  const networkInterfaces = os.networkInterfaces();
  const ips = [];
  for (const [name, interfaces] of Object.entries(networkInterfaces)) {
    interfaces.forEach(iface => {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
        console.log(`   http://${iface.address}:${PORT}`);
      }
    });
  }
  console.log(`\n✅ Recommended LAN URL: http://${getLocalIP()}:${PORT}`);
  
  // Register QR pairing endpoints
  registerQREndpoints(app);
  
  console.log(`\n📁 Upload Directory: ${UPLOAD_DIR}`);
  console.log(`⚡ WebSocket: ws://0.0.0.0:${PORT}`);
  console.log(`📱 QR Pairing Available at: http://0.0.0.0:${PORT}/api/qr/generate`);
  console.log(`========================================\n`);
  console.log(`✅ Server is accessible from all network interfaces!`);
});

module.exports = app;
