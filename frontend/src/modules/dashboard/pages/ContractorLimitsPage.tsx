import { useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Search,
  RefreshCw,
  TrendingUp,
  Building2,
  FileText,
  AlertOctagon,
} from 'lucide-react';
import { api } from '../../../shared/services/api';
import type { LoadingRegistry, MonthlyOrder } from '../../../shared/types';
import { ReportsHistoryTabs } from '../components/ReportsHistoryTabs';
import {
  buildContractorLimitsAnalysis,
} from '../utils/demurrageUtils';
import { exportSheet, todayStamp } from '../../../shared/utils/excelExport';
import { subscribeOrdersChanged } from '../../../shared/utils/realtimeSync';
import { LOGISTICS_TYPES } from '../../../shared/constants/logisticsTypes';

function fmtTon(num: number): string {
  return new Intl.NumberFormat('uz-UZ').format(num);
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Tashkent',
  }).format(d);
}

export function ContractorLimitsPage() {
  const [orders, setOrders] = useState<MonthlyOrder[]>([]);
  const [registries, setRegistries] = useState<LoadingRegistry[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'danger' | 'warning' | 'ok'>('all');

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [ordRes, regRes] = await Promise.all([
        api.getOrders(LOGISTICS_TYPES.Railway).catch(() => ({ data: [] as MonthlyOrder[] })),
        api.getLoadingRegistries().catch(() => ({ data: [] as LoadingRegistry[] })),
      ]);
      setOrders(ordRes.data || []);
      setRegistries(regRes.data || []);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    return subscribeOrdersChanged(() => loadData(true));
  }, []);

  const { items, totals } = useMemo(() => {
    return buildContractorLimitsAnalysis(orders, registries);
  }, [orders, registries]);

  const filteredItems = useMemo(() => {
    return items.filter(w => {
      if (statusFilter !== 'all' && w.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          w.contractorName.toLowerCase().includes(q) ||
          w.contractNumber.toLowerCase().includes(q) ||
          w.productType.toLowerCase().includes(q) ||
          w.destinationStation.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [items, statusFilter, search]);

  const exportExcel = () => {
    exportSheet(`mijozlar_limiti_${todayStamp()}.xlsx`, 'Mijozlar limiti', [
      ['Kontragentlar (Mijozlar) buyurtma limiti va qoldig‘i hisoboti', `Sana: ${new Date().toLocaleDateString()}`],
      [],
      [
        '№',
        'Kontragent (Mijoz)',
        'Shartnoma №',
        'Mahsulot turi',
        'Stansiya',
        'Shartnoma hajmi (t)',
        'Shartnoma (vagon)',
        'Yuklandi (t)',
        'Yuklandi (vagon)',
        'Qolgan limit (t)',
        'Qolgan (vagon)',
        'Bajarilish (%)',
        'Holat / Signal',
        'Oxirgi yuklash sanasi',
      ],
      ...filteredItems.map((item, idx) => [
        idx + 1,
        item.contractorName,
        item.contractNumber,
        item.productType,
        item.destinationStation,
        item.planTons,
        item.planWagons,
        item.loadedTons,
        item.loadedWagons,
        item.remainingTons,
        item.remainingWagons,
        `${item.progressPercent}%`,
        item.status === 'danger' ? 'STOP (Limit to‘lgan)' : item.status === 'warning' ? 'Limit tugamoqda (85%+)' : 'Me‘yorda',
        fmtDate(item.lastLoadedDate),
      ]),
    ]);
  };

  return (
    <div className="thub min-h-screen">
      <ReportsHistoryTabs active="contractors" />

      {/* Hero Header */}
      <header className="thub__hero">
        <div className="thub__hero-text">
          <p className="thub__eyebrow flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-bold">
            <Briefcase className="w-3.5 h-3.5" />
            3. Marketing & Moliya bo‘limi nazorati
          </p>
          <h1 className="thub__title">Kontragentlar buyurtma limiti va qoldig‘i</h1>
          <p className="thub__lead">
            Har bir mijoz bo‘yicha: Shartnoma hajmi → Bugungacha yuklandi → Qolgan limit.
            Limit tugab borayotgan yoki oshib ketish xavfi bo‘lgan holatlarda ogohlantirish signallari.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportExcel}
            className="thub-btn thub-btn--primary"
            title="Excelga mijozlar limitini yuklash"
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {/* Card 1: Jami shartnoma hajmi */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold">Oylik shartnoma hajmi</span>
            <Building2 className="w-4 h-4 text-blue-500" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
              {fmtTon(totals.totalPlanTons)} <span className="text-sm font-normal text-slate-400">t</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Jami <b>{items.length} ta</b> shartnoma bo‘yicha
            </div>
          </div>
        </div>

        {/* Card 2: Yuklandi */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold">Bugungacha yuklandi</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
              {fmtTon(totals.totalLoadedTons)} <span className="text-sm font-normal text-slate-400">t</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Bajarilish: <b>{totals.totalPlanTons > 0 ? Math.round((totals.totalLoadedTons / totals.totalPlanTons) * 100) : 0}%</b>
            </div>
          </div>
        </div>

        {/* Card 3: Qolgan limit */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold">Qolgan jami limit</span>
            <FileText className="w-4 h-4 text-indigo-500" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
              {fmtTon(totals.remainingTons)} <span className="text-sm font-normal text-slate-400">t</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Yuklanishi lozim bo‘lgan hajm
            </div>
          </div>
        </div>

        {/* Card 4: STOP (Limit to'lgan) */}
        <div className="p-4 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-rose-700 dark:text-rose-400 mb-2">
            <span className="text-xs font-bold flex items-center gap-1">
              <AlertOctagon className="w-3.5 h-3.5 text-rose-600" />
              STOP: Limit to‘lgan!
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-200/80 dark:bg-rose-800 text-rose-900 dark:text-rose-100">
              100%+
            </span>
          </div>
          <div>
            <div className="text-2xl font-black text-rose-700 dark:text-rose-300 tabular-nums">
              {totals.dangerCount} <span className="text-sm font-normal">ta mijoz</span>
            </div>
            <div className="text-[11px] text-rose-600/90 dark:text-rose-400 mt-1 font-medium">
              Vagon rasmiylashtirish to‘xtatiladi
            </div>
          </div>
        </div>

        {/* Card 5: Limit tugamoqda */}
        <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-amber-700 dark:text-amber-400 mb-2">
            <span className="text-xs font-bold flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              Limit tugab bormoqda
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-200/80 dark:bg-amber-800 text-amber-900 dark:text-amber-100">
              85–99%
            </span>
          </div>
          <div>
            <div className="text-2xl font-black text-amber-700 dark:text-amber-300 tabular-nums">
              {totals.warningCount} <span className="text-sm font-normal">ta mijoz</span>
            </div>
            <div className="text-[11px] text-amber-600/90 dark:text-amber-400 mt-1">
              Yangi vagon berishda signal
            </div>
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
              Barcha kontragentlar ({items.length})
            </button>
            <button
              type="button"
              className={statusFilter === 'danger' ? 'is-on' : undefined}
              onClick={() => setStatusFilter('danger')}
            >
              <span className="w-2 h-2 rounded-full bg-rose-500 inline-block mr-1" />
              STOP: Limit to‘lgan ({totals.dangerCount})
            </button>
            <button
              type="button"
              className={statusFilter === 'warning' ? 'is-on' : undefined}
              onClick={() => setStatusFilter('warning')}
            >
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block mr-1" />
              Limit tugamoqda ({totals.warningCount})
            </button>
            <button
              type="button"
              className={statusFilter === 'ok' ? 'is-on' : undefined}
              onClick={() => setStatusFilter('ok')}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block mr-1" />
              Me‘yorda
            </button>
          </div>
        </div>

        <label className="thub-search min-w-[240px]">
          <Search className="thub-search__ico" strokeWidth={1.75} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Mijoz nomi, shartnoma, mahsulot..."
          />
        </label>
      </div>

      {/* Kontragentlar Limit Jadvali */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-blue-600" />
              Kontragentlar balansi va shartnoma limitlari
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Marketing va Moliya bo‘limi uchun: kimga qancha qarzimiz borligi yoki qancha yuklashimiz lozimligi.
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
                <th className="py-3 px-3 font-bold">Mijoz (Kontragent)</th>
                <th className="py-3 px-3">Shartnoma & Mahsulot</th>
                <th className="py-3 px-3">Manzil stansiya</th>
                <th className="py-3 px-3 text-right">Shartnoma hajmi</th>
                <th className="py-3 px-3 text-right">Yuklandi (Fakt)</th>
                <th className="py-3 px-3 text-right font-bold">Qolgan limit</th>
                <th className="py-3 px-3 w-44">Bajarilish darajasi</th>
                <th className="py-3 px-3">Holat & Signal</th>
                <th className="py-3 px-3">Oxirgi yuklash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400">
                    Mijozlar topilmadi
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, index) => {
                  const isDanger = item.status === 'danger';
                  const isWarning = item.status === 'warning';

                  return (
                    <tr
                      key={`${item.contractorName}_${index}`}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition ${
                        isDanger ? 'bg-rose-50/40 dark:bg-rose-950/20' : ''
                      }`}
                    >
                      <td className="py-3 px-3 text-center text-slate-400 font-mono">{index + 1}</td>
                      <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span>{item.contractorName}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {item.contractNumber}
                        </div>
                        <div className="text-[11px] text-slate-400">{item.productType}</div>
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-400 font-mono">
                        {item.destinationStation}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-800 dark:text-slate-200">
                        {fmtTon(item.planTons)} t
                        <span className="block text-[10px] text-slate-400 font-normal">{item.planWagons} vagon</span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {fmtTon(item.loadedTons)} t
                        <span className="block text-[10px] text-slate-400 font-normal">{item.loadedWagons} vagon</span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {fmtTon(item.remainingTons)} t
                        <span className="block text-[10px] text-slate-400 font-normal">{item.remainingWagons} vagon</span>
                      </td>
                      {/* Progress */}
                      <td className="py-3 px-3">
                        <div className="flex items-center justify-between text-[11px] mb-1 font-mono">
                          <span className="font-bold">{item.progressPercent}%</span>
                          <span className="text-slate-400">{fmtTon(item.loadedTons)} / {fmtTon(item.planTons)}</span>
                        </div>
                        <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isDanger ? 'bg-rose-500' : isWarning ? 'bg-amber-400' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(100, item.progressPercent)}%` }}
                          />
                        </div>
                      </td>
                      {/* Status / Signal */}
                      <td className="py-3 px-3">
                        {isDanger ? (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500 text-white flex items-center gap-1 w-max shadow-xs">
                            <AlertOctagon className="w-3 h-3" />
                            STOP: Limit to‘lgan
                          </span>
                        ) : isWarning ? (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-400 text-amber-950 flex items-center gap-1 w-max">
                            <AlertTriangle className="w-3 h-3" />
                            Limit tugayapti (85%+)
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 flex items-center gap-1 w-max">
                            <CheckCircle2 className="w-3 h-3" />
                            Me‘yorda
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-500 dark:text-slate-400 font-mono">
                        {fmtDate(item.lastLoadedDate)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
