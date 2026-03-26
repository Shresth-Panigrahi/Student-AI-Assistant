import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { electronIpc, type BackendState, type LectureLyftConfig, type UpdateStatus } from './ipc';

const DEFAULT_CONFIG = electronIpc.config();
const DISMISSED_VERSION_KEY = 'updates.dismissedVersion';

export function useElectron() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isRecording, isProcessing } = useStore();
  const [config, setConfig] = useState<LectureLyftConfig>(DEFAULT_CONFIG);
  const [isMaximized, setIsMaximized] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle' });
  const [backendState, setBackendState] = useState<BackendState | null>(null);

  useEffect(() => {
    void electronIpc.app.getConfig().then(setConfig);
    void electronIpc.window.isMaximized().then(setIsMaximized);
    void electronIpc.backend.getState().then(setBackendState);

    const removeMaximized = electronIpc.window.onMaximizedChange(({ isMaximized: nextValue }) => {
      setIsMaximized(nextValue);
    });

    const removeBackendStatus = electronIpc.backend.onStatus((status) => {
      setBackendState(status);
    });

    const removeUpdateStatus = electronIpc.updates.onStatus((status) => {
      void (async () => {
        if ((status.state === 'available' || status.state === 'downloaded') && 'version' in status) {
          const dismissedVersion = await electronIpc.store.get<string | null>(DISMISSED_VERSION_KEY);
          if (dismissedVersion === status.version) {
            return;
          }
        }

        setUpdateStatus(status);
      })();
    });

    const removeMenuAction = electronIpc.menu.onAction(({ action }) => {
      switch (action) {
        case 'navigate:dashboard':
          navigate('/dashboard');
          break;
        case 'navigate:session':
          navigate('/session');
          break;
        case 'navigate:history':
          navigate('/history');
          break;
        case 'permissions:microphone':
          void electronIpc.permissions.requestMicrophone();
          break;
        default:
          break;
      }
    });

    const removeDeepLink = electronIpc.deepLink.onOpen(({ route }) => {
      navigate(route);
    });

    void electronIpc.deepLink.getPending().then((route) => {
      if (route) {
        navigate(route);
      }
    });

    return () => {
      removeMaximized();
      removeBackendStatus();
      removeUpdateStatus();
      removeMenuAction();
      removeDeepLink();
    };
  }, [navigate]);

  useEffect(() => {
    if (!electronIpc.isElectron()) {
      return;
    }

    void electronIpc.store.set('ui.lastRoute', `${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const trayState = isProcessing ? 'processing' : isRecording ? 'recording' : 'idle';
    void electronIpc.tray.setState(trayState);
  }, [isProcessing, isRecording]);

  const dismissUpdate = async () => {
    if ('version' in updateStatus) {
      await electronIpc.store.set(DISMISSED_VERSION_KEY, updateStatus.version);
    }
    setUpdateStatus({ state: 'idle' });
  };

  return {
    config,
    backendState,
    updateStatus,
    dismissUpdate,
    checkForUpdates: () => electronIpc.updates.check(),
    installUpdate: () => electronIpc.updates.install(),
    requestMicrophoneAccess: () => electronIpc.permissions.requestMicrophone(),
    isMaximized,
    isElectron: config.isElectron,
    isMac: config.platform === 'darwin',
    isWindows: config.platform === 'win32',
    isLinux: config.platform === 'linux',
    useCustomTitleBar: config.isElectron && config.platform !== 'darwin',
    windowControls: electronIpc.window
  };
}
