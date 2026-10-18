const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Полностью отключаем кэш Chromium на диске, чтобы никогда не было конфликтов блокировок
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-gpu-program-cache');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-features', 'DawnGraphite,PersistentCache');

// Уникальная папка для каждого сеанса, чтобы исключить "файл занят другим процессом"
try {
  const sessionDataDir = path.join(app.getPath('temp'), `sandbox_run_${Date.now()}`);
  if (!fs.existsSync(sessionDataDir)) {
    fs.mkdirSync(sessionDataDir, { recursive: true });
  }
  app.setPath('userData', sessionDataDir);
} catch (_) {}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    title: '3D Sandbox',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: true
    }
  });

  Menu.setApplicationMenu(null);
  mainWindow.maximize();

  const indexPath = path.join(__dirname, 'dist', 'index.html');
  mainWindow.loadFile(indexPath);

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[RENDERER CONSOLE]: ${message} (line ${line} in ${sourceId})`);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  ipcMain.on('win-minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on('win-maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on('win-close', () => {
    if (mainWindow) mainWindow.close();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
