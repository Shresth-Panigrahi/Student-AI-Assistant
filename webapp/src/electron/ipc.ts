export type TrayState = 'idle' | 'recording' | 'processing';

export type UpdateStatus =
  | { state: 'idle' | 'checking' | 'not-available' | 'disabled' }
  | { state: 'available'; version: string; notes?: string | null }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'downloaded'; version: string; notes?: string | null }
  | { state: 'error'; message: string };

export type BackendState = {
  state: 'stopped' | 'starting' | 'ready' | 'restarting' | 'error';
  pid: number | null;
  healthy: boolean;
  backendUrl: string;
  wsUrl: string;
  lastError: string | null;
  restartCount: number;
};

type PlatformName = 'darwin' | 'win32' | 'linux' | 'freebsd' | 'openbsd' | 'sunos' | 'android' | 'aix';
type OpenDialogOptions = Record<string, unknown>;
type SaveDialogOptions = Record<string, unknown>;
type OpenDialogReturnValue = {
  canceled: boolean;
  filePaths: string[];
};
type SaveDialogReturnValue = {
  canceled: boolean;
  filePath?: string;
};

export type LectureLyftConfig = {
  isElectron: boolean;
  platform: PlatformName;
  backendUrl: string;
  wsUrl: string;
  version?: string;
  isPackaged?: boolean;
};

export type LectureLyftBridge = {
  config: LectureLyftConfig;
  app: {
    getConfig: () => Promise<LectureLyftConfig>;
  };
  backend: {
    getState: () => Promise<BackendState>;
    restart: () => Promise<BackendState>;
    onStatus: (listener: (payload: BackendState) => void) => () => void;
  };
  dialog: {
    open: (options?: OpenDialogOptions) => Promise<OpenDialogReturnValue>;
    save: (options?: SaveDialogOptions) => Promise<SaveDialogReturnValue>;
  };
  notifications: {
    show: (payload: { title: string; body: string }) => Promise<{ shown: boolean }>;
  };
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    hide: () => void;
    show: () => void;
    isMaximized: () => Promise<boolean>;
    onMaximizedChange: (listener: (payload: { isMaximized: boolean }) => void) => () => void;
  };
  store: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<boolean>;
    delete: (key: string) => Promise<boolean>;
  };
  tray: {
    setState: (state: TrayState) => Promise<boolean>;
  };
  updates: {
    check: () => Promise<boolean>;
    install: () => Promise<boolean>;
    onStatus: (listener: (payload: UpdateStatus) => void) => () => void;
  };
  menu: {
    onAction: (listener: (payload: { action: string }) => void) => () => void;
  };
  deepLink: {
    getPending: () => Promise<string | null>;
    onOpen: (listener: (payload: { route: string }) => void) => () => void;
  };
  permissions: {
    requestMicrophone: () => Promise<boolean>;
  };
};

const fallbackConfig: LectureLyftConfig = {
  isElectron: false,
  platform: 'darwin',
  backendUrl: import.meta.env.VITE_BACKEND_URL ?? 'http://127.0.0.1:8000',
  wsUrl: import.meta.env.VITE_WS_URL ?? 'ws://127.0.0.1:8000/ws'
};

const bridge = (): LectureLyftBridge | undefined => window.lectureLyft;

export const electronIpc = {
  config(): LectureLyftConfig {
    return bridge()?.config ?? fallbackConfig;
  },
  isElectron() {
    return Boolean(bridge()?.config.isElectron);
  },
  backendUrl() {
    return bridge()?.config.backendUrl ?? fallbackConfig.backendUrl;
  },
  backendWsUrl() {
    return bridge()?.config.wsUrl ?? fallbackConfig.wsUrl;
  },
  app: {
    async getConfig() {
      return bridge()?.app.getConfig() ?? fallbackConfig;
    }
  },
  backend: {
    async getState() {
      return (
        (bridge() ? await bridge()!.backend.getState() : null) ?? {
          state: 'ready',
          pid: null,
          healthy: true,
          backendUrl: fallbackConfig.backendUrl,
          wsUrl: fallbackConfig.wsUrl,
          lastError: null,
          restartCount: 0
        }
      );
    },
    async restart() {
      if (bridge()) {
        return bridge()!.backend.restart();
      }

      return this.getState();
    },
    onStatus(listener: (payload: BackendState) => void) {
      return bridge()?.backend.onStatus(listener) ?? (() => undefined);
    }
  },
  dialog: {
    open(options?: OpenDialogOptions) {
      return bridge()?.dialog.open(options) ?? Promise.resolve({ canceled: true, filePaths: [] });
    },
    save(options?: SaveDialogOptions) {
      return bridge()?.dialog.save(options) ?? Promise.resolve({ canceled: true, filePath: undefined });
    }
  },
  notifications: {
    show(payload: { title: string; body: string }) {
      return bridge()?.notifications.show(payload) ?? Promise.resolve({ shown: false });
    }
  },
  window: {
    minimize() {
      bridge()?.window.minimize();
    },
    maximize() {
      bridge()?.window.maximize();
    },
    close() {
      bridge()?.window.close();
    },
    hide() {
      bridge()?.window.hide();
    },
    show() {
      bridge()?.window.show();
    },
    async isMaximized() {
      return bridge()?.window.isMaximized() ?? false;
    },
    onMaximizedChange(listener: (payload: { isMaximized: boolean }) => void) {
      return bridge()?.window.onMaximizedChange(listener) ?? (() => undefined);
    }
  },
  store: {
    async get<T = unknown>(key: string) {
      if (bridge()) {
        return (await bridge()!.store.get(key)) as T;
      }

      return null as T;
    },
    set(key: string, value: unknown) {
      return bridge()?.store.set(key, value) ?? Promise.resolve(false);
    },
    delete(key: string) {
      return bridge()?.store.delete(key) ?? Promise.resolve(false);
    }
  },
  tray: {
    setState(state: TrayState) {
      return bridge()?.tray.setState(state) ?? Promise.resolve(false);
    }
  },
  updates: {
    check() {
      return bridge()?.updates.check() ?? Promise.resolve(false);
    },
    install() {
      return bridge()?.updates.install() ?? Promise.resolve(false);
    },
    onStatus(listener: (payload: UpdateStatus) => void) {
      return bridge()?.updates.onStatus(listener) ?? (() => undefined);
    }
  },
  menu: {
    onAction(listener: (payload: { action: string }) => void) {
      return bridge()?.menu.onAction(listener) ?? (() => undefined);
    }
  },
  deepLink: {
    getPending() {
      return bridge()?.deepLink.getPending() ?? Promise.resolve(null);
    },
    onOpen(listener: (payload: { route: string }) => void) {
      return bridge()?.deepLink.onOpen(listener) ?? (() => undefined);
    }
  },
  permissions: {
    requestMicrophone() {
      return bridge()?.permissions.requestMicrophone() ?? Promise.resolve(true);
    }
  }
};
