import { Menu, Notification, Tray, nativeImage } from 'electron';
import type { NativeImage } from 'electron';
import { getAppIconPath } from './utils/paths';
import { createLogger } from './utils/logger';

export type TrayState = 'idle' | 'recording' | 'processing';

type TrayCallbacks = {
  onOpen: () => void;
  onHide: () => void;
  onQuit: () => void;
  onNavigateToSession: () => void;
  onCheckForUpdates: () => void;
};

const logger = createLogger('tray');

export class TrayManager {
  private tray: Tray | null = null;
  private state: TrayState = 'idle';
  private animationTimer: NodeJS.Timeout | null = null;
  private animationFrame = 0;

  constructor(private readonly callbacks: TrayCallbacks) {}

  create() {
    if (this.tray) {
      return;
    }

    const icon = this.buildStateIcon('idle', 0);
    this.tray = new Tray(icon.isEmpty() ? getAppIconPath() : icon);
    this.tray.setToolTip('Lecture Lyft');
    this.tray.on('click', this.callbacks.onOpen);
    this.tray.on('double-click', this.callbacks.onOpen);
    this.setState('idle');
  }

  destroy() {
    this.stopAnimation();
    this.tray?.destroy();
    this.tray = null;
  }

  setState(nextState: TrayState) {
    this.state = nextState;
    this.updateMenu();

    if (!this.tray) {
      return;
    }

    if (nextState === 'recording') {
      this.startAnimation();
      return;
    }

    this.stopAnimation();
    this.tray.setImage(this.buildStateIcon(nextState, 0));
    this.tray.setToolTip(`Lecture Lyft • ${this.stateLabel(nextState)}`);
  }

  showNotification(title: string, body: string) {
    if (!Notification.isSupported()) {
      logger.warn(`Notification skipped: ${title} - ${body}`);
      return;
    }

    new Notification({
      title,
      body,
      silent: false,
      icon: getAppIconPath()
    }).show();
  }

  private updateMenu() {
    if (!this.tray) {
      return;
    }

    const menu = Menu.buildFromTemplate([
      {
        label: 'Open Lecture Lyft',
        click: this.callbacks.onOpen
      },
      {
        label: 'Start Recording',
        enabled: this.state !== 'recording',
        click: this.callbacks.onNavigateToSession
      },
      {
        label: 'Hide Window',
        click: this.callbacks.onHide
      },
      { type: 'separator' },
      {
        label: `Status: ${this.stateLabel(this.state)}`,
        enabled: false
      },
      {
        label: 'Check for Updates',
        click: this.callbacks.onCheckForUpdates
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: this.callbacks.onQuit
      }
    ]);

    this.tray.setContextMenu(menu);
  }

  private startAnimation() {
    if (!this.tray || this.animationTimer) {
      return;
    }

    this.tray.setToolTip('Lecture Lyft • Recording');
    this.animationTimer = setInterval(() => {
      if (!this.tray) {
        return;
      }

      this.animationFrame = (this.animationFrame + 1) % 2;
      this.tray.setImage(this.buildStateIcon('recording', this.animationFrame));
    }, 450);
  }

  private stopAnimation() {
    if (this.animationTimer) {
      clearInterval(this.animationTimer);
      this.animationTimer = null;
    }
  }

  private buildStateIcon(state: TrayState, frame: number): NativeImage {
    const palette =
      state === 'recording'
        ? { accent: frame === 0 ? '#ff4d4f' : '#ff8a80', pulse: '#ff4d4f' }
        : state === 'processing'
          ? { accent: '#ffb020', pulse: '#ffd27f' }
          : { accent: '#7a8598', pulse: '#bac3d1' };

    const pulseOpacity = state === 'recording' ? (frame === 0 ? 0.18 : 0.32) : state === 'processing' ? 0.24 : 0.12;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="${state === 'recording' ? (frame === 0 ? 20 : 24) : 22}" fill="${palette.pulse}" opacity="${pulseOpacity}" />
        <circle cx="32" cy="32" r="16" fill="#101520" stroke="${palette.accent}" stroke-width="4" />
        <rect x="30" y="17" width="4" height="18" rx="2" fill="${palette.accent}" />
        <path d="M24 30a8 8 0 0 0 16 0" fill="none" stroke="${palette.accent}" stroke-width="4" stroke-linecap="round" />
        <path d="M32 38v7" stroke="${palette.accent}" stroke-width="4" stroke-linecap="round" />
        <path d="M26 46h12" stroke="${palette.accent}" stroke-width="4" stroke-linecap="round" />
      </svg>
    `;

    return nativeImage
      .createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
      .resize({
        width: process.platform === 'darwin' ? 18 : 16,
        height: process.platform === 'darwin' ? 18 : 16
      });
  }

  private stateLabel(state: TrayState) {
    switch (state) {
      case 'recording':
        return 'Recording';
      case 'processing':
        return 'Processing';
      default:
        return 'Idle';
    }
  }
}
