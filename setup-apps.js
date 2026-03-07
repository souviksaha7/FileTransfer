#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

async function setup() {
  console.log('\n🚀 File Transfer App - Setup Wizard\n');
  console.log('=' .repeat(50));

  // Step 1: Install dependencies
  console.log('\n📦 Step 1: Installing dependencies...');
  await new Promise(resolve => {
    exec('npm install', (error) => {
      if (error) {
        console.error('❌ npm install failed:', error.message);
      } else {
        console.log('✅ Dependencies installed');
      }
      resolve();
    });
  });

  // Step 2: Choose platform
  console.log('\n🖥️  Step 2: Select platforms to build for:');
  const buildWindows = await question('Build Windows app? (y/n): ');
  const buildAndroid = await question('Build Android app? (y/n): ');

  // Step 3: Windows setup
  if (buildWindows.toLowerCase() === 'y') {
    console.log('\n🖥️  Windows Setup:');
    console.log('Installing Electron dependencies...');
    await new Promise(resolve => {
      exec('npm install electron electron-builder concurrently wait-on', (error) => {
        if (error) console.error('⚠️ Electron install warning:', error.message);
        console.log('✅ Electron ready');
        resolve();
      });
    });
  }

  // Step 4: Android setup
  if (buildAndroid.toLowerCase() === 'y') {
    console.log('\n📱 Android Setup:');
    const hasAndroidStudio = await question('Do you have Android Studio installed? (y/n): ');
    
    if (hasAndroidStudio.toLowerCase() === 'y') {
      console.log('Installing Capacitor...');
      await new Promise(resolve => {
        exec('npm install @capacitor/core @capacitor/cli @capacitor/android', (error) => {
          if (error) console.error('⚠️ Capacitor install warning:', error.message);
          console.log('✅ Capacitor ready');
          resolve();
        });
      });

      console.log('\nInitializing Capacitor...');
      await new Promise(resolve => {
        exec('npx cap init', { stdio: 'inherit' }, (error) => {
          resolve();
        });
      });

      const addAndroid = await question('Add Android platform now? (y/n): ');
      if (addAndroid.toLowerCase() === 'y') {
        await new Promise(resolve => {
          exec('npx cap add android && npx cap sync android', (error) => {
            if (error) console.error('⚠️ Android setup warning:', error.message);
            console.log('✅ Android platform ready');
            resolve();
          });
        });
      }
    } else {
      console.log('\n⚠️ Please install Android Studio first:');
      console.log('Download from: https://developer.android.com/studio');
    }
  }

  // Step 5: Summary
  console.log('\n' + '='.repeat(50));
  console.log('\n✅ Setup Complete!\n');
  console.log('Next steps:');
  console.log('1. Test web version:   npm start');
  console.log('2. Test Windows app:   npm run electron-dev');
  console.log('3. Build Windows app:  npm run electron-build');
  console.log('4. Test Android app:   npm run android:debug');
  console.log('5. Access QR Pairing:  http://localhost:3000/qr-pairing.html');
  console.log('\nFor detailed instructions, see BUILD_GUIDE.md\n');

  rl.close();
}

setup().catch(console.error);
