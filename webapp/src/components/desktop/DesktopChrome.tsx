import { Copy, Minus, Square, X } from 'lucide-react';
import logoUrl from '@/assets/logo.png';

type DesktopChromeProps = {
  isMaximized: boolean;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
};

export default function DesktopChrome({
  isMaximized,
  onMinimize,
  onToggleMaximize,
  onClose
}: DesktopChromeProps) {
  return (
    <div className="desktop-drag fixed inset-x-0 top-0 z-[120] flex h-12 items-center justify-between border-b border-white/10 bg-slate-950/75 px-3 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/5">
          <img src={logoUrl} alt="Lecture Lyft" className="h-5 w-5 object-contain" />
        </div>
        <div className="text-sm font-semibold tracking-[0.2px] text-white/90">Lecture Lyft</div>
      </div>

      <div className="desktop-no-drag flex items-center gap-1">
        <button
          type="button"
          aria-label="Minimize window"
          onClick={onMinimize}
          className="flex h-8 w-10 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
          onClick={onToggleMaximize}
          className="flex h-8 w-10 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          {isMaximized ? <Copy className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          aria-label="Close window"
          onClick={onClose}
          className="flex h-8 w-10 items-center justify-center rounded-lg text-white/70 transition hover:bg-rose-500 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
