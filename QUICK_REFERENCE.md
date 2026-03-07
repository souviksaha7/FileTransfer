# 🎯 Quick Reference Card

## 🚀 One-Minute Setup

```bash
npm install && npm start
# Then open: http://localhost:3000
```

---

## 📱 Building for Each Platform

### Windows (.exe)
```bash
npm install
npm run electron-build
# Output: dist/*.exe
```
**Time:** 5 minutes  
**Skills:** None, works automatically

### Android (.apk)
```bash
npm install
npx cap init
npx cap add android
npm run android:build
# Output: android/app/build/outputs/apk/release/*.apk
```
**Time:** 30 minutes  
**Skills:** Need Android Studio

### QR Pairing
```bash
npm start
# Open: http://localhost:3000/qr-pairing.html
# Generate QR → Scan on other device → Auto-pair!
```
**Time:** Instant  
**Skills:** None

---

## 📚 Which Guide to Read?

| Want to... | Read This |
|-----------|-----------|
| Understand everything | [APPS_SETUP_COMPLETE.md](./APPS_SETUP_COMPLETE.md) |
| Build Windows app | [WINDOWS_BUILD.md](./WINDOWS_BUILD.md) |
| Build Android app | [ANDROID_SETUP.md](./ANDROID_SETUP.md) |
| See architecture | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| Review changes | [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) |
| Main guide | [BUILD_GUIDE.md](./BUILD_GUIDE.md) |

---

## 🎯 Most Common Tasks

### Task 1: Run Web Version
```bash
npm start
# Browser: http://localhost:3000
```

### Task 2: Test Windows App
```bash
npm run electron-dev
# Window opens automatically
```

### Task 3: Build Windows Installer
```bash
npm run electron-build
# Check dist/ folder for .exe files
```

### Task 4: Use QR Pairing
```bash
npm start
# Browser: http://localhost:3000/qr-pairing.html
```

### Task 5: Build Android APK
```bash
npm install
npx cap add android
npm run android:build
# Check android/app/build/outputs/ for .apk
```

---

## 🔗 Important URLs (When Running)

| What | URL |
|-----|-----|
| Main app | http://localhost:3000 |
| QR pairing | http://localhost:3000/qr-pairing.html |
| Login | http://localhost:3000/login.html |
| API health | http://localhost:3000/api/health |
| Network info | http://localhost:3000/api/network-info |

---

## 🔑 Default Credentials

| Use Case | Password |
|----------|----------|
| Web access | `Specxy` |
| File deletion | `zxc100@P` |

---

## 📂 Key File Locations

```
Your Project
├── public/qr-pairing.html           ← QR pairing UI
├── server.js                         ← Backend server
├── package.json                      ← Dependencies
├── electron-main.js                  ← Windows app
├── electron-builder.json             ← Windows config
├── capacitor.config.json             ← Android config
├── WINDOWS_BUILD.md                  ← Windows guide
├── ANDROID_SETUP.md                  ← Android guide
└── uploads/                          ← Uploaded files
```

---

## ⚡ Essential Commands

```bash
# Install
npm install

# Run
npm start                    (Web)
npm run electron-dev         (Windows test)
npm run android:debug        (Android test)

# Build
npm run electron-build       (Windows .exe)
npm run android:build        (Android .apk)

# Setup
node setup-apps.js           (Interactive)
node setup-windows.bat       (Windows)
```

---

## 🐛 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| Port 3000 in use | `netstat -ano \| findstr :3000` then kill |
| npm install fails | `npm cache clean --force` |
| Can't find Android SDK | Install Android Studio |
| Windows build huge | Normal - includes Node.js + Chromium |
| Can't scan QR code | Use manual IP entry instead |
| Devices won't connect | Check they're on same WiFi |

---

## 🎨 Customization

### Change App Name
```json
// In package.json
"name": "your-app-name"

// In electron-builder.json
"productName": "Your App Name"

// In capacitor.config.json
"appName": "Your App Name"
```

### Change Default Port
```bash
PORT=8080 npm start
```

### Change Passwords
```javascript
// In server.js
const WEBPAGE_PASSWORD = 'your-password';
const DELETE_PASSWORD = 'your-delete-password';
```

---

## 📊 What Gets Created

| Command | Output |
|---------|--------|
| `npm run electron-build` | `dist/Setup.exe` (installer) |
| `npm run electron-build` | `dist/Portable.exe` (no install) |
| `npm run android:build` | `android/app/build/outputs/apk/release/app-release.apk` |
| `npm start` | Server on port 3000 |

---

## 🎯 Feature Summary

✅ File upload/download  
✅ QR code pairing  
✅ Manual IP pairing  
✅ Windows desktop app  
✅ Android mobile app  
✅ Web browser version  
✅ Real-time updates  
✅ Multi-device support  
✅ Network detection  
✅ Password protected  

---

## 💾 Installation for Users

### Windows Users
1. Download `.exe` from your site
2. Run installer
3. App opens automatically
4. Share link via QR code

### Android Users
1. Download `.apk` file
2. Enable "Unknown Sources"
3. Tap to install
4. Scan QR to pair

### Web Users
1. Open in browser
2. Enter password
3. Use immediately

---

## 🚀 Release Checklist

Before distributing:

- ☐ Test all features
- ☐ Check network connectivity
- ☐ Verify QR code works
- ☐ Test file transfers
- ☐ Try on actual devices
- ☐ Create user guide
- ☐ Set up distribution method
- ☐ Get user feedback

---

## 📞 Getting Help

**For Windows:**
Read [WINDOWS_BUILD.md](./WINDOWS_BUILD.md)

**For Android:**
Read [ANDROID_SETUP.md](./ANDROID_SETUP.md)

**For Overview:**
Read [APPS_SETUP_COMPLETE.md](./APPS_SETUP_COMPLETE.md)

**For Architecture:**
Read [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## 🎓 Learning Path

```
Beginner → Intermediate → Advanced
    ↓           ↓             ↓
  npm      electron      signing &
 install    + build       distributing
              ↓
           android
            + build
```

---

## 💡 Pro Tips

1. **Test web first** before building
2. **Use QR pairing** for instant connection
3. **Keep port 3000** open in firewall
4. **Same WiFi required** for device pairing
5. **Sign Android APK** before distribution
6. **Use portable .exe** for quick testing
7. **Keep app updated** with latest Node modules

---

## 📈 Next Big Steps

1. `npm install` - Get dependencies
2. `npm start` - Test web version
3. Choose platform (Windows easier)
4. Build your installer/APK
5. Test on real devices
6. Distribute to users
7. Collect feedback
8. Iterate and improve

---

## ⏱️ Time Estimates

| Task | Time |
|------|------|
| Install dependencies | 2 min |
| Test web version | 1 min |
| Test Windows app | 2 min |
| Build Windows installer | 3 min |
| Setup Android | 10 min |
| Build Android APK | 20 min |
| **Total (all)** | **~38 minutes** |

---

## 🎉 You're Ready!

Everything is set up and ready to go.

**Start with:**
```bash
npm install && npm start
```

Then explore:
- Web version at `http://localhost:3000`
- QR pairing at `http://localhost:3000/qr-pairing.html`
- Desktop app with `npm run electron-dev`

**Happy building! 🚀**

---

**Version:** 1.0.0  
**Last Updated:** February 26, 2026  
**Status:** ✅ Complete
