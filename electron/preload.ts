import { contextBridge, ipcRenderer } from 'electron';

const subscribe = <T>(channel: string, listener: (payload: T) => void) => {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
};

contextBridge.exposeInMainWorld('lectureLyft', {
  config: {
    isElectron: true,
    platform: process.platform,
    backendUrl: process.env.LECTURE_LYFT_BACKEND_URL ?? 'http://127.0.0.1:8000',
    wsUrl: process.env.LECTURE_LYFT_WS_URL ?? 'ws://127.0.0.1:8000/ws'
  },
  app: {
    getConfig: () => ipcRenderer.invoke('app:get-config')
  },
  backend: {
    getState: () => ipcRenderer.invoke('backend:get-state'),
    restart: () => ipcRenderer.invoke('backend:restart')
    ,
    onStatus: (listener: (payload: unknown) => void) => subscribe('backend:status', listener)
  },
  dialog: {
    open: (options?: Electron.OpenDialogOptions) => ipcRenderer.invoke('dialog:open', options),
    save: (options?: Electron.SaveDialogOptions) => ipcRenderer.invoke('dialog:save', options)
  },
  notifications: {
    show: (payload: { title: string; body: string }) => ipcRenderer.invoke('notifications:show', payload)
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    hide: () => ipcRenderer.send('window:hide'),
    show: () => ipcRenderer.send('window:show'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onMaximizedChange: (listener: (payload: { isMaximized: boolean }) => void) => subscribe('window:maximized', listener)
  },
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),
    delete: (key: string) => ipcRenderer.invoke('store:delete', key)
  },
  tray: {
    setState: (state: 'idle' | 'recording' | 'processing') => ipcRenderer.invoke('tray:set-state', state)
  },
  updates: {
    check: () => ipcRenderer.invoke('updates:check'),
    install: () => ipcRenderer.invoke('updates:install'),
    onStatus: (listener: (payload: unknown) => void) => subscribe('updates:status', listener)
  },
  menu: {
    onAction: (listener: (payload: { action: string }) => void) => subscribe('menu:action', listener)
  },
  deepLink: {
    getPending: () => ipcRenderer.invoke('deeplink:get-pending'),
    onOpen: (listener: (payload: { route: string }) => void) => subscribe('deeplink:open', listener)
  },
  permissions: {
    requestMicrophone: () => ipcRenderer.invoke('permissions:microphone')
  }
});
