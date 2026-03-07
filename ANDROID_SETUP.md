# Android App Configuration Guide

## 📱 Prerequisites

Before building the Android app, ensure you have:

### 1. Java Development Kit (JDK) 11+
```bash
# Download from: https://www.oracle.com/java/technologies/downloads/
# Or use Chocolatey:
choco install openjdk11

# Verify installation
java -version
```

### 2. Android Studio
```bash
# Download from: https://developer.android.com/studio
# Install and select Android SDK during setup
```

### 3. Android SDK
Open Android Studio → Tools → SDK Manager → Select:
- Android API Level 31+
- Build Tools 31.0.0+
- NDK (optional)

### 4. Set Environment Variables

**Windows (PowerShell as Admin):**
```powershell
[Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Java\jdk-11.0.x", "User")
[Environment]::SetEnvironmentVariable("ANDROID_HOME", "C:\Users\$env:USERNAME\AppData\Local\Android\Sdk", "User")
```

**Windows (Command Prompt as Admin):**
```cmd
setx JAVA_HOME "C:\Program Files\Java\jdk-11.0.x"
setx ANDROID_HOME "%USERPROFILE%\AppData\Local\Android\Sdk"
```

## 🚀 Build Steps

### Step 1: Initialize Capacitor
```bash
npx cap init
# Enter:
# App name: File Transfer Pro
# App ID: com.filetransfer.app
# Directory: public
```

### Step 2: Add Android Platform
```bash
npx cap add android
npx cap sync android
```

### Step 3: Open in Android Studio
```bash
# Option 1: From command line
npx cap open android

# Option 2: Open the android folder in Android Studio
# File > Open > Select android/ folder
```

### Step 4: Configure in Android Studio

1. **Select Build Variant**
   - Bottom left corner → Select "release" variant

2. **Configure Signing**
   - Build → Generate Signed Bundle/APK
   - Create new keystore or use existing
   - Fill in keystore details

3. **Build APK**
   - Build → Build Bundle(s)/APK(s) → Build APK(s)

### Step 5: Deploy

**To Device (Debug):**
```bash
npm run android:debug
# Requires USB debugging enabled
```

**To Play Store (Release):**
```bash
cd android
./gradlew assembleRelease
# Output: android/app/build/outputs/apk/release/app-release.apk
```

## 🔧 File Mappings

```
FileTransfer/
├── capacitor.config.json          ← App configuration
├── public/                        ← Web assets
│   ├── index.html
│   ├── app.js
│   ├── qr-pairing.html
│   └── styles.css
└── android/                       ← Generated Android project
    ├── app/
    │   ├── src/
    │   │   ├── main/
    │   │   │   ├── AndroidManifest.xml   ← Permissions
    │   │   │   └── res/
    │   │   │       └── values/
    │   │   │           └── strings.xml   ← App strings
    │   │   └── androidTest/
    │   └── build.gradle.kts
    └── build.gradle.kts
```

## 🔐 Required Android Permissions

Edit `android/app/src/main/AndroidManifest.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    
    <!-- Internet access for network transfers -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    
    <!-- WiFi access -->
    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
    <uses-permission android:name="android.permission.CHANGE_WIFI_STATE" />
    
    <!-- File storage -->
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
    
    <!-- Camera for QR code scanning (optional) -->
    <uses-permission android:name="android.permission.CAMERA" />
    
    <!-- Bluetooth (optional) -->
    <uses-permission android:name="android.permission.BLUETOOTH" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
    
    <application
        android:usesCleartextTraffic="true"
        ... >
    </application>
    
</manifest>
```

## 🎨 Customize App

### App Name
Edit `android/app/src/main/AndroidManifest.xml`:
```xml
<application
    android:label="@string/app_name"
    ...>
</application>
```

### App Icon
1. Right-click `android/app/src/main/res`
2. New → Image Asset
3. Select your app icon image
4. Click Next → Finish

### App Colors
Edit `android/app/src/main/res/values/styles.xml`:
```xml
<resources>
    <color name="colorPrimary">#667eea</color>
    <color name="colorPrimaryDark">#764ba2</color>
    <color name="colorAccent">#667eea</color>
</resources>
```

## 📦 Build Configuration

### In `build.gradle.kts`:

```gradle
android {
    compileSdkVersion 33
    
    defaultConfig {
        targetSdkVersion 33
        minSdkVersion 21
    }
    
    buildTypes {
        release {
            minifyEnabled true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```

## 🐛 Troubleshooting

### Build Fails
```bash
# Clear gradle cache
cd android && ./gradlew clean && cd ..

# Rebuild
npm run android:debug
```

### Java Version Error
```bash
# Update gradle wrapper
cd android && ./gradlew wrapper --gradle-version 7.6 && cd ..
```

### Cannot Connect to Device
```bash
# List connected devices
adb devices

# Enable USB debugging on device
# Settings → Developer Options → USB Debugging

# Reinstall app
adb uninstall com.filetransfer.app
npm run android:debug
```

### Network Issues
- Add to `capacitor.config.json`:
```json
{
  "server": {
    "androidScheme": "http",
    "hostname": "localhost"
  }
}
```

- Update `android/app/src/main/AndroidManifest.xml`:
```xml
<domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="true">localhost</domain>
    <domain includeSubdomains="true">192.168.1.0</domain>
</domain-config>
```

## 📝 Common Commands

```bash
# List SDK versions
sdkmanager --list

# Update dependencies
npx cap update android

# Sync changes
npx cap sync android

# Open in Android Studio
npx cap open android

# Build debug APK
npm run android:debug

# Build release APK
npm run android:build

# View device logs
adb logcat
```

## 🎯 Distribution

### Google Play Store
1. Create Google Play Developer account ($25 one-time)
2. Generate signed APK (see Build Steps)
3. Create app listing
4. Upload APK
5. Add description and images
6. Submit for review

### Direct Distribution
1. Generate signed APK
2. Share `.apk` file
3. Users enable "Unknown Sources" in Settings
4. Install directly

## 📖 Additional Resources

- [Capacitor Android Docs](https://capacitorjs.com/docs/android)
- [Android Developer Guide](https://developer.android.com/guide)
- [Google Play Console](https://play.google.com/console)
- [Android NDK](https://developer.android.com/ndk)

---

**Version:** 1.0.0  
**Last Updated:** February 2026
