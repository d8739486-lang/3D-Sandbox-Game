const { app, BrowserWindow, Menu, ipcMain, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

// Оптимизация задержек ввода и графики (устранение инпут-лага)
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-gpu-program-cache');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-features', 'DawnGraphite,PersistentCache');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

// Уникальная папка для каждого сеанса
try {
  const sessionDataDir = path.join(app.getPath('temp'), `sandbox_run_${Date.now()}`);
  if (!fs.existsSync(sessionDataDir)) {
    fs.mkdirSync(sessionDataDir, { recursive: true });
  }
  app.setPath('userData', sessionDataDir);
} catch (_) {}

let mainWindow = null;
let updaterWindow = null;

function createMainWindow() {
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

function createUpdaterWindow() {
  if (updaterWindow) return;

  updaterWindow = new BrowserWindow({
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

  updaterWindow.setMenu(null);

  const updaterPath = path.join(__dirname, 'dist', 'updater.html');
  const fallbackPath = path.join(__dirname, 'public', 'updater.html');
  if (fs.existsSync(updaterPath)) {
    updaterWindow.loadFile(updaterPath);
  } else {
    updaterWindow.loadFile(fallbackPath);
  }

  updaterWindow.on('closed', () => {
    updaterWindow = null;
  });
}

app.whenReady().then(() => {
  // Напрямую открываем главное окно игры
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });

  // Открытие отдельного окна обновления в стиле CS2 без рамок и кнопок
  ipcMain.on('start-standalone-updater', () => {
    if (mainWindow) {
      mainWindow.destroy();
      mainWindow = null;
    }
    createUpdaterWindow();
  });

  // Запуск игры после завершения скачивания в апдейтере
  ipcMain.on('updater-finished-launch-game', () => {
    if (updaterWindow) {
      updaterWindow.destroy();
      updaterWindow = null;
    }
    createMainWindow();
  });

  // Запуск имитации / реальной загрузки при готовности окна апдейтера
  ipcMain.on('updater-ready', (event) => {
    const sender = event.sender;
    let progress = 0;
    const stages = [
      { at: 10, text: 'Проверка целостности компонентов...', detail: 'index.html, dist/assets/...' },
      { at: 35, text: 'Загрузка ассетов и моделей...', detail: 'nuke_bomb.glb (8.76 MB), tool_gun.glb (0.55 MB)...' },
      { at: 70, text: 'Синхронизация звуков и текстур...', detail: 'audio/sounds, maps/baseplate.png...' },
      { at: 90, text: 'Применение патча v1.0.8...', detail: 'Обновление конфигураций и скриптов...' },
      { at: 100, text: 'Завершено!', detail: 'Все файлы верифицированы' }
    ];

    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 8) + 4;
      if (progress > 100) progress = 100;

      const currentStage = stages.find(s => progress <= s.at) || stages[stages.length - 1];
      sender.send('updater-progress', {
        percent: progress,
        text: currentStage.text,
        detail: currentStage.detail
      });

      if (progress >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          sender.send('updater-complete', { seconds: 3 });
        }, 500);
      }
    }, 150);
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

  ipcMain.on('updater-finished-notification', () => {
    try {
      if (Notification.isSupported()) {
        new Notification({
          title: '3D Sandbox',
          body: 'Обновление игры успешно завершено!',
          icon: path.join(__dirname, 'icon.png')
        }).show();
      }
    } catch (_) {}
  });

  ipcMain.on('updater-close-app', () => {
    app.quit();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
