import { Download, RefreshCcw, ShieldAlert, X } from 'lucide-react';
import type { UpdateStatus } from '@/electron/ipc';

type UpdateBannerProps = {
  status: UpdateStatus;
  offsetTop: number;
  onDismiss: () => void;
  onInstall: () => void;
  onCheck: () => void;
};

function shouldRender(status: UpdateStatus) {
  return status.state === 'available' || status.state === 'downloading' || status.state === 'downloaded' || status.state === 'error';
}

export default function UpdateBanner({ status, offsetTop, onDismiss, onInstall, onCheck }: UpdateBannerProps) {
  if (!shouldRender(status)) {
    return null;
  }

  const topStyle = { top: `${offsetTop}px` };

  return (
    <div style={topStyle} className="fixed inset-x-0 z-[110] px-4 py-3">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/92 px-4 py-3 shadow-2xl shadow-slate-950/45 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-emerald-300">
            {status.state === 'error' ? <ShieldAlert className="h-5 w-5 text-rose-300" /> : <Download className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            {status.state === 'available' && <p className="text-sm font-semibold text-white">Version {status.version} is downloading.</p>}
            {status.state === 'downloading' && (
              <p className="text-sm font-semibold text-white">
                Downloading version {status.version}: {status.percent}%
              </p>
            )}
            {status.state === 'downloaded' && <p className="text-sm font-semibold text-white">Version {status.version} is ready to install.</p>}
            {status.state === 'error' && <p className="text-sm font-semibold text-white">Auto-update failed.</p>}
            <p className="truncate text-xs text-slate-300">
              {status.state === 'error' ? status.message : 'Lecture Lyft will apply the update on restart.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {status.state === 'downloaded' && (
            <button
              type="button"
              onClick={onInstall}
              className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              Install now
            </button>
          )}
          {status.state === 'error' && (
            <button
              type="button"
              onClick={onCheck}
              className="flex items-center gap-2 rounded-xl bg-white/8 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/14"
            >
              <RefreshCcw className="h-4 w-4" />
              Retry
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-xl p-2 text-white/60 transition hover:bg-white/8 hover:text-white"
            aria-label="Dismiss update banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
