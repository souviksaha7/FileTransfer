# Network Access Setup Guide

## Problem
You cannot access the File Transfer application from another device using IP:PORT

## Solution

### Step 1: Enable Windows Firewall for Port 3000
**Important:** You need to run this as Administrator

#### Option A: Using the Batch File (Easiest)
1. Right-click `allow_firewall.bat` in the FileTransfer folder
2. Click "Run as administrator"
3. Press Enter to confirm
4. A command window will show "Firewall rules added!"

#### Option B: Manual PowerShell (Run as Administrator)
```powershell
# Run PowerShell as Administrator, then execute:
netsh advfirewall firewall add rule name="Allow Port 3000" dir=in action=allow protocol=tcp localport=3000
```

### Step 2: Verify Server is Running
The server should output something like:
```
========================================
File Transfer Server Running
========================================
🌐 HTTP: http://localhost:3000

📱 Access from other devices using:
   http://10.45.230.217:3000
   http://169.254.68.151:3000
   ... (other IPs)
```

### Step 3: Connect from Another Device
1. Go to `http://<YOUR_IP>:3000` where YOUR_IP is one of the addresses shown (e.g., `http://10.45.230.217:3000`)
2. Enter password: **Specxy**
3. Start using the file transfer app!

## Common Issues

### Still can't connect?
1. **Check if devices are on the same network**: Both devices must be connected to the same WiFi/Network
2. **Firewall not updated**: Try restarting the application after enabling firewall
3. **Windows Defender**: Check if Windows Defender is blocking Node.js
   - Go to Settings → Firewall & Network Protection → Allow an app through firewall
   - Find and enable "Node.js"
4. **Antivirus software**: Some antivirus software may block connections
   - Temporarily disable or add exception for port 3000

### Test connectivity:
From another device on the same network, open a terminal and try:
```
ping 10.45.230.217
curl http://10.45.230.217:3000
```

## Security Notes
- The server binds to all network interfaces (`0.0.0.0`) for maximum accessibility
- Password "Specxy" protects the webpage
- Password "zxc100@P" protects file deletion
- Only devices on the same network can access (limited by firewall/network)

## WebSocket for Real-time Updates
WebSocket also runs on port 3000. Once firewall is configured, it automatically works alongside HTTP.

