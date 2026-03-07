# Windows Desktop App Build Guide

## 🖥️ Prerequisites

### Minimum Requirements
- Windows 7 or later
- Node.js 14.0+ and npm
- 500MB free disk space
- Administrator privileges for installation

### Installation

**Install Node.js:**
1. Download from https://nodejs.org/
2. Choose LTS version
3. Run installer and follow prompts
4. Verify installation:
```bash
node --version
npm --version
```

**Verify npm is working:**
```bash
npm install -g npm@latest
```

## 🚀 Building the Windows App

### Quick Start (5 minutes)

```bash
# 1. Install all dependencies
npm install

# 2. Test the web version (optional)
npm start
# Then open http://localhost:3000 in browser

# 3. Test the Windows app
npm run electron-dev

# 4. Build Windows installer/portable
npm run electron-build

# Output files in dist/ folder:
# - File Transfer Pro Setup 1.0.0.exe (Installer)
# - File Transfer Pro 1.0.0.exe (Portable)
```

### Detailed Steps

#### Step 1: Install Dependencies
```bash
npm install
```
This installs:
- `express` - Web server
- `electron` - Desktop app framework
- `electron-builder` - Packaging tool
- `qrcode` - QR code generation
- Plus other required packages

#### Step 2: Test Electron App
```bash
npm run electron-dev
```

This command:
1. Starts the Node.js server (localhost:3000)
2. Opens Electron window with your app
3. Allows full testing before building

**What to test:**
- File upload/download
- QR code pairing (/qr-pairing.html)
- IP manual pairing
- Network connectivity

Press `Ctrl+C` to stop.

#### Step 3: Build for Distribution

**Standard Installer (Recommended):**
```bash
npm run electron-build
```

**Build specific target:**
```bash
# Installer only
npm run electron-build -- --win nsis

# Portable EXE only
npm run electron-build -- --win portable

# Both
npm run electron-build -- --win nsis portable
```

**Output Files:**
```
dist/
├── File Transfer Pro Setup 1.0.0.exe    (20-50MB - Installer)
├── File Transfer Pro 1.0.0.exe          (20-50MB - Portable)
├── builder-effective-config.yaml        (Config details)
└── ...
```

## ⚙️ Configuration

### Customization

**App Name, Version, Author:**
Edit `package.json`:
```json
{
  "name": "file-transfer-app",
  "version": "1.0.0",
  "author": "Your Name",
  "description": "Fast file transfer over WiFi and Bluetooth"
}
```

**Windows Build Settings:**
Edit `electron-builder.json`:
```json
{
  "build": {
    "appId": "com.filetransfer.app",
    "productName": "File Transfer Pro",
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true
    }
  }
}
```

### App Icon

1. Create a 512x512 PNG image
2. Convert to ICO format using online tool or:
```bash
# Using ImageMagick
convert icon.png -define icon:auto-resize=256,128,96,64,48,32,16 icon.ico
```

3. Place in `public/` folder as `icon.ico`
4. Update `electron-main.js`:
```javascript
icon: path.join(__dirname, 'public/icon.ico')
```

## 📦 Distribution Methods

### Method 1: Installer (.exe)
**Best for:** End users who want traditional installation
```bash
npm run electron-build
# Share: dist/File Transfer Pro Setup 1.0.0.exe
```

Users can:
- Choose installation directory
- Create Start Menu shortcuts
- Uninstall like normal Windows software
- Auto-update (optional with electron-updater)

### Method 2: Portable (.exe)
**Best for:** USB drives, quick testing
```bash
npm run electron-build -- --win portable
# Share: dist/File Transfer Pro 1.0.0.exe
```

Users can:
- Run directly from USB
- No installation required
- Works on any Windows PC

### Method 3: Direct Distribution
```bash
# Upload .exe to:
- GitHub Releases
- Your website
- OneDrive/Google Drive
- Windows Store (advanced)
```

## 🔐 Code Signing (Optional)

For production apps, sign your executable:

```bash
# Generate self-signed certificate
New-SelfSignedCertificate -Subject "CN=MyCompany" `
  -Type CodeSigningCert -CertStoreLocation "Cert:\CurrentUser\My"

