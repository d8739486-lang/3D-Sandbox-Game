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

  // Открытие отдельного окна обновления в стиле CS2 без рамок и кнопок
  ipcMain.on('start-standalone-updater', () => {
    // 1. Закрываем главное окно игры
    if (mainWindow) {
      mainWindow.destroy();
      mainWindow = null;
    }

    // 2. Создаем специальное компактное окно без кнопок и рамок, которое нельзя закрыть
    const updaterWin = new BrowserWindow({
      width: 480,
      height: 220,
      resizable: false,
      frame: false,
      closable: false,
      alwaysOnTop: true,
      center: true,
      title: '3D Sandbox Updater',
      icon: path.join(__dirname, 'icon.png'),
      backgroundColor: '#111215',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    updaterWin.setMenu(null);

    const updaterPath = path.join(__dirname, 'dist', 'updater.html');
    const fallbackPath = path.join(__dirname, 'public', 'updater.html');
    if (fs.existsSync(updaterPath)) {
      updaterWin.loadFile(updaterPath);
    } else {
      updaterWin.loadFile(fallbackPath);
    }
  });

  // Системное уведомление Windows о завершении обновления
  ipcMain.on('updater-finished-notification', () => {
    try {
      const { Notification } = require('electron');
      if (Notification.isSupported()) {
        const notif = new Notification({
          title: '3D Sandbox',
          body: 'Обновление игры успешно завершено!',
          icon: path.join(__dirname, 'icon.png')
        });
        notif.show();
      }
    } catch (_) {}
  });

  // Полное закрытие приложения после отсчета 10 секунд
  ipcMain.on('updater-close-app', () => {
    app.quit();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
