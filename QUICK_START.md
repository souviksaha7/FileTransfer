# 📋 Quick Reference Guide

## File Structure
```
FileTransfer/
├── server.js                    # Main Express server
├── package.json                 # Dependencies
├── README.md                    # Feature documentation
├── SETUP.md                     # Installation guide (THIS FILE)
├── bluetooth-module.js          # Bluetooth transfer logic
├── parallel-transfer-manager.js # Parallel WiFi+BT transfers
├── config.json                  # Configuration file
├── start.bat                    # Windows startup script
├── start.sh                     # Unix startup script
├── uploads/                     # Uploaded files (auto-created)
└── public/
    ├── index.html              # Web UI
    ├── app.js                  # Frontend JavaScript
    └── styles.css              # Styling
```

## Command Cheat Sheet

### Installation & Setup
```bash
npm install              # Install all dependencies
npm start                # Start the server
node server.js           # Direct server start
node setup.js            # Run setup wizard
```

### Development
```bash
npm start                # Start server (auto-reload)
npm run dev              # Development mode (if configured)
```

### Network
```bash
ipconfig                 # Windows: find IP address
ifconfig                 # Mac/Linux: find IP address
netstat -ano | findstr :3000  # Windows: check port 3000
lsof -i :3000           # Mac/Linux: check port 3000
```

### Cleanup
```bash
rm -rf node_modules     # Remove dependencies (Mac/Linux)
rmdir /s node_modules   # Remove dependencies (Windows)
npm install             # Reinstall dependencies
```

## Browser Access

### Local Computer
```
http://localhost:3000
http://127.0.0.1:3000
```

### Other Devices on Network
```
http://192.168.x.x:3000
http://10.x.x.x:3000
```

Get your IP from the server startup output.

## Feature Quick Start

### Upload Files
1. Click upload area or drag & drop
2. Select one or multiple files
3. View progress in real-time
4. Files appear in "Shared Files" section

### Download Files
1. Find file in "Shared Files"
2. Click ⬇️ Download button
3. File downloads automatically
4. Check Downloads folder

### Enable Parallel Transfer
1. Click "Enable Bluetooth" button (right panel)
2. Indicator changes from 🔵 to 🟢
3. Next transfers use both channels
4. Speed increases by ~40%

### Monitor Transfers
- **Progress Bar**: Visual file transfer status
- **Speed**: Current MB/s
- **Time**: Remaining transfer time
- **Statistics**: Total uploads, size, avg speed

## Configuration Options

### Port Number
```javascript
// In server.js
const PORT = 3000; // Change this
```

### Upload Directory
```javascript
// In server.js
const UPLOAD_DIR = './uploads'; // Change this
```

### Maximum File Size
```javascript
// In server.js
limits: { fileSize: 100 * 1024 * 1024 * 1024 } // 100GB
```

### Chunk Size
```javascript
// In server.js
const CHUNK_SIZE = 1024 * 1024; // 1MB
```

## API Endpoints

### REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/system-info` | Get server info |
| POST | `/api/upload` | Upload file |
| GET | `/api/files` | List files |
| GET | `/api/download/:id` | Download file |
| DELETE | `/api/files/:id` | Delete file |

### WebSocket Events

```javascript
// Connect
ws = new WebSocket('ws://localhost:3000');

// Send
ws.send(JSON.stringify({
    type: 'bluetooth-enable'
}));

// Receive
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
};
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+C` | Stop server |
| `Ctrl+L` | Clear terminal |
| `Ctrl+R` | Refresh browser |
| `F12` | Developer tools |

## Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| Port already in use | Change PORT in server.js |
| Can't access from other device | Check firewall, use correct IP |
| Slow transfer | Enable Bluetooth, check network |
| Files not uploading | Check disk space, file size limit |
| Bluetooth not working | Enable on system, try WiFi only |

## Performance Tips

- **Enable Bluetooth** for 40% speed increase
- **Use 5GHz WiFi** for better connection
- **Large files** automatically use chunks
- **Multiple files** upload simultaneously
- **Close other apps** to maximize bandwidth

## Browser Compatibility

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome | ✓ Full | Best performance |
| Firefox | ✓ Full | Good support |
| Safari | ✓ Full | iOS compatible |
| Edge | ✓ Full | Windows 10/11 |
| Opera | ✓ Full | Alternative |
| IE | ✗ No | Use modern browser |

## Mobile Device Setup

### iOS (iPhone/iPad)
1. Connect to WiFi network
2. Open Safari
3. Type: `http://YOUR_IP:3000`
4. Allow access to Files if needed

### Android
1. Connect to WiFi network
2. Open any browser
3. Type: `http://YOUR_IP:3000`
4. Files download to Downloads folder

## Firewall Rules

### Windows
```bash
# Add firewall rule
netsh advfirewall firewall add rule name="FileTransfer" dir=in action=allow protocol=tcp localport=3000

# Remove firewall rule
netsh advfirewall firewall delete rule name="FileTransfer"
```

### Mac
1. System Preferences → Security & Privacy → Firewall Options
2. Add Node.js to allowed apps

### Linux (UFW)
```bash
sudo ufw allow 3000/tcp      # Allow port
sudo ufw delete allow 3000   # Deny port
```

## Monitoring

### Check Running Processes
```bash
# Windows
tasklist | findstr node

# Mac/Linux
ps aux | grep node
```

### Check Server Status
```bash
curl http://localhost:3000/health
```

### View Recent Activity
Check browser console (F12) for WebSocket messages.

## Backup & Restore

### Backup Uploaded Files
```bash
# Windows
xcopy uploads backup_uploads /E /I

# Mac/Linux
cp -r uploads uploads_backup
```

### Restore Files
```bash
# Windows
xcopy backup_uploads uploads /E /I /Y

# Mac/Linux
cp -r uploads_backup uploads
```

## Uninstall

### Remove Application
```bash
# Delete the entire FileTransfer folder
# Backup uploads/ folder first if needed
```

### Remove Node.js (optional)
- Windows: Control Panel → Uninstall Programs
- Mac: `/usr/local/bin/node`
- Linux: `sudo apt remove nodejs`

## Getting More Help

- **README.md** - Feature overview
- **SETUP.md** - Detailed installation
- **Browser Console** (F12) - Error messages
- **Terminal Output** - Server logs
- **GitHub Issues** - Ask community

## Environment Variables

```bash
# Set port
PORT=8080 npm start

# Set upload directory
UPLOAD_DIR=/custom/path npm start

# Set debug mode
DEBUG=* npm start
```

## Production Notes

For real-world deployment:
- [ ] Use HTTPS (SSL certificate)
- [ ] Add authentication
- [ ] Enable file encryption
- [ ] Set up backup system
- [ ] Monitor disk space
- [ ] Use process manager (PM2)
- [ ] Configure reverse proxy

## Support

For help or issues:
1. Check this guide
2. Review README.md
3. Check SETUP.md
4. Look at browser console (F12)
5. Review server terminal output

---

**Quick start: `npm install && npm start` then visit `http://localhost:3000`**