# Use in electron-builder.json
{
  "win": {
    "certificateFile": "path/to/cert.pfx",
    "certificatePassword": "password",
    "signingHashAlgorithms": ["sha256"],
    "sign": "./scripts/sign.js"
  }
}
```

## 🐛 Troubleshooting

### Build Fails with "electron-builder not found"
```bash
npm cache clean --force
npm install electron-builder
npm run electron-build
```

### "Cannot find module" errors
```bash
# Clear and reinstall all dependencies
rmdir node_modules /s /q
npm install
npm run electron-build
```

### App doesn't start
1. Check console for errors: `Ctrl+Shift+I` in app
2. Verify port 3000 is available:
```bash
netstat -ano | findstr :3000
```

3. Kill process using port:
```bash
taskkill /PID [PID] /F
```

### Firewall blocking
1. Windows Defender Firewall → Allow app through firewall
2. Select "Node.js" in running apps
3. Check both Private and Public boxes

### High file size
Normal for Electron apps (40-60MB). Includes:
- Node.js runtime
- Chromium browser
- All dependencies

To reduce:
```bash
# In electron-builder.json
"build": {
  "asar": true,
  "files": [
    "!**/node_modules/*/{CHANGELOG.md,README.md}"
  ]
}
```

## 📝 Advanced Configuration

### Auto-Update
Install dependency:
```bash
npm install electron-updater
```

In `electron-main.js`:
```javascript
const { autoUpdater } = require('electron-updater');

app.on('ready', () => {
  autoUpdater.checkForUpdatesAndNotify();
});
```

### Custom Installer
Edit `electron-builder.json`:
```json
{
  "nsis": {
    "installerIcon": "public/icon.ico",
    "uninstallerIcon": "public/icon.ico",
    "installerHeader": "public/header.bmp",
    "installerSidebar": "public/sidebar.bmp",
    "oneClick": false,
    "allowToChangeInstallationDirectory": true
  }
}
```

### Multi-Platform Build
```bash
# Build for multiple OS
npm run electron-build -- --win --mac --linux
```

## 🚀 Release Checklist

Before releasing to users:

- [ ] Test app functionality completely
- [ ] Check all network features work
- [ ] Verify QR code pairing
- [ ] Test file transfers with large files
- [ ] Check firewall compatibility
- [ ] Try on multiple Windows versions
- [ ] Test installer and portable versions
- [ ] Create release notes
- [ ] Sign executable (if needed)
- [ ] Upload to distribution platform
- [ ] Test download and installation

## 📋 Common Commands

```bash
# Install dependencies
npm install

# Start web version (test)
npm start

# Test Electron app
npm run electron-dev

# Build Windows app
npm run electron-build

# Build and start immediately
npm run electron-dev

# Clear Electron cache
npm run electron -- --clear-cache

# Check for Electron updates
npm outdated electron
```

## 📊 Performance Tips

1. **Optimize bundles:**
```bash
npm install --save-dev webpack-bundle-analyzer
```

2. **Lazy load modules:**
- Load modules only when needed
- Don't require all modules upfront

3. **Server optimization:**
- Use compression (already enabled)
- Implement caching
- Optimize file transfers

4. **Memory management:**
- Clean up temporary files
- Monitor process memory
- Use streaming for large files

## 🎯 Next Steps

1. Run `npm install`
2. Test with `npm run electron-dev`
3. Build with `npm run electron-build`
4. Distribute the `.exe` files
5. Collect user feedback
6. Update and rebuild as needed

## 📞 Support Resources

- [Electron Documentation](https://www.electronjs.org/docs)
- [Electron Builder](https://www.electron.build/)
- [Node.js Documentation](https://nodejs.org/docs/)
- [Windows Development](https://docs.microsoft.com/en-us/windows/)

---

**Version:** 1.0.0  
**Last Updated:** February 2026

## Quick Reference Card

```
╔═══════════════════════════════════════════════════════════════╗
║         WINDOWS APP BUILD QUICK REFERENCE                     ║
╠═══════════════════════════════════════════════════════════════╣
║ Install:          npm install                                 ║
║ Test:             npm run electron-dev                        ║
║ Build:            npm run electron-build                      ║
║ Output:           dist/*.exe                                  ║
║ Config:           electron-builder.json                       ║
║ Web Test:         npm start → http://localhost:3000          ║
║ Pairing:          http://localhost:3000/qr-pairing.html      ║
╚═══════════════════════════════════════════════════════════════╝
```
