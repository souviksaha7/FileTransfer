# 📱 Android & Windows App Build Guide

## Overview
Your File Transfer application can now be built as:
- ✅ **Windows Desktop App** (Electron)
- ✅ **Android App** (Capacitor)
- ✅ **QR Code Pairing System** for easy device connection

---

## Prerequisites

### For All Platforms
```bash
npm install
```

### For Windows Build
- Node.js 14+ and npm
- No additional software required (Electron is included)

### For Android Build
1. **Java Development Kit (JDK) 11+**
   - Download from: https://www.oracle.com/java/technologies/downloads/
   
2. **Android Studio**
   - Download from: https://developer.android.com/studio
   - During installation, select Android SDK
   
3. **Set Environment Variables**
   ```bash
   # Windows PowerShell (Run as Admin)
   $env:JAVA_HOME = "C:\Program Files\Java\jdk-11" # Adjust path
   $env:ANDROID_HOME = "C:\Users\[YourUsername]\AppData\Local\Android\Sdk"
   ```

4. **Verify Installations**
   ```bash
   java -version
   android --version
   ```

---

## 🖥️ Building for Windows

### Step 1: Prepare Package.json (Already Done ✓)
Your package.json now includes:
```json
{
  "main": "server.js",
  "homepage": "./",
  "scripts": {
    "electron": "electron .",
    "electron-dev": "concurrently \"npm start\" \"wait-on http://localhost:3000 && electron .\"",
    "electron-build": "electron-builder"
  }
}
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Test Electron App
```bash
npm run electron-dev
```
This will:
- Start the Node.js server on localhost:3000
- Launch Electron window with your app
- Allow you to test before building

### Step 4: Build Windows Installer
```bash
npm run electron-build
```

**Output Files:**
- `dist/File Transfer Pro Setup 1.0.0.exe` - Installer
- `dist/File Transfer Pro 1.0.0.exe` - Portable version

### Step 5: Install & Distribute
- Share the `.exe` file with users
- Users can install it like any Windows application
- App includes embedded Node.js server

---

## 📱 Building for Android

### Step 1: Prepare Capacitor
```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init
# Follow prompts (use existing app-id and name)
```

### Step 2: Add Android Platform
```bash
npx cap add android
```

### Step 3: Sync Files
```bash
npx cap sync android
```

### Step 4: Build APK

**Debug APK (for testing):**
```bash
npm run android:debug
```
- Installs directly to connected device
- Requires USB debugging enabled

**Release APK (for distribution):**
```bash
cd android
./gradlew assembleRelease
```
- Output: `android/app/build/outputs/apk/release/app-release.apk`
- Sign before distribution

### Step 5: Configure Build

Edit `capacitor.config.json`:
```json
{
  "appId": "com.filetransfer.app",
  "appName": "File Transfer Pro",
  "webDir": "public",
  "server": {
    "androidScheme": "https"
  }
}
```

---

## 🔗 QR Code Pairing System

### How It Works
1. **Generate QR Code:** Click "Generate QR Code" on one device
2. **Scan QR Code:** Scan with another device
3. **Auto Pair:** Devices connect automatically
4. **Manual IP Option:** Or enter IP:Port manually

### Access QR Pairing
Navigate to:
```
http://localhost:3000/qr-pairing.html
```

### API Endpoints
```javascript
// Generate QR Code
POST /api/qr/generate
Body: { deviceName: "My Device" }

// Pair by IP
POST /api/qr/pair-by-ip
Body: { ip: "192.168.1.100", port: 3000, clientId: "...", deviceName: "..." }

// Get Paired Devices
GET /api/qr/devices

// Get Network Info
GET /api/network-info

// Unpair Device
POST /api/qr/unpair
Body: { clientId: "..." }
```

---

## 📋 File Structure

```
FileTransfer/
├── server.js                    # Node.js backend
├── qr-pairing.js               # QR pairing logic
├── electron-main.js            # Windows app entry
├── electron-preload.js         # IPC bridge
├── electron-builder.json       # Build config
├── capacitor.config.json       # Android config
├── package.json                # Dependencies (updated)
├── public/
│   ├── app.js                  # Frontend logic
│   ├── index.html              # Main interface
│   ├── qr-pairing.html         # Pairing interface
│   └── styles.css
├── uploads/                    # File storage
└── android/                    # Capacitor Android files (auto-generated)
```

---

## 🔧 Quick Commands

```bash
# Install all dependencies
npm install

# Run web version (localhost:3000)
npm start

# Test Windows app
npm run electron-dev

# Build Windows app
npm run electron-build

# Setup Android
npx cap add android

# Test on Android device
npm run android:debug

# Build Android release
npm run android:build
```

---

## 🚀 Distribution

### Windows
1. Run `npm run electron-build`
2. Share `.exe` file from `dist/` folder
3. Users install like normal Windows app

### Android
1. Requires Google Play signing certificate
2. Build signed APK:
   ```bash
   cd android
   ./gradlew assembleRelease
   ```
3. Upload to Google Play Store or distribute APK directly

---

## 📝 Configuration

### Change App Name/Icon
**Windows:** Edit `electron-builder.json`
```json
{
  "productName": "Your App Name",
  "win": {
    "target": ["nsis", "portable"]
  }
}
```

**Android:** Edit `capacitor.config.json`
```json
{
  "appId": "com.yourcompany.appname",
  "appName": "Your App Name"
}
```

---

## ⚠️ Troubleshooting

### Windows Build Issues
```bash
# Clear cache
npm cache clean --force

# Reinstall dependencies
rm -r node_modules
npm install

# Try building again
npm run electron-build
```

### Android Build Issues
```bash
# Check Java version (should be 11+)
java -version

# Set correct paths
$env:JAVA_HOME = "Your Java path"
$env:ANDROID_HOME = "Your Android SDK path"

# Clean gradle
cd android
./gradlew clean
./gradlew assembleDebug
```

### Connection Issues
- Ensure all devices are on same WiFi network
- Check firewall isn't blocking port 3000
- Use IP pairing if QR doesn't work

---

## 🎯 Next Steps

1. ✅ Run `npm install` to get dependencies
2. ✅ Test with `npm start` on web
3. ✅ Test Windows with `npm run electron-dev`
4. ✅ Build Windows app with `npm run electron-build`
5. ✅ For Android: Follow Android setup section
6. ✅ Distribute built files

---

## 📞 Support

For issues:
1. Check QR pairing at `/qr-pairing.html`
2. Verify network connectivity
3. Check console logs for errors
4. Ensure proper port forwarding if behind firewall

---

**Version:** 1.0.0  
**Last Updated:** February 2026
