# 🔄 System Architecture & Data Flow

## Network Connection Methods

```
┌────────────────────────────────────────────────────────────────┐
│                         WiFi Network                            │
│                      (192.168.x.x/24)                          │
│                                                                 │
│  ┌──────────────────┐                  ┌────────────────────┐  │
│  │  Windows PC      │                  │   Android Phone    │  │
│  │  (Electron App)  │                  │  (Capacitor App)   │  │
│  │                  │                  │                    │  │
│  │  localhost:3000  │◄────WebSocket───►│  localhost:3000    │  │
│  │                  │    + HTTP REST   │                    │  │
│  │  ┌────────────┐  │                  │  ┌──────────────┐  │  │
│  │  │ Node.js    │  │                  │  │ WebView      │  │  │
│  │  │ Server     │  │                  │  │ (Ionic)      │  │  │
│  │  └────────────┘  │                  │  └──────────────┘  │  │
│  │                  │                  │                    │  │
│  │  Files Upload    │                  │  File Download     │  │
│  │  QR Pairing      │                  │  QR Scanning       │  │
│  │  IP Connection   │                  │  IP Connection     │  │
│  └──────────────────┘                  └────────────────────┘  │
│         │                                       │                │
│         └───────────────┬──────────────────────┘                │
│                         │                                       │
│         Paired Devices (Map + WebSocket)                       │
│                                                                 │
└────────────────────────────────────────────────────────────────┘

Legend:
  ◄──► = Real-time Connection
  
Connection Methods:
  1. QR Code Pairing:  Device A generates QR → Device B scans → Auto-connect
  2. IP Manual:        User enters IP:Port manually
  3. Same Network:     Devices discover each other via mDNS (optional)
```

## Data Flow Diagram

```
File Transfer Flow:

┌─────────────────────────────────────────────────────────────────┐
│ Device A (Sender)                                               │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 1. User selects file                                        │ │
│ │    ↓                                                         │ │
│ │ 2. File read from disk                                      │ │
│ │    ↓                                                         │ │
│ │ 3. Split into 1MB chunks                                    │ │
│ │    ↓                                                         │ │
│ │ 4. Upload via HTTP POST /api/upload                         │ │
│ │    ↓                                                         │ │
│ │    [Progress: 10%, 25%, 50%, 75%, 100%]                    │ │
│ └─────────────────────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────────────────┘
                       │
              ┌────────▼────────┐
              │   Server/Node   │
              │   (localhost)   │
              │                 │
              │ • Receives file │
              │ • Stores in /   │
              │   uploads/      │
              │ • Generates ID  │
              │ • Broadcasts    │
              │   to all peers  │
              │                 │
              └────────┬────────┘
                       │
┌──────────────────────▼──────────────────────────────────────────┐
│ Device B (Receiver)                                             │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ 1. Receives notification via WebSocket                    │ │
│ │    {type: 'file-uploaded', fileName, size}                │ │
│ │    ↓                                                       │ │
│ │ 2. Shows file in list                                     │ │
│ │    ↓                                                       │ │
│ │ 3. User clicks download                                   │ │
│ │    ↓                                                       │ │
│ │ 4. Downloads via HTTP GET /api/download/:id              │ │
│ │    ↓                                                       │ │
│ │    [Progress: 10%, 25%, 50%, 75%, 100%]                  │ │
│ │    ↓                                                       │ │
│ │ 5. Saves to device storage/downloads                      │ │
│ └────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

## QR Code Pairing Flow

```
┌────────────────────────────────────────────────────────────────┐
│ Device A (QR Generator)                                         │
│                                                                 │
│  1. User clicks "Generate QR Code"                             │
│     ↓                                                           │
│  2. POST /api/qr/generate                                      │
│     ↓                                                           │
│  3. Server generates:                                          │
│     • Unique pairing code (UUID)                               │
│     • IP address + Port                                        │
│     • Device name                                              │
│     • 5-minute expiry                                          │
│     ↓                                                           │
│  4. Server converts to QR image (PNG)                          │
│     ↓                                                           │
│  5. Display QR on screen                                       │
│     ↓                                                           │
│     [QR Code with embedded JSON data]                          │
└─────────────────────┬──────────────────────────────────────────┘
                      │
           ┌──────────▼──────────┐
           │  Device B scans     │
           │  QR with camera     │
           │  or photo library   │
           └──────────┬──────────┘
                      │
┌─────────────────────▼──────────────────────────────────────────┐
│ Device B (Pairing)                                              │
│                                                                 │
│  1. Extract data from QR:                                      │
│     {                                                           │
│       id: "uuid-xxx",                                          │
│       deviceName: "My Windows PC",                             │
│       ip: "192.168.1.100",                                     │
│       port: 3000                                               │
│     }                                                           │
│     ↓                                                           │
│  2. POST /api/qr/pair with pairing code                        │
│     ↓                                                           │
│  3. Server validates:                                          │
│     • Code exists                                              │
│     • Not expired                                              │
│     ↓                                                           │
│  4. Server stores paired device:                               │
│     pairedDevices.set(clientId, device)                        │
│     ↓                                                           │
│  5. Device B now connected to Device A                         │
│     ↓                                                           │
│     ✓ Success! Can now transfer files                          │
└────────────────────────────────────────────────────────────────┘
```

## WebSocket Real-time Communication

```
Connected Clients:
  • Device A: WebSocket connection 1
  • Device B: WebSocket connection 2  
  • Device C: WebSocket connection 3

