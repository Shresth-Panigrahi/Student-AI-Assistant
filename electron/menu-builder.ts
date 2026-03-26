import { Menu, shell } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import { WindowManager } from './window-manager';
import { AutoUpdaterManager } from './auto-updater';

type MenuBuilderOptions = {
  windowManager: WindowManager;
  updater: AutoUpdaterManager;
};

export function buildAppMenu({ windowManager, updater }: MenuBuilderOptions) {
  const dispatch = (action: string) => {
    windowManager.focusMainWindow();
    windowManager.send('menu:action', { action });
  };

  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: 'Lecture Lyft',
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          } satisfies MenuItemConstructorOptions
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Dashboard',
          accelerator: 'CmdOrCtrl+1',
          click: () => dispatch('navigate:dashboard')
        },
        {
          label: 'New Recording Session',
          accelerator: 'CmdOrCtrl+N',
          click: () => dispatch('navigate:session')
        },
        {
          label: 'History',
          accelerator: 'CmdOrCtrl+Shift+H',
          click: () => dispatch('navigate:history')
        },
        { type: 'separator' },
        {
          label: 'Request Microphone Access',
          accelerator: 'CmdOrCtrl+Shift+M',
          click: () => dispatch('permissions:microphone')
        },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        {
          label: 'Toggle Full Screen',
          accelerator: process.platform === 'darwin' ? 'Ctrl+Command+F' : 'F11',
          role: 'togglefullscreen'
        }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        {
          label: 'Bring to Front',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => windowManager.focusMainWindow()
        },
        ...(process.platform === 'darwin' ? ([{ type: 'separator' }, { role: 'front' }] as MenuItemConstructorOptions[]) : [])
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates',
          accelerator: 'CmdOrCtrl+U',
          click: () => void updater.checkForUpdates()
        },
        {
          label: 'Backend API Docs',
          click: () => void shell.openExternal('http://127.0.0.1:8000/docs')
        }
      ]
    }
  ];

  return Menu.buildFromTemplate(template);
}
