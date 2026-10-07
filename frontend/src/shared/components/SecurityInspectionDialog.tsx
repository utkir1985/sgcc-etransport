import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Shield, X } from 'lucide-react';
import { api } from '../services/api';
import type { EmptyWagonArrival } from '../types';
import { notifyOrdersChanged } from '../utils/realtimeSync';

type Props = {
  open: boolean;
  arrival: EmptyWagonArrival | null;
  onClose: () => void;
  onDone: () => void;
};

export function SecurityInspectionDialog({ open, arrival, onClose, onDone }: Props) {
  const [issueMode, setIssueMode] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState<'admit' | 'return' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setIssueMode(false);
    setNotes('');
    setError('');
    setSubmitting(null);
  }, [open, arrival?.id]);

  if (!open || !arrival) return null;
  const permitApproved = Boolean(arrival.entryPermitPermitApprovedAt);

  const close = () => {
    if (submitting) return;
    onClose();
  };

  const admit = async () => {
    setSubmitting('admit');
    setError('');
    try {
      const res = await api.approveEntryPermit(arrival.id);
      if (!res.success) throw new Error(res.message || 'Kiritishda xatolik');
      notifyOrdersChanged();
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik yuz berdi');
    } finally {
      setSubmitting(null);
    }
  };

  const reportIssue = async () => {
    const reason = notes.trim();
    if (reason.length < 3) {
      setError('Kamchilik yoki xato sababini yozing');
      return;
    }
    setSubmitting('return');
    setError('');
    try {
      const res = await api.updateEmptyWagonStage(arrival.id, 'KengsoyInspection', reason);
      if (!res.success) throw new Error(res.message || 'Qaytarishda xatolik');
      notifyOrdersChanged();
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik yuz berdi');
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="confirm-dialog-root" role="presentation">
      <button type="button" className="confirm-dialog-backdrop" aria-label="Yopish" onClick={close} />
      <div
        className="confirm-dialog !max-w-[30rem] !w-[min(30rem,calc(100vw-1.5rem))] !overflow-hidden !p-0"
        role="dialog"
        aria-modal="true"
      >
        <button type="button" className="confirm-dialog__close" aria-label="Yopish" onClick={close} disabled={!!submitting}>
          <X className="w-4 h-4" strokeWidth={1.75} />
        </button>

        <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/60">
          <div className="confirm-dialog__header !mb-0">
            <div className="confirm-dialog__icon !bg-sky-50 !text-sky-600 dark:!bg-slate-800 dark:!text-slate-300">
              <Shield className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <h2 className="confirm-dialog__title">Qo‘riqlash xizmati tekshiruvi</h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 dark:bg-slate-950 dark:text-slate-300 dark:ring-slate-700">{arrival.arrivalNumber}</span>
                <span className="rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:bg-slate-800 dark:text-slate-300">{arrival.wagonCount} ta vagon</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-5">
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 dark:border-slate-800 dark:bg-slate-900/50">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tekshiruv tartibi</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            Vagon raqami va holatini tekshiring. Hammasi joyida bo‘lsa zavod hududiga kiriting; kamchilik aniqlansa sababini yozib Temir yo‘lga qaytaring.
          </p>
        </div>

        {error ? <p className="confirm-dialog__error mb-3">{error}</p> : null}

        <div className="flex flex-col gap-2.5">
          {!issueMode ? (
            <>
              <button
                type="button"
                className="btn-primary w-full inline-flex items-center justify-center gap-2 !py-2.5"
                disabled={!!submitting || !permitApproved}
                onClick={() => { void admit(); }}
              >
                <CheckCircle2 className="w-4 h-4" strokeWidth={2} />
                {submitting === 'admit'
                  ? 'Kiritilmoqda...'
                  : permitApproved
                    ? 'Tekshirildi — yakuniy ruxsat berish'
                    : 'Ruxsatnoma byurosi kelishishi kutilmoqda'}
              </button>
              <button
                type="button"
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200 dark:hover:bg-amber-950/35"
                disabled={!!submitting}
                onClick={() => {
                  setIssueMode(true);
                  setError('');
                }}
              >
                <AlertTriangle className="w-4 h-4" strokeWidth={2} />
                Kamchilik / xato bor
              </button>
            </>
          ) : (
            <>
              <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/80 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                <label className="block">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-amber-950 dark:text-amber-100 mb-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={2} />
                    Kamchilik / xato sababi <span className="text-rose-500">*</span>
                  </span>
                  <textarea
                    rows={4}
                    autoFocus
                    disabled={!!submitting}
                    value={notes}
                    onChange={e => {
                      setNotes(e.target.value);
                      if (error) setError('');
                    }}
                    placeholder="Masalan: plomba yo‘q, eshik ochiq, hujjat mos emas…"
                    className="security-issue-note"
                  />
                </label>
                <p className="mt-1.5 text-[11px] text-amber-800/80 dark:text-amber-200/80">
                  Sabab Temir yo‘lga ko‘rinadi — tuzatib qayta yuborishadi.
                </p>
              </div>

              <button
                type="button"
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-amber-400 bg-amber-500 px-3 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50 dark:border-amber-500 dark:bg-amber-600 dark:hover:bg-amber-500"
                disabled={!!submitting}
                onClick={() => { void reportIssue(); }}
              >
                <AlertTriangle className="w-4 h-4" strokeWidth={2} />
                {submitting === 'return' ? 'Qaytarilmoqda...' : 'Temir yo‘lga qaytarish'}
              </button>
              <button
                type="button"
                className="text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 py-1"
                disabled={!!submitting}
                onClick={() => {
                  setIssueMode(false);
                  setNotes('');
                  setError('');
                }}
              >
                ← Orqaga
              </button>
            </>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

/** Notes ichidan oxirgi qo‘riqlash kamchilik izohini ajratadi. */
export { latestSecurityIssueNote } from '../utils/arrivalIssueNotes';
