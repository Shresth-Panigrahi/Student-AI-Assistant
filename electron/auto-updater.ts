import { app } from 'electron';
import { autoUpdater, type UpdateDownloadedEvent, type UpdateInfo, type ProgressInfo } from 'electron-updater';
import { createLogger } from './utils/logger';

export type UpdateStatus =
  | { state: 'idle' | 'checking' | 'not-available' | 'disabled' }
  | { state: 'available'; version: string; notes?: string | null }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'downloaded'; version: string; notes?: string | null }
  | { state: 'error'; message: string };

type AutoUpdaterManagerOptions = {
  sendToRenderer: (payload: UpdateStatus) => void;
  notify: (title: string, body: string) => void;
};

const logger = createLogger('updater');

export class AutoUpdaterManager {
  private readonly sendToRenderer: AutoUpdaterManagerOptions['sendToRenderer'];
  private readonly notify: AutoUpdaterManagerOptions['notify'];
  private initialized = false;
  private currentVersion = app.getVersion();

  constructor(options: AutoUpdaterManagerOptions) {
    this.sendToRenderer = options.sendToRenderer;
    this.notify = options.notify;
  }

  initialize() {
    if (this.initialized) {
      return;
    }

    const owner = process.env.GH_OWNER ?? process.env.LECTURE_LYFT_UPDATE_OWNER;
    const repo = process.env.GH_REPO ?? process.env.LECTURE_LYFT_UPDATE_REPO;

    this.initialized = true;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = logger;

    if (owner && repo) {
      autoUpdater.setFeedURL({
        provider: 'github',
        owner,
        repo
      });
    }

    autoUpdater.on('checking-for-update', () => {
      this.publish({ state: 'checking' });
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.currentVersion = info.version;
      this.publish({
        state: 'available',
        version: info.version,
        notes: typeof info.releaseNotes === 'string' ? info.releaseNotes : null
      });
      this.notify('Lecture Lyft update available', `Version ${info.version} is downloading in the background.`);
    });

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      this.publish({
        state: 'downloading',
        version: this.currentVersion,
        percent: Number(progress.percent.toFixed(1))
      });
    });

    autoUpdater.on('update-downloaded', (info: UpdateDownloadedEvent) => {
      this.publish({
        state: 'downloaded',
        version: info.version,
        notes: typeof info.releaseNotes === 'string' ? info.releaseNotes : null
      });
      this.notify('Lecture Lyft update ready', 'Restart the app to install the latest release.');
    });

    autoUpdater.on('update-not-available', () => {
      this.publish({ state: 'not-available' });
    });

    autoUpdater.on('error', (error) => {
      logger.error(error);
      this.publish({
        state: 'error',
        message: error == null ? 'Unknown auto-update error' : String(error)
      });
    });
  }

  async checkForUpdates() {
    const owner = process.env.GH_OWNER ?? process.env.LECTURE_LYFT_UPDATE_OWNER;
    const repo = process.env.GH_REPO ?? process.env.LECTURE_LYFT_UPDATE_REPO;

    if (!app.isPackaged || !owner || !repo) {
      this.publish({ state: 'disabled' });
      return;
    }

    this.initialize();
    await autoUpdater.checkForUpdates();
  }

  quitAndInstall() {
    autoUpdater.quitAndInstall();
  }

  private publish(payload: UpdateStatus) {
    this.sendToRenderer(payload);
  }
}
