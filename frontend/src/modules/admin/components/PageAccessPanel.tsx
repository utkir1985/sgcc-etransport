import { useEffect, useState } from 'react';
import { BarChart3, Check, Loader2, Minus, Target } from 'lucide-react';
import { api } from '../../../shared/services/api';
import { ROLE_LABELS } from '../../../shared/types';

/**
 * Rol bo'yicha boshqariladigan sahifalar: Statistika va Oylik reja sahifalari.
 * Administrator ro'yxatdan chiqarilmaydi: sozlamani qaytarish imkoni yo'qolmasligi uchun.
 */
export function PageAccessPanel() {
  const [allRoles, setAllRoles] = useState<string[]>([]);
  const [reportsSelected, setReportsSelected] = useState<string[]>([]);
  const [plansSelected, setPlansSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingReports, setSavingReports] = useState(false);
  const [savingPlans, setSavingPlans] = useState(false);
  const [errorReports, setErrorReports] = useState('');
  const [errorPlans, setErrorPlans] = useState('');
  const [savedReports, setSavedReports] = useState('');
  const [savedPlans, setSavedPlans] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.getPageAccess()
      .then(res => {
        if (cancelled) return;
        setAllRoles(res.data?.allRoles ?? []);
        setReportsSelected(res.data?.reportsRoles ?? ['Admin']);
        setPlansSelected(res.data?.plansRoles ?? ['Admin', 'Marketing', 'Dispatching', 'DeputyDirector']);
        setErrorReports('');
        setErrorPlans('');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorReports(err instanceof Error ? err.message : 'Sozlamani olishda xatolik');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const toggleReports = (role: string) => {
    if (role === 'Admin') return;
    setSavedReports('');
    setReportsSelected(prev => ((prev ?? []).includes(role) ? prev.filter(r => r !== role) : [...(prev ?? []), role]));
  };

  const togglePlans = (role: string) => {
    if (role === 'Admin') return;
    setSavedPlans('');
    setPlansSelected(prev => ((prev ?? []).includes(role) ? prev.filter(r => r !== role) : [...(prev ?? []), role]));
  };

  const saveReports = async () => {
    setSavingReports(true);
    setErrorReports('');
    setSavedReports('');
    try {
      const res = await api.savePageAccess(reportsSelected.filter(r => r !== 'Admin'), undefined);
      setReportsSelected(res.data?.reportsRoles ?? reportsSelected);
      setSavedReports('Statistika huquqlari saqlandi.');
    } catch (err) {
      setErrorReports(err instanceof Error ? err.message : 'Saqlashda xatolik');
    } finally {
      setSavingReports(false);
    }
  };

  const savePlans = async () => {
    setSavingPlans(true);
    setErrorPlans('');
    setSavedPlans('');
    try {
      const res = await api.savePageAccess(undefined, plansSelected.filter(r => r !== 'Admin'));
      setPlansSelected(res.data?.plansRoles ?? plansSelected);
      setSavedPlans('Reja bo\'limi huquqlari saqlandi.');
    } catch (err) {
      setErrorPlans(err instanceof Error ? err.message : 'Saqlashda xatolik');
    } finally {
      setSavingPlans(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
        Yuklanmoqda…
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* 1. Reja sahifasi */}
      <div className="space-y-5 rounded-2xl border border-indigo-100 bg-indigo-50/30 p-6 dark:border-indigo-900/40 dark:bg-indigo-950/20">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 shrink-0 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <Target className="w-5 h-5" strokeWidth={2.2} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Reja sahifasi (Oylik reja monitoringi)</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Qaysi rollar «Reja» bo‘limini va <code>/plans</code> sahifasini ko‘rishini belgilang.
              Tanlangan rollar zavodlar va mahsulotlar kesimida reja ijrosini kuzatishi mumkin.
              Administrator har doim ko‘radi va rejalarni tahrirlay oladi.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {allRoles.map(role => {
            const on = Array.isArray(plansSelected) && plansSelected.includes(role);
            const locked = role === 'Admin';
            return (
              <button
                key={role}
                type="button"
                onClick={() => togglePlans(role)}
                disabled={locked}
                aria-pressed={on}
                className={[
                  'flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left text-sm font-medium transition-colors',
                  on
                    ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-900 dark:text-indigo-200'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60',
                  locked ? 'opacity-70 cursor-not-allowed' : '',
                ].join(' ')}
              >
                <span className={`w-5 h-5 shrink-0 rounded-md flex items-center justify-center ${on ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'}`}>
                  {on ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : <Minus className="w-3.5 h-3.5" strokeWidth={2} />}
                </span>
                <span className="truncate">
                  {ROLE_LABELS[role] || role}
                  {locked && <em className="not-italic text-xs text-slate-400"> · doimiy</em>}
                </span>
              </button>
            );
          })}
        </div>

        {errorPlans && (
          <p className="text-sm text-rose-600 dark:text-rose-400">{errorPlans}</p>
        )}
        {savedPlans && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">{savedPlans}</p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={savePlans}
            disabled={savingPlans}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 text-sm font-semibold shadow-md transition flex items-center gap-2 disabled:opacity-50"
          >
            {savingPlans && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />}
            Reja huquqlarini saqlash
          </button>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Tanlangan: {plansSelected.length} ta rol
          </span>
        </div>
      </div>

      {/* 2. Statistika sahifasi */}
      <div className="space-y-5 rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 shrink-0 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-800 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <BarChart3 className="w-5 h-5" strokeWidth={2} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Statistika sahifasi</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Qaysi rollar «Statistika» menyusini va <code>/reports</code> sahifasini ko‘rishini belgilang.
              Administrator har doim ko‘radi.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {allRoles.map(role => {
            const on = Array.isArray(reportsSelected) && reportsSelected.includes(role);
            const locked = role === 'Admin';
            return (
              <button
                key={role}
                type="button"
                onClick={() => toggleReports(role)}
                disabled={locked}
                aria-pressed={on}
                className={[
                  'flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left text-sm font-medium transition-colors',
                  on
                    ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-200'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60',
                  locked ? 'opacity-70 cursor-not-allowed' : '',
                ].join(' ')}
              >
                <span className={`w-5 h-5 shrink-0 rounded-md flex items-center justify-center ${on ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'}`}>
                  {on ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : <Minus className="w-3.5 h-3.5" strokeWidth={2} />}
                </span>
                <span className="truncate">
                  {ROLE_LABELS[role] || role}
                  {locked && <em className="not-italic text-xs text-slate-400"> · doimiy</em>}
                </span>
              </button>
            );
          })}
        </div>

        {errorReports && (
          <p className="text-sm text-rose-600 dark:text-rose-400">{errorReports}</p>
        )}
        {savedReports && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">{savedReports}</p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={saveReports}
            disabled={savingReports}
            className="btn-primary"
          >
            {savingReports && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />}
            Statistika huquqlarini saqlash
          </button>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Tanlangan: {reportsSelected.length} ta rol
          </span>
        </div>
      </div>
    </div>
  );
}
