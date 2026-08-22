import { contextBridge, ipcRenderer } from 'electron';
import type { DashboardSnapshot, ExportRequest, MonitorSettings, VitalsApi } from '../src/shared/types';

const api: VitalsApi = {
  getSnapshot: () => ipcRenderer.invoke('vitals:getSnapshot'),
  setSettings: (settings: MonitorSettings) => ipcRenderer.invoke('vitals:setSettings', settings),
  setManualLogging: (enabled: boolean) => ipcRenderer.invoke('vitals:setManualLogging', enabled),
  addMarker: (message: string) => ipcRenderer.invoke('vitals:addMarker', message),
  exportRange: (range: ExportRequest) => ipcRenderer.invoke('vitals:exportRange', range),
  importJson: (content: string) => ipcRenderer.invoke('vitals:importJson', content),
  onSnapshot: (callback: (snapshot: DashboardSnapshot) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: DashboardSnapshot): void => callback(snapshot);
    ipcRenderer.on('vitals:snapshot', listener);
    return () => ipcRenderer.removeListener('vitals:snapshot', listener);
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    closeToTray: () => ipcRenderer.send('window:closeToTray'),
    quit: () => ipcRenderer.send('window:quit')
  }
};

contextBridge.exposeInMainWorld('vitals', api);
