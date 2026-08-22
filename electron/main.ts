import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray } from 'electron';
import { MetricsDatabase } from './database';
import { VitalsMonitor } from './monitor';
import type { DashboardSnapshot, MonitorSettings } from '../src/shared/types';

let mainWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let database: MetricsDatabase | undefined;
let monitor: VitalsMonitor | undefined;
let quitting = false;
const hasSingleInstanceLock = app.requestSingleInstanceLock();
const startHidden = process.argv.includes('--hidden');
const supportSiteUrl = 'https://sorryneedboost.com';

function iconPath(file: string): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'assets', 'icons', file)
    : path.join(process.cwd(), 'assets', 'icons', file);
}

function userGuidePath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'docs', 'user-guide.html')
    : path.join(process.cwd(), 'docs', 'user-guide.html');
}

async function openUserGuide(): Promise<void> {
  const guidePath = userGuidePath();
  const error = await shell.openPath(guidePath);
  if (error) {
    dialog.showErrorBox('Unable to open the user guide', `${error}\n\nExpected file: ${guidePath}`);
  }
}

function getTrayImage(logging: boolean): Electron.NativeImage {
  const source = logging ? 'vitals-monitor-logging.png' : 'vitals-monitor.png';
  return nativeImage.createFromPath(iconPath(source)).resize({ width: 16, height: 16 });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1680,
    height: 960,
    minWidth: 1180,
    minHeight: 720,
    show: false,
    frame: false,
    title: 'Vitals Monitor',
    backgroundColor: '#1e1e1e',
    icon: iconPath('vitals-monitor.ico'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on('ready-to-show', () => {
    if (!startHidden || process.env.VITALS_QA_SCREENSHOT) {
      mainWindow?.show();
    }
    void captureQaScreenshot();
  });

  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

function createTray(): void {
  tray = new Tray(getTrayImage(false));
  tray.setToolTip('Vitals Monitor');
  tray.on('double-click', showMainWindow);
  rebuildTrayMenu();
}

function rebuildTrayMenu(snapshot?: DashboardSnapshot): void {
  if (!tray) {
    return;
  }
  const isLogging = snapshot?.state.isLogging ?? false;
  tray.setImage(getTrayImage(isLogging));
  tray.setToolTip(isLogging ? 'Vitals Monitor - logging metrics' : 'Vitals Monitor - monitoring');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Vitals Monitor', click: showMainWindow },
    {
      label: isLogging && snapshot?.state.loggingMode === 'manual' ? 'Stop Realtime Logging' : 'Start Realtime Logging',
      click: () => {
        void monitor?.setManualLogging(!(snapshot?.state.isLogging && snapshot.state.loggingMode === 'manual'));
      }
    },
    { label: 'User Guide', click: () => void openUserGuide() },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        quitting = true;
        app.quit();
      }
    }
  ]));
}

function showMainWindow(): void {
  if (!mainWindow) {
    createWindow();
  }
  mainWindow?.show();
  if (mainWindow?.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow?.focus();
}

async function captureQaScreenshot(): Promise<void> {
  const targetPath = process.env.VITALS_QA_SCREENSHOT;
  if (!targetPath || !mainWindow) {
    return;
  }
  const delay = Number(process.env.VITALS_QA_DELAY_MS ?? 2_500);
  await new Promise((resolve) => setTimeout(resolve, Number.isFinite(delay) ? delay : 2_500));
  const image = await mainWindow.capturePage();
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, image.toPNG());
  if (process.env.VITALS_QA_QUIT === '1') {
    quitting = true;
    app.quit();
  }
}

function broadcastSnapshot(snapshot: DashboardSnapshot): void {
  rebuildTrayMenu(snapshot);
  mainWindow?.webContents.send('vitals:snapshot', snapshot);
}

async function bootstrap(): Promise<void> {
  app.setAppUserModelId('com.vitalsmonitor.app');

  database = await MetricsDatabase.open(app.getPath('userData'));
  monitor = new VitalsMonitor(database);
  monitor.on('snapshot', broadcastSnapshot);

  await monitor.start();
  createWindow();
  createTray();
  broadcastSnapshot(monitor.getSnapshot());
}

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', showMainWindow);
  app.whenReady().then(() => {
    void bootstrap();
  });
}

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    showMainWindow();
  }
});

app.on('before-quit', () => {
  quitting = true;
  monitor?.stop();
  database?.close();
});

ipcMain.handle('vitals:getSnapshot', () => monitor?.getSnapshot());
ipcMain.handle('vitals:setSettings', (_event, settings: MonitorSettings) => monitor?.setSettings(settings));
ipcMain.handle('vitals:setManualLogging', (_event, enabled: boolean) => monitor?.setManualLogging(enabled));
ipcMain.handle('vitals:addMarker', (_event, message: string) => monitor?.addMarker(message));
ipcMain.handle('vitals:importJson', (_event, content: string) => monitor?.importJson(content));
ipcMain.handle('vitals:openUserGuide', () => openUserGuide());
ipcMain.handle('vitals:openSupportSite', () => shell.openExternal(supportSiteUrl));
ipcMain.handle('vitals:exportRange', async (_event, range: { from: number; to: number }) => {
  if (!monitor) {
    return { canceled: true };
  }
  const payload = monitor.exportRange(range.from, range.to);
  const options = {
    title: 'Export Vitals Monitor Data',
    defaultPath: `vitals-monitor-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  };
  const target = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options);
  if (target.canceled || !target.filePath) {
    return { canceled: true };
  }
  fs.writeFileSync(target.filePath, JSON.stringify(payload, null, 2), 'utf8');
  return { canceled: false, filePath: target.filePath };
});

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on('window:closeToTray', () => mainWindow?.hide());
ipcMain.on('window:quit', () => {
  quitting = true;
  app.quit();
});
