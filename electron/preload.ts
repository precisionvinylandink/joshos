import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

/** Structurally matches the ambient JoshOSBridge (see global.d.ts). */
const bridge = {
  isElectron: true as const,
  isMac: process.platform === 'darwin',
  platform: process.platform,
  getVersion: (): Promise<string> => ipcRenderer.invoke('get-version'),

  // Layer-2/3 persistence bridge.
  loadData: (): Promise<unknown> => ipcRenderer.invoke('load-data'),
  saveData: (data: unknown): Promise<boolean> => ipcRenderer.invoke('save-data', data),
  saveDataSync: (data: unknown): boolean => ipcRenderer.sendSync('save-data-sync', data),

  showNotification: (
    title: string,
    body: string,
    options?: { route?: string; silent?: boolean },
  ): void => {
    void ipcRenderer.invoke('show-notification', title, body, options);
  },
  setBadge: (count: number): void => {
    void ipcRenderer.invoke('set-badge', count);
  },
  openExternal: (url: string): void => {
    void ipcRenderer.invoke('open-external', url);
  },

  onNavigate: (cb: (route: string) => void): (() => void) => {
    const h = (_e: IpcRendererEvent, route: string) => cb(route);
    ipcRenderer.on('navigate', h);
    return () => ipcRenderer.off('navigate', h);
  },
  onDeepLink: (cb: (url: string) => void): (() => void) => {
    const h = (_e: IpcRendererEvent, url: string) => cb(url);
    ipcRenderer.on('deep-link', h);
    return () => ipcRenderer.off('deep-link', h);
  },
  onNotificationClick: (cb: (route: string) => void): (() => void) => {
    const h = (_e: IpcRendererEvent, route: string) => cb(route);
    ipcRenderer.on('notification-click', h);
    return () => ipcRenderer.off('notification-click', h);
  },
};

contextBridge.exposeInMainWorld('joshOS', bridge);
