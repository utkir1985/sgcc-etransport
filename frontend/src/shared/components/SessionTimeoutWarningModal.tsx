import { Clock, LogOut, RotateCw } from 'lucide-react';

interface SessionTimeoutWarningModalProps {
  open: boolean;
  secondsRemaining: number;
  totalWarningSeconds?: number;
  onContinue: () => void;
  onLogout: () => void;
}

export function SessionTimeoutWarningModal({
  open,
  secondsRemaining,
  totalWarningSeconds = 60,
  onContinue,
  onLogout,
}: SessionTimeoutWarningModalProps) {
  if (!open) return null;

  const pct = Math.max(0, Math.min(100, (secondsRemaining / totalWarningSeconds) * 100));
  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="confirm-dialog-root" role="presentation">
      <div className="confirm-dialog-backdrop !bg-slate-950/70 !backdrop-blur-sm" />
      <div
        className="confirm-dialog !max-w-[28rem] !w-[min(28rem,calc(100vw-2rem))] !p-6 !rounded-2xl border border-amber-500/30 bg-white dark:bg-slate-900 shadow-2xl shadow-amber-500/10 text-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-timeout-title"
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 ring-8 ring-amber-500/5 dark:bg-amber-500/20">
          <Clock className="h-7 w-7 animate-pulse" strokeWidth={2} />
        </div>

        <h2 id="session-timeout-title" className="text-lg font-bold text-slate-900 dark:text-slate-100">
          Seans muddati tugamoqda
        </h2>

        <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          Siz 9 daqiqadan beri harakatsizsiz. Xavfsizlik yuzasidan seans avtomatik ravishda yopiladi.
        </p>

        {/* Countdown display */}
        <div className="my-5 rounded-xl border border-amber-200/80 bg-amber-50/70 p-3.5 dark:border-amber-900/50 dark:bg-amber-950/30">
          <div className="text-3xl font-black font-mono tracking-wider text-amber-600 dark:text-amber-400">
            {formatTime(secondsRemaining)}
          </div>
          <p className="mt-1 text-[11px] font-medium text-amber-700/80 dark:text-amber-300/80">
            soniyadan so‘ng tizimdan chiqiladi
          </p>

          {/* Progress bar */}
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-amber-200/60 dark:bg-amber-950">
            <div
              className="h-full rounded-full bg-amber-500 transition-all duration-1000 ease-linear"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={onLogout}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Chiqish
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="w-full sm:flex-1 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-600 shadow-md shadow-sky-600/20 transition-all inline-flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            autoFocus
          >
            <RotateCw className="w-3.5 h-3.5" />
            Seansni davom ettirish
          </button>
        </div>
      </div>
    </div>
  );
}
