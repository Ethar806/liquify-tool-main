const { app, BrowserWindow } = require('electron');
const path = require('path');

// Detect if running packaged or in dev mode
const isDev = !app.isPackaged;

// GPU acceleration flags
app.commandLine.appendSwitch('enable-gpu');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-webgl2');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#121212',
    title: 'NAWLE',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Needed for local file loading (next-export assets)
    },
  });

  if (isDev) {
    // Development: load from Next.js dev server
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // Production: load from the static Next.js export bundled with the app.
    // electron-packager copies everything from the project root into resources/app/
    // so next-export/ will be at path.join(__dirname, 'next-export', 'index.html').
    const indexPath = path.join(__dirname, 'next-export', 'index.html');
    mainWindow.loadFile(indexPath).catch((err) => {
      console.error('Failed to load index.html:', err);
    });
  }

  mainWindow.on('closed', () => {
    // Dereference for GC
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
