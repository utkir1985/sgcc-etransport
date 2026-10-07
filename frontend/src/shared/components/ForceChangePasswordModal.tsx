import { useState, useMemo } from 'react';
import {
  ShieldAlert,
  KeyRound,
  Eye,
  EyeOff,
  Check,
  X,
  Loader2,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';

export function ForceChangePasswordModal() {
  const { logout, clearMustChangePassword } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('123456');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Requirement checks
  const rules = useMemo(() => {
    return {
      minLength: newPassword.length >= 8,
      hasUpper: /[A-Z]/.test(newPassword),
      hasLower: /[a-z]/.test(newPassword),
      hasDigit: /[0-9]/.test(newPassword),
      hasSpecial: /[^A-Za-z0-9]/.test(newPassword),
      matches: Boolean(confirmPassword && confirmPassword === newPassword),
    };
  }, [newPassword, confirmPassword]);

  const allValid =
    rules.minLength &&
    rules.hasUpper &&
    rules.hasLower &&
    rules.hasDigit &&
    rules.hasSpecial &&
    rules.matches;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allValid) {
      setError('Iltimos, barcha xavfsizlik talablariga rioya qiling.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const res = await api.changeOwnPassword({ currentPassword, newPassword });
      if (res.success) {
        setSuccess(true);
        setTimeout(() => {
          clearMustChangePassword();
        }, 1200);
      } else {
        setError(res.message || 'Parolni o‘zgartirishda xatolik yuz berdi');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Parolni o‘zgartirishda xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        {/* Header Icon */}
        <div className="flex items-center gap-3.5 mb-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white sm:text-xl">
              Parolni yangilash majburiy
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
              Siz boshlang‘ich parol bilan kirdingiz. Tizim xavfsizligi uchun yangi murakkab parol o‘rnating.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300 flex items-center gap-2">
            <Check className="h-4 w-4" /> Parol muvaffaqiyatli yangilandi! Tizimga yo‘naltirilmoqda...
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Current Password */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Joriy parol *
            </label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 pr-10 text-sm text-slate-900 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                placeholder="Joriy parol (odatda 123456)"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Yangi parol *
            </label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 pr-10 text-sm text-slate-900 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                placeholder="Yangi murakkab parol"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Yangi parolni takrorlang *
            </label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 pr-10 text-sm text-slate-900 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                placeholder="Yangi parolni qayta kiriting"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Requirements Checklist */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5 dark:border-slate-800/80 dark:bg-slate-800/50 space-y-1.5">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Parol talablari:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs">
              <RuleItem met={rules.minLength} text="Kamida 8 ta belgi" />
              <RuleItem met={rules.hasUpper} text="Katta harf (A-Z)" />
              <RuleItem met={rules.hasLower} text="Kichik harf (a-z)" />
              <RuleItem met={rules.hasDigit} text="Kamida 1 ta raqam (0-9)" />
              <RuleItem met={rules.hasSpecial} text="Maxsus belgi (!@#$%...)" />
              <RuleItem met={rules.matches} text="Parollar mos kelishi" />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => logout()}
              className="flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Chiqish</span>
            </button>

            <button
              type="submit"
              disabled={!allValid || loading || success}
              className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all ${
                allValid && !loading && !success
                  ? 'bg-blue-600 hover:bg-blue-700 active:scale-[0.99]'
                  : 'bg-slate-400 cursor-not-allowed opacity-60'
              }`}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              <KeyRound className="h-4 w-4" />
              <span>Parolni saqlash va kirish</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RuleItem({ met, text }: { met: boolean; text: string }) {
  return (
    <div
      className={`flex items-center gap-1.5 transition-colors ${
        met
          ? 'text-emerald-600 dark:text-emerald-400 font-medium'
          : 'text-slate-400 dark:text-slate-500'
      }`}
    >
      {met ? (
        <Check className="h-3.5 w-3.5 shrink-0 stroke-[2.5]" />
      ) : (
        <X className="h-3.5 w-3.5 shrink-0 opacity-40" />
      )}
      <span>{text}</span>
    </div>
  );
}
