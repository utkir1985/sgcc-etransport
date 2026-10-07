import type { ReactNode } from 'react';
import { toLatinProductName } from '../utils/cyrillicToLatin';

export interface WagonCardMetrics {
  tare?: string | null;
  brutto?: string | null;
  netto?: string | null;
}

interface WagonUnitCardProps {
  arrivalNumber: string;
  wagonNumber: string;
  productType: string;
  statusText: string;
  statusTone?: 'emerald' | 'amber' | 'blue' | 'sky' | 'rose';
  metrics?: WagonCardMetrics;
  meta?: ReactNode;
  action?: ReactNode;
  highlighted?: boolean;
  className?: string;
}

export function WagonUnitCard({
  arrivalNumber,
  wagonNumber,
  productType,
  statusText,
  statusTone = 'emerald',
  metrics,
  meta,
  action,
  highlighted = false,
  className = '',
}: WagonUnitCardProps) {
  return (
    <article
      className={[
        'flex flex-col overflow-hidden rounded-2xl border bg-white p-4 shadow-sm transition dark:bg-slate-900',
        highlighted
          ? 'border-amber-400 ring-2 ring-amber-300/50 dark:border-amber-500 dark:ring-amber-500/30'
          : 'border-gray-200 hover:border-gray-300 dark:border-slate-700 dark:hover:border-slate-600',
        className,
      ].join(' ')}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium tracking-wide text-gray-400 dark:text-slate-500">
          {arrivalNumber}
        </p>
        <span className={`notify-dept-pill notify-dept-pill--${statusTone} shrink-0 !text-[11px]`}>
          <span className="notify-dept-pill__dot" />
          {statusText}
        </span>
      </div>

      <h3 className="font-mono text-[1.75rem] font-bold leading-none tracking-tight text-gray-900 dark:text-slate-50">
        {wagonNumber}
      </h3>
      <p className="mt-1.5 text-sm text-gray-600 dark:text-slate-300">
        {toLatinProductName(productType) || productType}
      </p>

      {meta ? <div className="mt-2">{meta}</div> : null}

      {metrics ? (
        <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-gray-100 dark:bg-slate-800">
          <div className="bg-gray-50 px-2.5 py-2.5 dark:bg-slate-900/80">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Tara</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900 dark:text-slate-100">
              {metrics.tare || '—'}
            </p>
          </div>
          <div className="bg-gray-50 px-2.5 py-2.5 dark:bg-slate-900/80">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Brutto</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900 dark:text-slate-100">
              {metrics.brutto || '—'}
            </p>
          </div>
          <div className="bg-gray-50 px-2.5 py-2.5 dark:bg-slate-900/80">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Netto</p>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {metrics.netto || '—'}
            </p>
          </div>
        </div>
      ) : null}

      {action ? <div className="mt-3 mt-auto pt-1">{action}</div> : null}
    </article>
  );
}
