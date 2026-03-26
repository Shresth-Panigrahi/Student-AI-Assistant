import { app, dialog, Menu, session, systemPreferences } from 'electron';
import Store from 'electron-store';
import { AutoUpdaterManager } from './auto-updater';
import { BackendManager } from './backend-manager';
import { registerIpcHandlers } from './ipc-handlers';
import { buildAppMenu } from './menu-builder';
import { TrayManager } from './tray-manager';
import { WindowManager } from './window-manager';
import type { AppStore } from './utils/store';
import { BACKEND_URL, BACKEND_WS_URL } from './utils/paths';
import { createLogger } from './utils/logger';

const logger = createLogger('main');
const APP_PROTOCOL = 'lecturelyft';

app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

process.env.LECTURE_LYFT_BACKEND_URL = BACKEND_URL;
process.env.LECTURE_LYFT_WS_URL = BACKEND_WS_URL;

let pendingDeepLink: string | null = null;
let shutdownRequested = false;
const initialProtocolUrl = process.argv.find((arg) => arg.startsWith(`${APP_PROTOCOL}://`));

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
}

app.on('open-url', (event, urlString) => {
  event.preventDefault();
  handleDeepLink(urlString);
});

const store = new Store<Record<string, unknown>>({
  name: 'lecture-lyft'
}) as unknown as AppStore;

const windowManager = new WindowManager(store);
const backendManager = new BackendManager();
const trayManager = new TrayManager({
  onOpen: () => windowManager.focusMainWindow(),
  onHide: () => windowManager.hideMainWindow(),
  onQuit: () => app.quit(),
  onNavigateToSession: () => void windowManager.navigate('/session'),
  onCheckForUpdates: () => void updater.checkForUpdates()
});
const updater = new AutoUpdaterManager({
  sendToRenderer: (payload) => windowManager.send('updates:status', payload),
  notify: (title, body) => trayManager.showNotification(title, body)
});

function parseDeepLink(urlString: string) {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== `${APP_PROTOCOL}:`) {
      return null;
    }

    const host = parsed.hostname.toLowerCase();
    const routePath = parsed.pathname.replace(/\/+$/, '');

    if (host === 'session' && routePath) {
      return `/transcript${routePath}`;
    }

    if (host === 'record') {
      return '/session';
    }

    if (host === 'history') {
      return '/history';
    }

    if (host === 'dashboard') {
      return '/dashboard';
    }

    return routePath || '/';
  } catch {
    return null;
  }
}

function consumePendingDeepLink() {
  const route = pendingDeepLink;
  pendingDeepLink = null;
  return route;
}

async function requestMicrophoneAccess() {
  if (process.platform !== 'darwin') {
    return true;
  }

  const status = systemPreferences.getMediaAccessStatus('microphone');
  if (status === 'granted') {
    return true;
  }

  if (status === 'not-determined') {
    const granted = await systemPreferences.askForMediaAccess('microphone');
    if (granted) {
      return true;
    }
  }

  await dialog.showMessageBox({
    type: 'warning',
    title: 'Microphone Access Required',
    message: 'Lecture Lyft needs microphone access for live transcription.',
    detail: 'Enable microphone access in System Settings > Privacy & Security > Microphone.',
    buttons: ['OK']
  });

  return false;
}

function setupProtocolClient() {
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(APP_PROTOCOL, process.execPath, [process.argv[1]]);
    return;
  }

  app.setAsDefaultProtocolClient(APP_PROTOCOL);
}

function handleDeepLink(urlString: string) {
  const route = parseDeepLink(urlString);
  if (!route) {
    return;
  }

  if (windowManager.hasWindow()) {
    void windowManager.navigate(route);
    return;
  }

  pendingDeepLink = route;
}

function setupLifecycleHandlers() {
  app.on('second-instance', (_event, argv) => {
    const deepLink = argv.find((arg) => arg.startsWith(`${APP_PROTOCOL}://`));
    if (deepLink) {
      handleDeepLink(deepLink);
    }

    windowManager.focusMainWindow();
  });

  app.on('activate', () => {
    if (windowManager.hasWindow()) {
      windowManager.focusMainWindow();
      return;
    }

    void createMainWindowFlow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && !shutdownRequested) {
      app.quit();
    }
  });

  app.on('before-quit', (event) => {
    if (shutdownRequested) {
      return;
    }

    shutdownRequested = true;
    event.preventDefault();
    windowManager.setQuitting(true);

    void backendManager
      .stop()
      .catch((error) => {
        logger.error(error);
      })
      .finally(() => {
        trayManager.destroy();
        app.exit(0);
      });
  });
}

function setupSessionPermissions() {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    const audioRequested =
      permission === 'media' && 'mediaTypes' in details && Array.isArray(details.mediaTypes) && details.mediaTypes.includes('audio');
    callback(audioRequested);
  });
}

async function showStartupError(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  logger.error(detail);
  await dialog.showMessageBox({
    type: 'error',
    title: 'Lecture Lyft failed to start',
    message: 'The desktop shell could not finish booting.',
    detail,
    buttons: ['Quit']
  });
  app.quit();
}

async function createMainWindowFlow() {
  try {
    windowManager.createSplashWindow();
    windowManager.updateSplash('Requesting microphone permissions...', 12);
    await requestMicrophoneAccess();

    windowManager.updateSplash('Starting local AI backend...', 24);
    await backendManager.startAndWait((progress) => {
      windowManager.updateSplash(progress.message, progress.progress);
    });

    windowManager.updateSplash('Loading workspace...', 86);
    const route = consumePendingDeepLink() ?? ((store.get('ui.lastRoute') as string | undefined) ?? '/');
    await windowManager.createMainWindow(route);
    trayManager.create();
    updater.initialize();
    if (app.isPackaged) {
      void updater.checkForUpdates().catch((error) => logger.error(error));
    }
  } catch (error) {
    await showStartupError(error);
  }
}

async function bootstrap() {
  await app.whenReady();
  app.setAppUserModelId('com.lecturelyft.desktop');
  if (initialProtocolUrl) {
    handleDeepLink(initialProtocolUrl);
  }
  setupProtocolClient();
  setupSessionPermissions();
  setupLifecycleHandlers();

  backendManager.on('status', (state) => {
    if (state.state === 'ready') {
      trayManager.setState('idle');
    }

    windowManager.send('backend:status', state);
  });

  registerIpcHandlers({
    store,
    windowManager,
    trayManager,
    backendManager,
    updater,
    getPendingDeepLink: () => pendingDeepLink,
    clearPendingDeepLink: () => {
      pendingDeepLink = null;
    }
  });

  Menu.setApplicationMenu(buildAppMenu({ windowManager, updater }));
  await createMainWindowFlow();
}

void bootstrap();
