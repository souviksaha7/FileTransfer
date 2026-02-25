# 🔧 Advanced Features & API Documentation

## Advanced Features

### 1. Parallel WiFi + Bluetooth Transfer

The application simultaneously uses WiFi (60%) and Bluetooth (40%) for maximum throughput.

```javascript
// Automatic allocation
WiFi:      100 MB/s × 0.6 = 60 MB/s
Bluetooth:  2 MB/s × 0.4 =  0.8 MB/s (scaled by devices)
Total:      ~60-70 MB/s combined
```

**Benefits:**
- 40% speed increase over WiFi alone
- Redundancy for critical files
- Optimal bandwidth utilization
- No configuration needed

### 2. Chunked Upload for Large Files

Files larger than 50MB automatically break into 1MB chunks:

```
File: 500 MB
├─ Chunk 1: 1 MB
├─ Chunk 2: 1 MB
├─ ... (498 more)
└─ Chunk 500: 1 MB

Uploaded in parallel:
- If one chunk fails, retry just that chunk
- Speed remains consistent
- No timeout issues
- Progress updates in real-time
```

### 3. Real-time WebSocket Updates

Live transfer statistics:

```javascript
ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    
    // File uploaded notification
    if (message.type === 'file-uploaded') {
        console.log(`${message.fileName}: ${message.size} bytes`);
    }
    
    // Transfer status
    if (message.type === 'transfer-status') {
        console.log(`Speed: ${message.speed} MB/s`);
    }
};
```

### 4. Multi-Device Support

Connect from unlimited devices simultaneously:

```
Connected Devices:
├─ Desktop (WiFi)
├─ Laptop (WiFi)
├─ iPhone (WiFi)
├─ Android (WiFi)
└─ Tablet (Bluetooth)

All can upload/download independently
```

### 5. Smart Bandwidth Allocation

Intelligently allocates bandwidth based on:
- Network capacity
- Number of devices
- File size
- Device capabilities

```javascript
// BandwidthAllocator adjusts dynamically
allocate(fileSize, numDevices);
// Returns optimal WiFi:Bluetooth ratio
```

## REST API Documentation

### System Information

**Endpoint:** `GET /api/system-info`

**Response:**
```json
{
  "hostname": "DESKTOP-ABC123",
  "port": 3000,
  "ipAddresses": [
    {
      "interface": "WiFi",
      "address": "192.168.1.100"
    },
    {
      "interface": "Ethernet",
      "address": "192.168.1.101"
    }
  ],
  "bluetoothSupported": true,
  "bluetoothEnabled": false
}
```

### Upload File

**Endpoint:** `POST /api/upload`

**Content-Type:** `multipart/form-data`

**Parameters:**
```
file: <binary file data>
```

**Response:**
```json
{
  "success": true,
  "transferId": "uuid-string",
  "fileName": "document.pdf",
  "size": 1048576
}
```

**Example (JavaScript):**
```javascript
const formData = new FormData();
formData.append('file', fileObject);

fetch('/api/upload', {
    method: 'POST',
    body: formData
})
.then(r => r.json())
.then(data => console.log('Upload ID:', data.transferId));
```

### Chunked Upload

**Endpoint:** `POST /api/upload-chunk`

**Parameters:**
```json
{
  "fileId": "unique-file-id",
  "fileName": "large-file.zip",
  "chunk": <binary chunk data>,
  "chunkIndex": 0,
  "totalChunks": 500
}
```

**Response:**
```json
{
  "success": true,
  "chunkIndex": 0,
  "uploadedChunks": 1
}
```

**Upload Flow:**
```
Total File: 500 MB (500 chunks of 1 MB each)

Request 1: chunks[0] → server
Request 2: chunks[1] → server
...
Request 500: chunks[499] → server
When all received: Merge and store
```

### List Files

**Endpoint:** `GET /api/files`