Message Broadcasting:

When Device A uploads a file:
  ├─ POST /api/upload (HTTP)
  │
  └─► Server processes file
      └─► broadcastTransferStatus({
            type: 'file-uploaded',
            fileName: 'document.pdf',
            size: 5242880,
            transferId: 'xxx'
          })
      
         Sends to ALL connected WebSockets:
         ├─ Device B WebSocket: receives message
         │   └─ Updates UI: Shows "File available for download"
         │
         ├─ Device C WebSocket: receives message
         │   └─ Updates UI: Shows "File available for download"
         │
         └─ Device A WebSocket: receives own message
             └─ Updates UI: Shows "File uploaded successfully"

Real-time Status Updates:

Device A          Device B          Device C
   │                 │                 │
   │ Upload starts   │                 │
   ├────────────────►│                 │
   │ {progress:0%}   │                 │
   ├────────────────►│ {progress:0%}   │
   │                 ├────────────────►│
   │ {progress:50%}  │                 │
   ├────────────────►│ {progress:50%}  │
   │                 ├────────────────►│
   │ {progress:100%} │                 │
   ├────────────────►│ {progress:100%} │
   │                 ├────────────────►│
   │ Transfer done   │                 │
   └─────────────────┴─────────────────┘
       All devices get real-time updates
```

## API Endpoints

```
Authentication:
  POST   /api/login               → Authenticate with password
  GET    /api/auth-check          → Check if authenticated

File Operations:
  POST   /api/upload              → Upload file (multipart/form-data)
  GET    /api/download/:id        → Download file
  GET    /api/files               → List uploaded files

QR Code Pairing:
  POST   /api/qr/generate         → Generate QR code
  POST   /api/qr/pair             → Pair device with QR code
  POST   /api/qr/pair-by-ip       → Pair device by IP address
  GET    /api/qr/devices          → Get list of paired devices
  POST   /api/qr/unpair           → Unpair a device
  GET    /api/network-info        → Get network information

System Info:
  GET    /api/system-info         → Get server info (IP, port, etc)
  GET    /api/health              → Check server health

WebSocket:
  ws://localhost:3000             → WebSocket connection for real-time updates
```

## Storage Structure

```
FileTransfer/
└── uploads/                    (Dynamic files)
    ├── [uuid]-filename.pdf      (User uploaded files)
    ├── [uuid]-image.jpg         (Automatically cleanup old files)
    └── [uuid]-video.mp4         (After download)

Cache/Temp:
└── node_modules/              (Dependencies)
    ├── express/
    ├── ws/
    ├── qrcode/
    └── ...

Configuration:
├── package.json               (Dependencies & scripts)
├── capacitor.config.json      (Android config)
└── electron-builder.json      (Windows build config)
```

## Authentication & Authorization

```
┌─────────────────────────────────────────────────────┐
│ Public Routes (No Auth Required)                    │
├─────────────────────────────────────────────────────┤
│  GET    /login.html          → Login page           │
│  POST   /api/login           → Submit password      │
│  GET    /api/auth-check      → Check auth status    │
│  GET    /api/health          → Health check         │
│  GET    /share/[link]        → Shared file link     │
│  GET    /api/download/[id]   → Download shared file │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Protected Routes (Auth Required)                    │
├─────────────────────────────────────────────────────┤
│ Headers: X-Auth-Token: [WEBPAGE_PASSWORD]          │
│                                                     │
│  GET    /                    → Main interface       │
│  GET    /index.html          → App homepage         │
│  POST   /api/upload          → Upload file          │
│  GET    /api/files           → List files           │
│  POST   /api/qr/generate     → Generate QR code     │
│  GET    /api/qr/devices      → Get paired devices   │
│  ... and all other API endpoints                   │
└─────────────────────────────────────────────────────┘

Password Config:
  WEBPAGE_PASSWORD = 'Specxy'       (Web interface access)
  DELETE_PASSWORD = 'zxc100@P'      (File deletion)
```

## Performance Optimization

```
Chunk-based Transfer:
  File Size: 100MB
  Chunk Size: 1MB
  
  ┌─────────────────────────────────────────┐
  │  [1MB] [1MB] [1MB] ... [1MB] [100KB]   │
  │  Chunk Chunk Chunk     Chunk Last       │
  │   1     2    3         100   101        │
  └─────────────────────────────────────────┘
  
  Benefits:
  • Resume support
  • Progress tracking  
  • Memory efficient
  • Network error recovery

Compression:
  • Response compression enabled (gzip)
  • Reduced bandwidth usage
  • Faster transfers
  
Caching:
  • Static files cached in browser
  • Reduced server load
  • Instant page loads
```

## Error Handling Flow

```
User Action
    │
    ▼
Network Request
    │
    ├─ Success (200)
    │   └─ Process response → Update UI
    │
    └─ Error
        │
        ├─ 400 Bad Request
        │   └─ Show: "Invalid input"
        │
        ├─ 401 Unauthorized
        │   └─ Show: "Please login"
        │
        ├─ 404 Not Found
        │   └─ Show: "File not found"
        │
        ├─ 500 Server Error
        │   └─ Show: "Server error, try again"
        │
        └─ Network Error (No connection)
            └─ Show: "Check network connection"
                     + Retry button
```

---

This architecture enables:
✅ Multiple devices on same network
✅ QR code auto-pairing
✅ Real-time file sharing
✅ Reliable transfers
✅ Security with authentication
✅ Cross-platform support (Web, Windows, Android)
