import { app, BrowserWindow, ipcMain, Notification, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'node:path';
import fs from 'node:fs';

app.setName('JoshOS');

const isDev = !app.isPackaged;
const dataFile = path.join(app.getPath('userData'), 'joshos-data.json');

// Layer-3 durable store, main-process side. `lastData` is cached on every save so
// the last-chance exit hooks (window close / before-quit / window-all-closed) can
// flush synchronously even if the renderer never got to. Ported from the
// prototype's main.js — this belt-and-suspenders is why data loss stopped.
let lastData: unknown = null;

function write(data: unknown): boolean {
  try {
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

let win: BrowserWindow | null = null;

function createWindow(): void {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'JoshOS',
    icon: path.join(__dirname, '../assets/icon.png'),
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: '#0a0a0a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (isDev && devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.once('ready-to-show', () => win?.show());
  // Flush cached state when the window is closing.
  win.on('close', () => {
    if (lastData) write(lastData);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
}

function registerIpc(): void {
  ipcMain.handle('load-data', () => {
    try {
      if (fs.existsSync(dataFile)) {
        const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
        lastData = parsed;
        return parsed;
      }
    } catch {
      /* fall through */
    }
    return null;
  });

  ipcMain.handle('save-data', (_e, data: unknown) => {
    lastData = data;
    return write(data);
  });

  // Synchronous save for the renderer's last-chance flush (beforeunload).
  ipcMain.on('save-data-sync', (e, data: unknown) => {
    lastData = data;
    write(data);
    e.returnValue = true;
  });

  ipcMain.handle(
    'show-notification',
    (_e, title: string, body: string, options?: { route?: string; silent?: boolean }) => {
      if (!Notification.isSupported()) return;
      const n = new Notification({ title, body, silent: options?.silent ?? false });
      n.on('click', () => {
        if (win) {
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
          if (options?.route) win.webContents.send('notification-click', options.route);
        }
      });
      n.show();
    },
  );

  ipcMain.handle('set-badge', (_e, count: number) => {
    if (process.platform === 'darwin') app.dock?.setBadge(count > 0 ? String(count) : '');
  });

  ipcMain.handle('get-version', () => app.getVersion());
  ipcMain.handle('open-external', (_e, url: string) => shell.openExternal(url));
}

// Single-instance lock — a second launch focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    registerIpc();
    createWindow();
    app.setAsDefaultProtocolClient('joshos');

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else win?.show();
    });

    if (!isDev) void autoUpdater.checkForUpdatesAndNotify();
  });

  // Deep link (joshos://…) → forward to the renderer.
  app.on('open-url', (_e, url) => {
    win?.webContents.send('deep-link', url);
  });

  // Two more nets under the persistence wire.
  app.on('before-quit', () => {
    if (lastData) write(lastData);
  });
  app.on('window-all-closed', () => {
    if (lastData) write(lastData);
    if (process.platform !== 'darwin') app.quit();
  });
}