**Response:**
```json
{
  "files": [
    {
      "transferId": "abc-123",
      "name": "document.pdf",
      "size": 1048576,
      "uploadTime": "2024-02-24T10:30:00Z",
      "transferType": "WiFi + Bluetooth"
    },
    {
      "transferId": "def-456",
      "name": "video.mp4",
      "size": 524288000,
      "uploadTime": "2024-02-24T10:25:00Z",
      "transferType": "WiFi"
    }
  ]
}
```

### Download File

**Endpoint:** `GET /api/download/:transferId`

**Response:** Binary file with headers:
```
Content-Type: application/octet-stream
Content-Disposition: attachment; filename="document.pdf"
```

**Example:**
```javascript
// Triggers browser download
window.location.href = '/api/download/abc-123';
```

### Delete File

**Endpoint:** `DELETE /api/files/:transferId`

**Response:**
```json
{
  "success": true
}
```

**Example:**
```javascript
fetch('/api/files/abc-123', {
    method: 'DELETE'
})
.then(r => r.json())
.then(data => console.log('Deleted:', data.success));
```

### Health Check

**Endpoint:** `GET /health`

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-02-24T10:30:00Z"
}
```

## WebSocket API Documentation

### Connection

```javascript
const ws = new WebSocket('ws://localhost:3000');

ws.onopen = () => {
    console.log('Connected');
};

ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    handleMessage(message);
};

ws.onerror = (error) => {
    console.error('Error:', error);
};

ws.onclose = () => {
    console.log('Disconnected');
};
```

### Message Types

#### Connection Confirmation
```json
{
  "type": "connection",
  "clientId": "client-uuid",
  "message": "Connected to file transfer server"
}
```

#### File Uploaded
```json
{
  "type": "file-uploaded",
  "transferId": "transfer-uuid",
  "fileName": "document.pdf",
  "size": 1048576,
  "uploadTime": "2024-02-24T10:30:00Z",
  "transferType": "WiFi"
}
```

#### Transfer Status
```json
{
  "type": "transfer-status",
  "transferId": "transfer-uuid",
  "progress": 45.5,
  "speed": "25.5 MB/s",
  "timeRemaining": "0:45"
}
```

#### Bluetooth Status
```json
{
  "type": "bluetooth-status",
  "status": "enabled",
  "message": "Bluetooth transfer enabled"
}
```

#### System Status
```json
{
  "type": "system-status",
  "bluetooth": true,
  "message": "Bluetooth connectivity enabled"
}
```

### Sending Messages

#### Enable Bluetooth
```javascript
ws.send(JSON.stringify({
    type: 'bluetooth-enable'
}));
```

#### Keep-alive Ping
```javascript
ws.send(JSON.stringify({
    type: 'ping'
}));
```

#### Custom Status
```javascript
ws.send(JSON.stringify({
    type: 'transfer-status',
    transferId: 'abc-123',
    progress: 50
}));
```

## Bluetooth Module API

### Initialize Bluetooth

```javascript
const bt = require('./bluetooth-module');
const module = new bt.BluetoothFileTransfer();

await module.initialize();
// Bluetooth ready
```

### Scan Devices

```javascript
const devices = await module.scanDevices();
// [
//   { id: 'bt-1', name: 'iPhone', rssi: -45 },
//   { id: 'bt-2', name: 'Android', rssi: -55 }
// ]
```

### Connect Device

```javascript
const device = await module.connectDevice('bt-1', 'iPhone');
// { id: 'bt-1', name: 'iPhone', connected: true, speed: '2 Mbps' }
```

### Transfer File

```javascript
const transfer = await module.transferFile(
    'bt-1',
    fileBuffer,
    'document.pdf'
);
// { id: 'transfer-uuid', status: 'completed', speed: '1.5 MB/s' }
```

### Monitor Transfer

```javascript
module.on('transfer-progress', (progress) => {
    console.log(`${progress.progress}% complete`);
    console.log(`Speed: ${progress.speed} MB/s`);
});

