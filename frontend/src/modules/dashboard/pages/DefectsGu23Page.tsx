import { useEffect, useMemo, useState } from 'react';
import {
  Wrench,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Search,
  RefreshCw,
  FileWarning,
  Building,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../../../shared/services/api';
import type { EmptyWagonArrival, LoadingRegistry } from '../../../shared/types';
import { ReportsHistoryTabs } from '../components/ReportsHistoryTabs';
import {
  buildDefectsGu23Analysis,
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

export function DefectsGu23Page() {
  const [arrivals, setArrivals] = useState<EmptyWagonArrival[]>([]);
  const [registries, setRegistries] = useState<LoadingRegistry[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [stationFilter, setStationFilter] = useState('all');

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

  const { items, byStation, byType, totalDelayHours } = useMemo(() => {
    return buildDefectsGu23Analysis(arrivals, registries);
  }, [arrivals, registries]);

  const filteredItems = useMemo(() => {
    return items.filter(w => {
      if (stationFilter !== 'all' && w.station !== stationFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          w.wagonNumber.toLowerCase().includes(q) ||
          w.actNumber.toLowerCase().includes(q) ||
          w.defectReason.toLowerCase().includes(q) ||
          w.station.toLowerCase().includes(q) ||
          w.actType.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [items, stationFilter, search]);

  const exportExcel = () => {
    exportSheet(`nosozliklar_gu23_${todayStamp()}.xlsx`, 'GU-23 pretenziyalar', [
      ['Vagonlardagi nosozliklar (Dalolatnomalar / GU-23) va Pretenziya hisoboti', `Sana: ${new Date().toLocaleDateString()}`],
      [],
      [
        '№',
        'Dalolatnoma № (GU-23)',
        'Vagon №',
        'Partiya №',
        'Kelgan sana',
        'Jo‘natuvchi stansiya',
        'Nosozlik / Defekt turi',
        'Aniqlangan nuqson tavsifi',
        'Hujjat fayli',
        'Kechikish (soat)',
        'Holat',
      ],
      ...filteredItems.map((item, idx) => [
        idx + 1,
        item.actNumber,
        item.wagonNumber,
        item.arrivalNumber,
        fmtDate(item.arrivalDate),
        item.station,
        item.actType,
        item.defectReason,
        item.fileName || 'Mavjud',
        item.delayHours,
        item.isReturned ? 'Qaytarilgan' : 'Zavodda tuzatildi / GU-23 tuzildi',
      ]),
    ]);
  };

  return (
    <div className="thub min-h-screen">
      <ReportsHistoryTabs active="defects" />

      {/* Hero Header */}
      <header className="thub__hero">
        <div className="thub__hero-text">
          <p className="thub__eyebrow flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-bold">
            <Wrench className="w-3.5 h-3.5" />
            4. Sifat nazorati & Da‘vo (Pretenziya) asosi
          </p>
          <h1 className="thub__title">Vagonlardagi nosozliklar (GU-23 tahlili)</h1>
          <p className="thub__lead">
            Temir yo‘ldan kelgan yaroqsiz (eshigi yopilmaydigan, lyuki singan, teshik) vagonlar dalolatnomalari.
            Qaysi stansiyadan ko‘p nosozlik kelayotgani va O‘TY bilan rasmiy da‘vo ishlari yuritish bazasi.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportExcel}
            className="thub-btn thub-btn--primary"
            title="O‘TY da‘vo ishlari uchun Excelga yuklash"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Pretenziya Excel yuklash</span>
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
        {/* Card 1: Jami nosozliklar */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold">Tuzilgan GU-23 aktlari</span>
            <FileWarning className="w-4 h-4 text-amber-500" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
              {items.length} <span className="text-sm font-normal text-slate-400">ta dalolatnoma</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Rasmiy qayd etilgan nuqsonlar
            </div>
          </div>
        </div>

        {/* Card 2: Qaytarilgan vagonlar */}
        <div className="p-4 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-rose-700 dark:text-rose-400 mb-2">
            <span className="text-xs font-bold">Rad etilgan / Qaytarilgan</span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div>
            <div className="text-2xl font-black text-rose-700 dark:text-rose-300 tabular-nums">
              {items.filter(x => x.isReturned).length} <span className="text-sm font-normal">ta vagon</span>
            </div>
            <div className="text-[11px] text-rose-600/90 dark:text-rose-400 mt-1 font-medium">
              Yuklashga yaroqsiz deb topilgan
            </div>
          </div>
        </div>

        {/* Card 3: Yo'qotilgan vaqt */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold">Kechikish vaqti</span>
            <Clock className="w-4 h-4 text-blue-500" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
              {totalDelayHours} <span className="text-sm font-normal text-slate-400">soat</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Nuqson sababli aylanma to‘xtashi
            </div>
          </div>
        </div>

        {/* Card 4: Asosiy stansiya */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold">Eng ko‘p nosozlik bergan stansiya</span>
            <Building className="w-4 h-4 text-indigo-500" />
          </div>
          <div>
            <div className="text-lg font-black text-slate-900 dark:text-white truncate">
              {byStation[0]?.station || 'Kengsoy'}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Jami nosozliklarning <b>{byStation[0]?.percent || 0}%</b> qismi
            </div>
          </div>
        </div>
      </div>

      {/* Stansiyalar va Nuqson turlari tahlili */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Antireyting stansiyalar */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
            <Building className="w-4 h-4 text-blue-600" />
            Qaysi stansiyadan eng ko‘p nosoz vagonlar kelyapti? (Stansiyalar antireytingi)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            O‘TY pretenziya xatida aynan qaysi jo‘natuvchi stansiya aybdorligini ko‘rsatuvchi asos
          </p>

          <div className="space-y-3">
            {byStation.length === 0 ? (
              <div className="text-xs text-slate-400 py-4 text-center">Ma‘lumot yo‘q</div>
            ) : (
              byStation.slice(0, 5).map(st => (
                <div key={st.station}>
                  <div className="flex items-center justify-between text-xs mb-1 font-medium">
                    <span className="text-slate-800 dark:text-slate-200 font-semibold">{st.station}</span>
                    <span className="font-mono text-slate-500 dark:text-slate-400">{st.count} ta vagon ({st.percent}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-600 h-full rounded-full transition-all"
                      style={{ width: `${st.percent}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Nuqson turlari */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-amber-600" />
            Eng ko‘p uchrayotgan defekt turlari
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Texnik kamchiliklar, lyuk va kran nosozliklari bo‘yicha taqsimot
          </p>

          <div className="space-y-3">
            {byType.length === 0 ? (
              <div className="text-xs text-slate-400 py-4 text-center">Ma‘lumot yo‘q</div>
            ) : (
              byType.slice(0, 5).map(tp => (
                <div key={tp.type}>
                  <div className="flex items-center justify-between text-xs mb-1 font-medium">
                    <span className="text-slate-800 dark:text-slate-200 font-semibold">{tp.type}</span>
                    <span className="font-mono text-slate-500 dark:text-slate-400">{tp.count} ta ({tp.percent}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-amber-500 h-full rounded-full transition-all"
                      style={{ width: `${tp.percent}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Toolbar / Filters */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="thub-pills" role="group">
            <button
              type="button"
              className={stationFilter === 'all' ? 'is-on' : undefined}
              onClick={() => setStationFilter('all')}
            >
              Barcha stansiyalar ({items.length})
            </button>
            {byStation.slice(0, 3).map(s => (
              <button
                key={s.station}
                type="button"
                className={stationFilter === s.station ? 'is-on' : undefined}
                onClick={() => setStationFilter(s.station)}
              >
                {s.station} ({s.count})
              </button>
            ))}
          </div>
        </div>

        <label className="thub-search min-w-[240px]">
          <Search className="thub-search__ico" strokeWidth={1.75} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Akt raqami, vagon, defekt izohi..."
          />
        </label>
      </div>

      {/* GU-23 Dalolatnomalar jadvali */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              GU-23 Dalolatnomalari va Pretenziyalar reyestri
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Ushbu ma‘lumotlar zavod yuristlari uchun O‘TY bilan rasmiy da‘vo (pretenziya) ishlarini yuritishda 100% rasmiy asos bo‘ladi.
            </p>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
            {filteredItems.length} ta dalolatnoma
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/75 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="py-3 px-3 w-12 text-center">№</th>
                <th className="py-3 px-3 font-bold">Dalolatnoma № (GU-23)</th>
                <th className="py-3 px-3">Vagon №</th>
                <th className="py-3 px-3">Kelgan sana</th>
                <th className="py-3 px-3">Jo‘natuvchi stansiya</th>
                <th className="py-3 px-3">Nosozlik turi</th>
                <th className="py-3 px-3">Nuqson tavsifi</th>
                <th className="py-3 px-3 text-center">Kechikish (soat)</th>
                <th className="py-3 px-3">Pretenziya asosi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    Nosozliklar qayd etilmagan
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, index) => (
                  <tr
                    key={`${item.wagonNumber}_${index}`}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
                  >
                    <td className="py-3 px-3 text-center text-slate-400 font-mono">{index + 1}</td>
                    <td className="py-3 px-3 font-bold font-mono text-indigo-600 dark:text-indigo-400">
                      {item.actNumber}
                    </td>
                    <td className="py-3 px-3 font-bold font-mono text-slate-900 dark:text-white">
                      {item.wagonNumber}
                    </td>
                    <td className="py-3 px-3 text-slate-500 dark:text-slate-400 font-mono">
                      {fmtDate(item.arrivalDate)}
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-800 dark:text-slate-200">
                      {item.station}
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300">
                        {item.actType}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-300 max-w-xs">
                      {item.defectReason}
                    </td>
                    <td className="py-3 px-3 text-center font-bold font-mono text-rose-600 dark:text-rose-400">
                      +{item.delayHours} soat
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 flex items-center gap-1 w-max">
                        <CheckCircle2 className="w-3 h-3" />
                        100% Rasmiy asos
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
