import { app, dialog, ipcMain, Notification, systemPreferences } from 'electron';
import type { MessageBoxOptions, OpenDialogOptions, SaveDialogOptions } from 'electron';
import { AutoUpdaterManager } from './auto-updater';
import type { BackendManager } from './backend-manager';
import type { TrayManager, TrayState } from './tray-manager';
import { WindowManager } from './window-manager';
import type { AppStore } from './utils/store';
import { BACKEND_URL, BACKEND_WS_URL } from './utils/paths';

type IpcRegistrationOptions = {
  store: AppStore;
  windowManager: WindowManager;
  trayManager: TrayManager;
  backendManager: BackendManager;
  updater: AutoUpdaterManager;
  getPendingDeepLink: () => string | null;
  clearPendingDeepLink: () => void;
};

const STORE_PREFIXES = ['ui.', 'preferences.', 'tray.', 'updates.', 'window.'];

function assertStoreKey(key: string) {
  if (!STORE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    throw new Error(`Blocked store key: ${key}`);
  }
}

export function registerIpcHandlers({
  store,
  windowManager,
  trayManager,
  backendManager,
  updater,
  getPendingDeepLink,
  clearPendingDeepLink
}: IpcRegistrationOptions) {
  ipcMain.handle('app:get-config', () => ({
    version: app.getVersion(),
    platform: process.platform,
    isPackaged: app.isPackaged,
    backendUrl: BACKEND_URL,
    wsUrl: BACKEND_WS_URL
  }));

  ipcMain.handle('backend:get-state', () => backendManager.getState());
  ipcMain.handle('backend:restart', async () => {
    await backendManager.restartAndWait();
    return backendManager.getState();
  });

  ipcMain.handle('dialog:open', async (_event, options?: OpenDialogOptions) => {
    const browserWindow = windowManager.getMainWindow() ?? undefined;
    return browserWindow ? dialog.showOpenDialog(browserWindow, options ?? {}) : dialog.showOpenDialog(options ?? {});
  });

  ipcMain.handle('dialog:save', async (_event, options?: SaveDialogOptions) => {
    const browserWindow = windowManager.getMainWindow() ?? undefined;
    return browserWindow ? dialog.showSaveDialog(browserWindow, options ?? {}) : dialog.showSaveDialog(options ?? {});
  });

  ipcMain.handle('notifications:show', async (_event, payload: { title: string; body: string }) => {
    if (!Notification.isSupported()) {
      return { shown: false };
    }

    new Notification(payload).show();
    return { shown: true };
  });

  ipcMain.handle('window:is-maximized', () => windowManager.getMainWindow()?.isMaximized() ?? false);
  ipcMain.on('window:minimize', () => windowManager.minimizeMainWindow());
  ipcMain.on('window:maximize', () => windowManager.toggleMaximizeMainWindow());
  ipcMain.on('window:close', () => windowManager.closeMainWindow());
  ipcMain.on('window:hide', () => windowManager.hideMainWindow());
  ipcMain.on('window:show', () => windowManager.focusMainWindow());

  ipcMain.handle('store:get', (_event, key: string) => {
    assertStoreKey(key);
    return store.get(key) ?? null;
  });
  ipcMain.handle('store:set', (_event, key: string, value: unknown) => {
    assertStoreKey(key);
    store.set(key, value);
    return true;
  });
  ipcMain.handle('store:delete', (_event, key: string) => {
    assertStoreKey(key);
    store.delete(key);
    return true;
  });

  ipcMain.handle('tray:set-state', (_event, state: TrayState) => {
    trayManager.setState(state);
    return true;
  });

  ipcMain.handle('updates:check', async () => {
    await updater.checkForUpdates();
    return true;
  });
  ipcMain.handle('updates:install', () => {
    updater.quitAndInstall();
    return true;
  });

  ipcMain.handle('permissions:microphone', async () => {
    if (process.platform !== 'darwin') {
      return true;
    }

    const status = systemPreferences.getMediaAccessStatus('microphone');
    if (status === 'granted') {
      return true;
    }

    if (status === 'not-determined') {
      return systemPreferences.askForMediaAccess('microphone');
    }

    const browserWindow = windowManager.getMainWindow() ?? undefined;
    const dialogOptions: MessageBoxOptions = {
      type: 'warning',
      title: 'Microphone Access Needed',
      message: 'Lecture Lyft needs microphone access for real-time transcription.',
      detail: 'Enable microphone access in System Settings > Privacy & Security > Microphone.',
      buttons: ['OK']
    };
    if (browserWindow) {
      await dialog.showMessageBox(browserWindow, dialogOptions);
    } else {
      await dialog.showMessageBox(dialogOptions);
    }

    return false;
  });

  ipcMain.handle('deeplink:get-pending', () => {
    const route = getPendingDeepLink();
    clearPendingDeepLink();
    return route;
  });
}