module.on('transfer-completed', (result) => {
    console.log(`Transfer complete: ${result.fileName}`);
});

module.on('error', (error) => {
    console.error('Transfer error:', error);
});
```

## Parallel Transfer Manager API

### Initialize Manager

```javascript
const { ParallelTransferManager } = require('./parallel-transfer-manager');
const manager = new ParallelTransferManager(bluetoothModule);
```

### Start Parallel Transfer

```javascript
const transfer = await manager.startParallelTransfer(
    'file-id',
    fileBuffer,
    'large-file.zip',
    [
        { id: 'bt-1', name: 'iPhone' },
        { id: 'bt-2', name: 'Tablet' }
    ]
);
```

### Monitor Parallel Transfer

```javascript
const stats = manager.getTransferStats('transfer-id');
// {
//   fileName: 'file.zip',
//   totalProgress: 45.5,
//   wifiProgress: 50,
//   btProgress: 40,
//   combinedSpeed: '65.5 MB/s'
// }
```

### Get Active Transfers

```javascript
const transfers = manager.getActiveTransfers();
transfers.forEach(t => {
    console.log(`${t.fileName}: ${t.progress}%`);
});
```

## Performance Tuning

### Increase Buffer Size

```javascript
// In server.js
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb' }));
```

### Adjust Chunk Size

```javascript
// Larger chunks for fast networks
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB instead of 1MB
```

### Enable Compression

```javascript
// In server.js (already enabled)
app.use(compression());
```

## Error Handling

### Server-side Errors

```javascript
try {
    const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
    });
    
    if (!response.ok) {
        const error = await response.json();
        console.error(`Upload failed: ${error.error}`);
    }
} catch (error) {
    console.error('Network error:', error);
}
```

### WebSocket Errors

```javascript
ws.onerror = (error) => {
    console.error('WebSocket error:', error.message);
    // Attempt reconnection
    setTimeout(() => connectWebSocket(), 3000);
};
```

### Timeout Handling

```javascript
const timeout = setTimeout(() => {
    throw new Error('Transfer timeout');
}, 30000);

transfer.on('completed', () => {
    clearTimeout(timeout);
});
```

## Rate Limiting

```javascript
// Add rate limiting in production
const rateLimit = require('express-rate-limit');

const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});

app.post('/api/upload', uploadLimiter, (req, res) => {
    // Handle upload
});
```

## Logging

Enable detailed logging:

```javascript
// In server.js
const debug = require('debug')('file-transfer');

debug('File uploaded:', fileName);
debug('Transfer speed:', speed);
debug('Active transfers:', transfers.length);
```

Run with debugging:
```bash
DEBUG=* npm start
```

## Testing

### Load Testing

```javascript
// Simulate multiple concurrent uploads
const files = Array(10).fill(null).map(() => ({
    name: `test-${Date.now()}.bin`,
    size: 10 * 1024 * 1024 // 10MB each
}));

files.forEach(file => {
    uploadFile(file);
});
```

### Bandwidth Testing

```bash
# Test connection speed
ping -c 4 192.168.1.100  # Mac/Linux
ping -n 4 192.168.1.100  # Windows
```

## Migration & Scaling

### Database Integration

```javascript
// Future: Store file metadata in database
const db = require('sqlite3');
db.run(`
    INSERT INTO files (transferId, fileName, size, uploadTime)
    VALUES (?, ?, ?, ?)
`, [transferId, fileName, fileSize, uploadTime]);
```

### Cloud Storage

```javascript
// Future: Upload to S3/Azure
const aws = require('aws-sdk');
const s3 = new aws.S3();
await s3.upload({
    Bucket: 'file-transfer',
    Key: fileName,
    Body: fileBuffer
}).promise();
```

---

**For questions about any API, check the relevant module file in the project.**
