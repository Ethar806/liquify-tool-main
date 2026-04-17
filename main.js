const { app, BrowserWindow } = require('electron');
const path = require('path');
// Check native packaged state
const isDev = !app.isPackaged;

// 4. ENABLE GPU (IMPORTANT FOR PERFORMANCE)
app.commandLine.appendSwitch('enable-gpu');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-webgl2');

function createWindow() {
  // 3. CREATE WINDOW
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#121212', // dark theme support inherently
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  // 2. LOAD EXISTING APP
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    // Navigate strictly to the statically bundled NextJS export
    mainWindow.loadFile(path.join(__dirname, 'next-export', 'index.html'));
  }
  
  mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
