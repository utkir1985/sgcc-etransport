import { useEffect, useMemo, useState } from 'react';
import {
  Scale,
  CheckCircle2,
  FileSpreadsheet,
  Search,
  RefreshCw,
  TrendingDown,
  Settings,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { api } from '../../../shared/services/api';
import { useAuth } from '../../../shared/contexts/AuthContext';
import type { EmptyWagonArrival, LoadingRegistry } from '../../../shared/types';
import { ReportsHistoryTabs } from '../components/ReportsHistoryTabs';
import { TariffSettingsModal } from '../components/TariffSettingsModal';
import {
  buildWeightAnalysis,
} from '../utils/demurrageUtils';
import { exportSheet, todayStamp } from '../../../shared/utils/excelExport';
import { subscribeOrdersChanged } from '../../../shared/utils/realtimeSync';

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Tashkent',
  }).format(d);
}

export function WeightControlPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const [arrivals, setArrivals] = useState<EmptyWagonArrival[]>([]);
  const [registries, setRegistries] = useState<LoadingRegistry[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'overload' | 'underload' | 'normal'>('all');
  const [isTariffModalOpen, setIsTariffModalOpen] = useState(false);
  const [tariffVersion, setTariffVersion] = useState(0);

  useEffect(() => {
    const onTariffsChanged = () => setTariffVersion(v => v + 1);
    window.addEventListener('etransport:tariffs-updated', onTariffsChanged);
    return () => window.removeEventListener('etransport:tariffs-updated', onTariffsChanged);
  }, []);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [arrRes, regRes] = await Promise.all([
        api.getEmptyWagonArrivals().catch(() => ({ data: [] as EmptyWagonArrival[] })),
        api.getLoadingRegistries().catch(() => ({ data: [] as LoadingRegistry[] })),
      ]);
      setArrivals(arrRes.data || []);
      setRegistries(regRes.data || []);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    return subscribeOrdersChanged(() => loadData(true));
  }, []);

  const { items, summary } = useMemo(() => {
    return buildWeightAnalysis(arrivals, registries);
  }, [arrivals, registries, tariffVersion]);

  const filteredItems = useMemo(() => {
    return items.filter(w => {
      if (statusFilter !== 'all' && w.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          w.wagonNumber.toLowerCase().includes(q) ||
          w.arrivalNumber.toLowerCase().includes(q) ||
          w.productType.toLowerCase().includes(q) ||
          (w.contractorName || '').toLowerCase().includes(q) ||
          (w.destinationStation || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [items, statusFilter, search]);

  const exportExcel = () => {
    exportSheet(`peregruz_nedogruz_${todayStamp()}.xlsx`, 'Og‘irlik nazorati', [
      ['Peregruz va Nedogruz nazorati (Ortiqcha yoki kam yuklash) tahlili', `Sana: ${new Date().toLocaleDateString()}`],
      [],
      [
        '№',
        'Vagon №',
        'Partiya №',
        'Mahsulot',
        'Sana',
        'Pasport sig‘imi (t)',
        'Tara (t)',
        'Brutto (t)',
        'Netto (t)',
        'Farq (t)',
        'Holat',
        'Izoh / Xavf',
        'Kontragent',
        'Stansiya',
      ],
      ...filteredItems.map((item, idx) => [
        idx + 1,
        item.wagonNumber,
        item.arrivalNumber,
        item.productType,
        fmtDate(item.date),
        item.capacityTons,
        item.tareWeight,
        item.grossWeight,
        item.nettoWeight,
        item.diffTons > 0 ? `+${item.diffTons}` : item.diffTons,
        item.status === 'overload' ? 'Peregruz (Ortiqcha)' : item.status === 'underload' ? 'Nedogruz (Kam)' : 'Me‘yorda',
        item.note,
        item.contractorName || '—',
        item.destinationStation || '—',
      ]),
    ]);
  };

  return (
    <div className="thub min-h-screen">
      <ReportsHistoryTabs active="weight" />

      {/* Hero Header */}
      <header className="thub__hero">
        <div className="thub__hero-text">
          <p className="thub__eyebrow flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-bold">
            <Scale className="w-3.5 h-3.5" />
            2. Vagon tarozisi & Pasport sig‘imi solishtiruvi
          </p>
          <h1 className="thub__title">Peregruz va Nedogruz nazorati</h1>
          <p className="thub__lead">
            Vagon tarozidan o‘tganda uning pasport sig‘imi (68.0 t) bilan avtomatik taqqoslash.
            Kengsoy stansiyasidan qaytarish xavfi, otsipkalar va bo‘sh havo tashish zararlari tahlili.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && <button
            type="button"
            onClick={() => setIsTariffModalOpen(true)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 shadow-sm transition"
            title="Nedogruz va O'TY stavkalarini sozlash"
          >
            <Settings className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>⚙️ Tarif sozlamalari</span>
          </button>}
          <button
            type="button"
            onClick={exportExcel}
            className="thub-btn thub-btn--primary"
            title="Excelga tahlilni yuklash"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Excel yuklash</span>
          </button>
          <button
            type="button"
            onClick={() => loadData()}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title="Yangilash"
          >
            <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Card 1: Peregruz */}
        <div className="p-4 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-rose-700 dark:text-rose-400 mb-2">
            <span className="text-xs font-bold flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
              Peregruz (Ortiqcha yuk)
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-200/80 dark:bg-rose-800 text-rose-900 dark:text-rose-100">
              &gt; +500 kg
            </span>
          </div>
          <div>
            <div className="text-2xl font-black text-rose-700 dark:text-rose-300 tabular-nums">
              {summary.overloadCount} <span className="text-sm font-normal">ta vagon</span>
            </div>
            <div className="text-[11px] text-rose-600/90 dark:text-rose-400 mt-1 font-medium">
              Kengsoy qaytarish va otsipka xavfi: <b>+{summary.totalExcessTons} t</b>
            </div>
          </div>
        </div>

        {/* Card 2: Nedogruz */}
        <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-amber-700 dark:text-amber-400 mb-2">
            <span className="text-xs font-bold flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5 text-amber-600" />
              Nedogruz (Kam yuk)
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-200/80 dark:bg-amber-800 text-amber-900 dark:text-amber-100">
              &gt; 3.5 t kam
            </span>
          </div>
          <div>
            <div className="text-2xl font-black text-amber-700 dark:text-amber-300 tabular-nums">
              {summary.underloadCount} <span className="text-sm font-normal">ta vagon</span>
            </div>
            <div className="text-[11px] text-amber-600/90 dark:text-amber-400 mt-1 font-medium">
              Yo‘qotilgan quvvat: <b>-{summary.totalLostCapacityTons} t</b> (Bo‘sh havo)
            </div>
          </div>
        </div>

        {/* Card 3: Me'yorda */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold">Me‘yorda yuklangan</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
              {summary.normalCount} <span className="text-sm font-normal text-slate-400">ta vagon</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Aniq yuklash ulushi: <b>{items.length ? Math.round((summary.normalCount / items.length) * 100) : 100}%</b>
            </div>
          </div>
        </div>

        {/* Card 4: O'rtacha Netto */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold">O‘rtacha Netto og‘irligi</span>
            <Scale className="w-4 h-4 text-blue-500" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
              {summary.avgNettoTons} <span className="text-sm font-normal text-slate-400">t / vagon</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Standart pasport sig‘imi: <b>68.0 t</b>
            </div>
          </div>
        </div>
      </div>

      {/* Visual Analytics Box */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-500" />
            Yuklash me‘yori balansi va iqtisodiy oqibatlar
          </h2>
          <span className="text-xs font-mono text-slate-400">
            Jami o‘lchangan vagonlar: {summary.totalWeighed} ta
          </span>
        </div>

        {/* Progress Bar of Weight Breakdown */}
        <div className="w-full bg-slate-100 dark:bg-slate-800 h-3 rounded-full overflow-hidden flex mb-3">
          <div
            className="bg-rose-500 h-full transition-all"
            style={{ width: `${items.length ? (summary.overloadCount / items.length) * 100 : 0}%` }}
            title={`Peregruz: ${summary.overloadCount} ta`}
          />
          <div
            className="bg-emerald-500 h-full transition-all"
            style={{ width: `${items.length ? (summary.normalCount / items.length) * 100 : 100}%` }}
            title={`Me'yorda: ${summary.normalCount} ta`}
          />
          <div
            className="bg-amber-400 h-full transition-all"
            style={{ width: `${items.length ? (summary.underloadCount / items.length) * 100 : 0}%` }}
            title={`Nedogruz: ${summary.underloadCount} ta`}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 text-rose-900 dark:text-rose-200">
            <div className="font-bold flex items-center gap-1.5 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              Peregruz xavfi (&gt; +500 kg)
            </div>
            <p className="text-[11px] text-rose-700 dark:text-rose-300">
              Kengsoy stansiyasi bu vagonlarni qabul qilmaydi. Zavodga qaytarilsa — tushirish (otsipka), qayta tarozi va qo‘shimcha 2 sutkalik prostoy jarimasi kelib chiqadi.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-200">
            <div className="font-bold flex items-center gap-1.5 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              Optimal yuklash (65.0 — 68.5 t)
            </div>
            <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
              Vagon sig‘imidan 95-100% samarali foydalanilmoqda. Temir yo‘l qabuliga va xavfsizlik talablariga to‘liq javob beradi.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-amber-900 dark:text-amber-200">
            <div className="font-bold flex items-center gap-1.5 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              Nedogruz zarari (&lt; 64.5 t)
            </div>
            <p className="text-[11px] text-amber-700 dark:text-amber-300">
              Vagonga kam yuklanganda korxona bo‘sh havo tashigani uchun temir yo‘l tarifini to‘liq to‘laydi. Har bir kam yuklangan vagon — korxona uchun bevosita moliyaviy yo‘qotish.
            </p>
          </div>
        </div>
      </div>

      {/* Toolbar / Filters */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="thub-pills" role="group">
            <button
              type="button"
              className={statusFilter === 'all' ? 'is-on' : undefined}
              onClick={() => setStatusFilter('all')}
            >
              Barcha vagonlar ({items.length})
            </button>
            <button
              type="button"
              className={statusFilter === 'overload' ? 'is-on' : undefined}
              onClick={() => setStatusFilter('overload')}
            >
              <span className="w-2 h-2 rounded-full bg-rose-500 inline-block mr-1" />
              Peregruz ({summary.overloadCount})
            </button>
            <button
              type="button"
              className={statusFilter === 'underload' ? 'is-on' : undefined}
              onClick={() => setStatusFilter('underload')}
            >
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block mr-1" />
              Nedogruz ({summary.underloadCount})
            </button>
            <button
              type="button"
              className={statusFilter === 'normal' ? 'is-on' : undefined}
              onClick={() => setStatusFilter('normal')}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block mr-1" />
              Me‘yorda ({summary.normalCount})
            </button>
          </div>
        </div>

        <label className="thub-search min-w-[240px]">
          <Search className="thub-search__ico" strokeWidth={1.75} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Vagon №, partiya, mijoz..."
          />
        </label>
      </div>

      {/* Vagonlar tarozi jadvali */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Scale className="w-4 h-4 text-blue-600" />
              Tarozi vedomosti va Pasport sig‘imi taqqoslash qaydnomasi
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Netto = Brutto - Tara. Farq pasport yuk ko‘tarish chegarasi (68.0 t) asosida solishtirilgan.
            </p>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
            {filteredItems.length} ta yozuv
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/75 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="py-3 px-3 w-12 text-center">№</th>
                <th className="py-3 px-3 font-bold">Vagon №</th>
                <th className="py-3 px-3">Partiya & Mahsulot</th>
                <th className="py-3 px-3">Sana</th>
                <th className="py-3 px-3 text-right">Pasport (t)</th>
                <th className="py-3 px-3 text-right">Tara (t)</th>
                <th className="py-3 px-3 text-right">Brutto (t)</th>
                <th className="py-3 px-3 text-right font-bold">Netto (t)</th>
                <th className="py-3 px-3 text-center">Farq (t)</th>
                <th className="py-3 px-3">Holat & Xavf</th>
                <th className="py-3 px-3">Mijoz & Manzil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-400">
                    Ma‘lumot topilmadi
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, index) => {
                  const isOver = item.status === 'overload';
                  const isUnder = item.status === 'underload';

                  return (
                    <tr
                      key={`${item.wagonNumber}_${index}`}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition ${
                        isOver ? 'bg-rose-50/40 dark:bg-rose-950/20' : ''
                      }`}
                    >
                      <td className="py-3 px-3 text-center text-slate-400 font-mono">{index + 1}</td>
                      <td className="py-3 px-3 font-bold font-mono text-slate-900 dark:text-white">
                        <div className="flex items-center gap-1.5">
                          <span>{item.wagonNumber}</span>
                          {isOver && (
                            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" title="Kengsoy qaytarish xavfi" />
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-medium text-slate-800 dark:text-slate-200">{item.arrivalNumber}</div>
                        <div className="text-[11px] text-slate-400">{item.productType}</div>
                      </td>
                      <td className="py-3 px-3 text-slate-500 dark:text-slate-400 font-mono">
                        {fmtDate(item.date)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600 dark:text-slate-300">
                        {item.capacityTons.toFixed(1)} t
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600 dark:text-slate-300">
                        {item.tareWeight.toFixed(2)} t
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600 dark:text-slate-300">
                        {item.grossWeight.toFixed(2)} t
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {item.nettoWeight.toFixed(2)} t
                      </td>
                      {/* Diff */}
                      <td className="py-3 px-3 text-center font-mono font-bold tabular-nums">
                        {isOver ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] bg-rose-500 text-white shadow-xs">
                            +{item.diffTons.toFixed(2)} t
                          </span>
                        ) : isUnder ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] bg-amber-400 text-amber-950">
                            {item.diffTons.toFixed(2)} t
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[11px] bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                            {item.diffTons > 0 ? `+${item.diffTons.toFixed(2)}` : item.diffTons.toFixed(2)} t
                          </span>
                        )}
                      </td>
                      {/* Status / Note */}
                      <td className="py-3 px-3">
                        {isOver ? (
                          <div>
                            <span className="font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                              <ShieldAlert className="w-3.5 h-3.5" />
                              Peregruz (Otsipka zarur!)
                            </span>
                            <span className="text-[10px] text-slate-400 block">Kengsoy qaytaradi</span>
                          </div>
                        ) : isUnder ? (
                          <div>
                            <span className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                              <TrendingDown className="w-3.5 h-3.5" />
                              Nedogruz
                            </span>
                            <span className="text-[10px] text-slate-400 block">{Math.abs(item.diffTons).toFixed(1)} t yo‘qotish</span>
                          </div>
                        ) : (
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Me‘yorda
                          </span>
                        )}
                      </td>
                      {/* Contractor & Station */}
                      <td className="py-3 px-3">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {item.contractorName || '—'}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {item.destinationStation || 'Kengsoy'}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      {isAdmin && <TariffSettingsModal
        isOpen={isTariffModalOpen}
        onClose={() => setIsTariffModalOpen(false)}
        onSaved={() => setTariffVersion(v => v + 1)}
      />}
    </div>
  );
}
