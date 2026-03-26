```typescript
import { app, BrowserWindow, ipcMain, Tray, nativeImage } from 'electron';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { autoUpdater } from 'electron-updater';

// Backend process management
let backendProcess: ChildProcess | null = null;

function startBackend() {
  if (process.env.NODE_ENV === 'production') {
    // Spawn compiled binary in production
    backendProcess = spawn('./backend');
  } else {
    // Spawn Python script in development
    backendProcess = spawn('python', [path.join(__dirname, '../backend/main.py')]);
  }

  backendProcess.stdout.on('data', (data) => console.log(`Backend stdout: ${data.toString()}`));
  backendProcess.stderr.on('data', (data) => console.error(`Backend stderr: ${data.toString()}`));
  backendProcess.on('close', (code) => console.log(`Backend process exited with code ${code}`));

  // Health check
  setInterval(() => {
    if (!backendProcess || backendProcess.killed) {
      startBackend();
    }
  }, 10000);
}

// Tray icon management
let tray: Tray | null = null;

function createTray() {
  const iconPath = path.join(__dirname, '../resources/icon.png');
  tray = new Tray(nativeImage.createFromPath(iconPath));
  tray.setToolTip('Lecture Lyft');

  tray.on('click', () => mainWindow?.show());
}

// Main window management
let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      enableRemoteModule: false,
    },
    show: false,
    vibrancy: process.platform === 'darwin' ? 'under-window' : undefined,
  });

  mainWindow.loadFile(path.join(__dirname, '../webapp/dist/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC handlers
ipcMain.on('quit-app', () => {
  app.quit();
});

ipcMain.on('minimize-app', () => {
  mainWindow?.minimize();
});

ipcMain.on('show-app', () => {
  mainWindow?.show();
});

ipcMain.on('hide-app', () => {
  mainWindow?.hide();
});

// App events
app.whenReady().then(() => {
  createWindow();
  createTray();
  startBackend();

  if (process.platform === 'darwin') {
    app.dock.setIcon(path.join(__dirname, '../resources/icon.icns'));
  }

  app.on('activate', () => {
    mainWindow?.show();
  });

  autoUpdater.checkForUpdatesAndNotify();
}).catch((error) => console.error(error));

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Auto updater
autoUpdater.on('update-downloaded', () => {
  mainWindow?.webContents.send('update-available');
});

autoUpdater.on('update-not-available', () => {
  mainWindow?.webContents.send('update-not-available');
});
```

