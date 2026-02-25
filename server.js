const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const compression = require('compression');
const os = require('os');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Configuration
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
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
  // Public routes that don't need authentication
  const publicRoutes = ['/api/login', '/api/health', '/api/auth-check'];
  
  if (publicRoutes.includes(req.path)) {
    return next();
  }
  
  // Check for auth token in query, body, or headers
  const authToken = req.query.token || req.body.token || req.headers['x-auth-token'];
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

  for (const [name, interfaces] of Object.entries(networkInterfaces)) {
    interfaces.forEach(iface => {
      if (iface.family === 'IPv4' && !iface.internal) {
        ipAddresses.push({
          interface: name,
          address: iface.address
        });
      }
    });
  }

  res.json({
    hostname: os.hostname(),
    port: PORT,
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

  const transferId = uuidv4();
  const fileInfo = {
    transferId,
    originalName: req.file.originalname,
    fileName: req.file.filename,
    size: req.file.size,
    path: req.file.path,
    uploadTime: new Date(),
    transferType: 'WiFi'
  };

  activeTransfers.set(transferId, fileInfo);

  // Broadcast to all clients
  broadcastTransferStatus({
    type: 'file-uploaded',
    transferId,
    fileName: req.file.originalname,
    size: req.file.size,
    uploadTime: new Date(),
    transferType: 'WiFi'
  });

  res.json({
    success: true,
    transferId,
    fileName: req.file.originalname,
    size: req.file.size
  });
});

// File download endpoint
app.get('/api/download/:transferId', (req, res) => {
  const { transferId } = req.params;
  console.log(`[DOWNLOAD] ${req.method} /api/download/${transferId} - headers:`, {
    referer: req.headers.referer,
    accept: req.headers.accept,
    authHeader: req.headers['x-auth-token'] || null
  });

  const fileInfo = activeTransfers.get(transferId);

  if (!fileInfo) {
    console.log(`[DOWNLOAD] File not found for transferId=${transferId}`);
    return res.status(404).json({ error: 'File not found' });
  }

  const filePath = fileInfo.path;

  if (!fs.existsSync(filePath)) {
    console.log(`[DOWNLOAD] File missing on disk: ${filePath}`);
    return res.status(404).json({ error: 'File not found on disk' });
  }

  res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.originalName}"`);
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
  const files = [];
  
  activeTransfers.forEach((fileInfo, transferId) => {
    if (fs.existsSync(fileInfo.path)) {
      files.push({
        transferId,
        name: fileInfo.originalName,
        size: fileInfo.size,
        uploadTime: fileInfo.uploadTime,
        transferType: fileInfo.transferType
      });
    }
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
        
        activeTransfers.set(transferId, {
          transferId,
          originalName: fileName,
          fileName: path.basename(outputPath),
          size: stats.size,
          path: outputPath,
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
      return res.status(404).send('File not found or has been deleted');
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
      console.log(`[SHARE DOWNLOAD] File not available for ${transferId}`);
      return res.status(404).send('File not found or has been removed');
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
  
  console.log(`\n📁 Upload Directory: ${UPLOAD_DIR}`);
  console.log(`⚡ WebSocket: ws://0.0.0.0:${PORT}`);
  console.log(`========================================\n`);
  console.log(`✅ Server is accessible from all network interfaces!`);
});

module.exports = app;
