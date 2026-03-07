const { app, BrowserWindow, Menu, dialog } = require('electron');
const isDev = require('electron-is-dev');
const path = require('path');
const { spawn } = require('child_process');
let mainWindow;
let serverProcess;

// Start Node.js server
function startServer() {
  return new Promise((resolve) => {
    console.log('Starting Node.js server...');
    serverProcess = spawn('node', ['server.js'], {
      cwd: app.getAppPath(),
      stdio: 'inherit'
    });

    serverProcess.on('error', (err) => {
      console.error('Failed to start server:', err);
    });

    // Wait a bit for server to start
    setTimeout(() => resolve(), 2000);
  });
}

// Create window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'electron-preload.js')
    },
    icon: path.join(__dirname, 'public/icon.png')
  });

  const startUrl = 'http://localhost:3000/';
  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

app.on('ready', async () => {
  await startServer();
  createWindow();
  createMenu();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('quit', () => {
  if (serverProcess) {
    console.log('Stopping server...');
    serverProcess.kill();
  }
});

// Create application menu
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (mainWindow) mainWindow.reload();
          }
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => {
            if (mainWindow) mainWindow.webContents.toggleDevTools();
          }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'File Transfer App',
              message: 'WiFi & Bluetooth File Transfer',
              detail: 'Transfer files simultaneously over WiFi and Bluetooth networks'
            });
          }
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = app;
