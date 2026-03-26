import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BrowserWindow, shell, screen } from 'electron';
import type { BrowserWindowConstructorOptions } from 'electron';
import { createLogger } from './utils/logger';
import type { AppStore } from './utils/store';
import { BACKEND_URL, getAppIconPath, getDevServerUrl, getPreloadPath, getRendererHtmlPath, isDevelopment } from './utils/paths';

type WindowState = {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized: boolean;
};

const logger = createLogger('window');
const DEFAULT_ROUTE = '/';

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private splashWindow: BrowserWindow | null = null;
  private isQuitting = false;
  private pendingRoute: string | null = null;
  private persistTimer: NodeJS.Timeout | null = null;

  constructor(private readonly store: AppStore) {}

  setQuitting(value: boolean) {
    this.isQuitting = value;
  }

  hasWindow() {
    return Boolean(this.mainWindow);
  }

  getMainWindow() {
    return this.mainWindow;
  }

  createSplashWindow() {
    if (this.splashWindow) {
      return this.splashWindow;
    }

    this.splashWindow = new BrowserWindow({
      width: 440,
      height: 300,
      show: true,
      frame: false,
      resizable: false,
      movable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      backgroundColor: '#060814',
      roundedCorners: true,
      webPreferences: {
        sandbox: true
      }
    });

    this.splashWindow.removeMenu();
    this.splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(this.splashHtml())}`);

    return this.splashWindow;
  }

  async createMainWindow(initialRoute?: string) {
    if (this.mainWindow) {
      this.focusMainWindow();
      return this.mainWindow;
    }

    const windowState = this.getWindowState();
    const options = this.resolveWindowOptions(windowState);

    this.mainWindow = new BrowserWindow(options);
    this.mainWindow.setMenuBarVisibility(false);

    this.mainWindow.on('ready-to-show', () => {
      this.mainWindow?.show();
      this.mainWindow?.focus();
      void this.closeSplashWindow();
    });

    this.mainWindow.on('move', () => this.scheduleStatePersist());
    this.mainWindow.on('resize', () => this.scheduleStatePersist());
    this.mainWindow.on('maximize', () => {
      this.scheduleStatePersist();
      this.send('window:maximized', { isMaximized: true });
    });
    this.mainWindow.on('unmaximize', () => {
      this.scheduleStatePersist();
      this.send('window:maximized', { isMaximized: false });
    });
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
    this.mainWindow.on('close', (event) => {
      this.persistWindowState();

      if (process.platform === 'darwin' && !this.isQuitting) {
        event.preventDefault();
        this.mainWindow?.hide();
      }
    });

    this.mainWindow.webContents.on('did-finish-load', () => {
      if (this.pendingRoute) {
        this.send('deeplink:open', { route: this.pendingRoute });
        this.pendingRoute = null;
      }
    });

    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (this.isInternalUrl(url)) {
        return { action: 'allow' };
      }

      void shell.openExternal(url);
      return { action: 'deny' };
    });

    this.mainWindow.webContents.on('will-navigate', (event, url) => {
      if (this.isInternalUrl(url)) {
        return;
      }

      event.preventDefault();
      void shell.openExternal(url);
    });

    await this.loadRenderer(initialRoute ?? this.getLastRoute());
    return this.mainWindow;
  }

  focusMainWindow() {
    if (!this.mainWindow) {
      return;
    }

    if (this.mainWindow.isMinimized()) {
      this.mainWindow.restore();
    }

    this.mainWindow.show();
    this.mainWindow.focus();
  }

  hideMainWindow() {
    this.mainWindow?.hide();
  }

  minimizeMainWindow() {
    this.mainWindow?.minimize();
  }

  toggleMaximizeMainWindow() {
    if (!this.mainWindow) {
      return;
    }

    if (this.mainWindow.isMaximized()) {
      this.mainWindow.unmaximize();
    } else {
      this.mainWindow.maximize();
    }
  }

  closeMainWindow() {
    this.mainWindow?.close();
  }

  async navigate(route: string) {
    if (!this.mainWindow) {
      this.pendingRoute = route;
      return;
    }

    this.pendingRoute = null;
    this.focusMainWindow();
    this.send('deeplink:open', { route });
  }

  send(channel: string, payload: unknown) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return;
    }

    this.mainWindow.webContents.send(channel, payload);
  }

  updateSplash(status: string, progress: number) {
    if (!this.splashWindow || this.splashWindow.isDestroyed()) {
      return;
    }

    const escapedStatus = JSON.stringify(status);
    const safeProgress = Math.max(0, Math.min(100, progress));
    void this.splashWindow.webContents
      .executeJavaScript(
        `
          const status = document.getElementById('status');
          const progress = document.getElementById('progress');
          const label = document.getElementById('progress-label');
          if (status) status.textContent = ${escapedStatus};
          if (progress) progress.style.width = '${safeProgress}%';
          if (label) label.textContent = '${safeProgress}%';
        `,
        true
      )
      .catch(() => undefined);
  }

  async closeSplashWindow() {
    if (!this.splashWindow || this.splashWindow.isDestroyed()) {
      return;
    }

    const splash = this.splashWindow;
    this.splashWindow = null;

    await splash.webContents
      .executeJavaScript("document.body.classList.add('closing')", true)
      .catch(() => undefined);

    setTimeout(() => {
      if (!splash.isDestroyed()) {
        splash.close();
      }
    }, 220);
  }

  private resolveWindowOptions(state: WindowState): BrowserWindowConstructorOptions {
    const display = this.getDisplayForState(state);
    const bounds = display.workArea;
    const x = typeof state.x === 'number' ? state.x : Math.round(bounds.x + (bounds.width - state.width) / 2);
    const y = typeof state.y === 'number' ? state.y : Math.round(bounds.y + (bounds.height - state.height) / 2);

    return {
      width: state.width,
      height: state.height,
      x,
      y,
      minWidth: 1100,
      minHeight: 760,
      show: false,
      backgroundColor: '#060814',
      title: 'Lecture Lyft',
      icon: getAppIconPath(),
      frame: process.platform === 'darwin',
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
      trafficLightPosition: process.platform === 'darwin' ? { x: 18, y: 16 } : undefined,
      vibrancy: process.platform === 'darwin' ? 'under-window' : undefined,
      visualEffectState: process.platform === 'darwin' ? 'active' : undefined,
      backgroundMaterial: process.platform === 'win32' ? 'acrylic' : undefined,
      autoHideMenuBar: process.platform !== 'darwin',
      webPreferences: {
        preload: getPreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        devTools: isDevelopment(),
        backgroundThrottling: false,
        spellcheck: false
      }
    };
  }

  private async loadRenderer(route: string) {
    if (!this.mainWindow) {
      return;
    }

    const hashRoute = this.normalizeRoute(route);

    if (isDevelopment()) {
      await this.mainWindow.loadURL(`${getDevServerUrl()}#${hashRoute}`);
    } else {
      await this.mainWindow.loadFile(getRendererHtmlPath(), {
        hash: hashRoute
      });
    }

    const windowState = this.getWindowState();
    if (windowState.isMaximized) {
      this.mainWindow.maximize();
    }
  }

  private normalizeRoute(route: string) {
    if (!route || route === '#') {
      return DEFAULT_ROUTE;
    }

    return route.startsWith('/') ? route : `/${route.replace(/^#/, '')}`;
  }

  private getWindowState(): WindowState {
    const stored = (this.store.get('window.state') as WindowState | undefined) ?? {
      width: 1440,
      height: 920,
      isMaximized: false
    };

    return {
      width: stored.width ?? 1440,
      height: stored.height ?? 920,
      x: stored.x,
      y: stored.y,
      isMaximized: stored.isMaximized ?? false
    };
  }

  private persistWindowState() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return;
    }

    const bounds = this.mainWindow.getBounds();
    this.store.set('window.state', {
      ...bounds,
      isMaximized: this.mainWindow.isMaximized()
    });
  }

  private scheduleStatePersist() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }

    this.persistTimer = setTimeout(() => this.persistWindowState(), 250);
  }

  private getDisplayForState(state: WindowState) {
    if (typeof state.x !== 'number' || typeof state.y !== 'number') {
      return screen.getPrimaryDisplay();
    }

    return screen.getDisplayNearestPoint({
      x: state.x,
      y: state.y
    });
  }

  private getLastRoute() {
    return (this.store.get('ui.lastRoute') as string | undefined) ?? DEFAULT_ROUTE;
  }

  private isInternalUrl(url: string) {
    if (isDevelopment()) {
      return url.startsWith(getDevServerUrl()) || url.startsWith(BACKEND_URL);
    }

    return url.startsWith('file://') || url.startsWith(BACKEND_URL);
  }

  private splashHtml() {
    const iconPath = pathToFileURL(path.join(getAppIconPath())).toString();
    return `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            :root {
              color-scheme: dark;
              --bg: #060814;
              --panel: rgba(17, 24, 39, 0.88);
              --border: rgba(148, 163, 184, 0.18);
              --accent: linear-gradient(90deg, #8b5cf6, #ec4899 52%, #22c55e);
              --text: #f8fafc;
              --muted: #94a3b8;
            }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              min-height: 100vh;
              display: grid;
              place-items: center;
              background:
                radial-gradient(circle at top left, rgba(99, 102, 241, 0.28), transparent 42%),
                radial-gradient(circle at bottom right, rgba(236, 72, 153, 0.18), transparent 46%),
                var(--bg);
              color: var(--text);
              font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
              transition: opacity 0.18s ease, transform 0.18s ease;
            }
            body.closing {
              opacity: 0;
              transform: scale(0.98);
            }
            .card {
              width: calc(100vw - 48px);
              max-width: 380px;
              padding: 28px;
              background: var(--panel);
              border: 1px solid var(--border);
              backdrop-filter: blur(22px);
              border-radius: 24px;
              box-shadow: 0 20px 80px rgba(15, 23, 42, 0.35);
            }
            .brand {
              display: flex;
              align-items: center;
              gap: 14px;
              margin-bottom: 28px;
            }
            .brand img {
              width: 52px;
              height: 52px;
              object-fit: contain;
              border-radius: 14px;
              background: rgba(255, 255, 255, 0.05);
              padding: 8px;
            }
            h1 {
              margin: 0;
              font-size: 24px;
              font-weight: 700;
            }
            p {
              margin: 4px 0 0;
              color: var(--muted);
              font-size: 13px;
            }
            .bar {
              width: 100%;
              height: 10px;
              overflow: hidden;
              border-radius: 999px;
              background: rgba(255, 255, 255, 0.06);
              border: 1px solid rgba(255, 255, 255, 0.08);
            }
            .bar > span {
              display: block;
              width: 12%;
              height: 100%;
              border-radius: inherit;
              background: var(--accent);
              transition: width 0.24s ease;
            }
            .meta {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-top: 10px;
              gap: 12px;
              color: var(--muted);
              font-size: 12px;
            }
            .pulse {
              display: flex;
              gap: 6px;
              margin-top: 22px;
            }
            .pulse span {
              width: 10px;
              height: 10px;
              border-radius: 999px;
              background: rgba(255, 255, 255, 0.2);
              animation: pulse 1.2s infinite ease-in-out;
            }
            .pulse span:nth-child(2) { animation-delay: 0.15s; }
            .pulse span:nth-child(3) { animation-delay: 0.3s; }
            @keyframes pulse {
              0%, 80%, 100% { transform: scale(0.72); opacity: 0.35; }
              40% { transform: scale(1); opacity: 1; }
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="brand">
              <img src="${iconPath}" alt="Lecture Lyft" />
              <div>
                <h1>Lecture Lyft</h1>
                <p>Native lecture transcription workspace</p>
              </div>
            </div>
            <div id="status">Preparing application shell...</div>
            <div class="bar" aria-hidden="true">
              <span id="progress"></span>
            </div>
            <div class="meta">
              <span>Boot sequence</span>
              <span id="progress-label">12%</span>
            </div>
            <div class="pulse" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </body>
      </html>
    `;
  }
}
