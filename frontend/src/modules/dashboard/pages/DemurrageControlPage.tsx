import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Timer,
  Clock,
  ArrowRight,
  Search,
  FileSpreadsheet,
  CheckCircle2,
  Layers,
  Train,
  RefreshCw,
  Flame,
  ShieldAlert,
  Settings,
  AlertTriangle,
  X,
} from 'lucide-react';
import { api } from '../../../shared/services/api';
import { useAuth } from '../../../shared/contexts/AuthContext';
import type { EmptyWagonArrival, LoadingRegistry } from '../../../shared/types';
import { ReportsHistoryTabs } from '../components/ReportsHistoryTabs';
import { TariffSettingsModal } from '../components/TariffSettingsModal';
import {
  buildDemurrageAnalysis,
  type DemurrageWagonItem,
} from '../utils/demurrageUtils';
import { WagonStopwatchModal } from '../components/WagonStopwatchModal';
import { exportSheet, todayStamp } from '../../../shared/utils/excelExport';
import { subscribeOrdersChanged } from '../../../shared/utils/realtimeSync';

function fmtMoney(amount: number): string {
  return new Intl.NumberFormat('uz-UZ').format(amount);
}

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
  }).format(d);
}

export function DemurrageControlPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const navigate = useNavigate();
  const [arrivals, setArrivals] = useState<EmptyWagonArrival[]>([]);
  const [registries, setRegistries] = useState<LoadingRegistry[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [ownershipFilter, setOwnershipFilter] = useState<'all' | 'tashqi' | 'majmua'>('all');
  const [zoneFilter, setZoneFilter] = useState<'all' | 'red' | 'yellow' | 'green'>('all');
  const [stepFilter] = useState<string>('all');
  const [historyScope, setHistoryScope] = useState<'active' | 'exited' | 'all'>('active');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [isTariffModalOpen, setIsTariffModalOpen] = useState(false);
  const [tariffVersion, setTariffVersion] = useState(0);
  const [selectedWagonForStopwatch, setSelectedWagonForStopwatch] = useState<DemurrageWagonItem | null>(null);

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
    } catch {
      // ignore
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    return subscribeOrdersChanged(() => loadData(true));
  }, []);

  const { items, summary } = useMemo(() => {
    return buildDemurrageAnalysis(arrivals, registries);
  }, [arrivals, registries, tariffVersion]);

  const filteredItems = useMemo(() => {
    return items.filter(w => {
      if (historyScope === 'active' && w.isExited) return false;
      if (historyScope === 'exited' && !w.isExited) return false;
      if (ownershipFilter !== 'all' && w.ownership !== ownershipFilter) return false;
      if (zoneFilter !== 'all' && w.zone !== zoneFilter) return false;
      if (stepFilter !== 'all' && w.currentStep !== stepFilter) return false;
      if (roleFilter !== 'all' && w.delayCulprit?.role !== roleFilter) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesWagon = w.wagonNumber.toLowerCase().includes(q);
        const matchesArrival = w.arrivalNumber.toLowerCase().includes(q);
        const matchesProduct = (w.productType || '').toLowerCase().includes(q);
        const matchesContractor = (w.contractorName || '').toLowerCase().includes(q);
        const matchesCulprit = (w.delayCulprit?.role || '').toLowerCase().includes(q) ||
          (w.delayCulprit?.stageName || '').toLowerCase().includes(q) ||
          (w.delayCulprit?.employee || '').toLowerCase().includes(q);
        return matchesWagon || matchesArrival || matchesProduct || matchesContractor || matchesCulprit;
      }
      return true;
    });
  }, [items, historyScope, ownershipFilter, zoneFilter, stepFilter, roleFilter, search]);

  const exportExcel = () => {
    exportSheet(`prostoy_jarima_${todayStamp()}.xlsx`, 'Prostoy nazorati', [
      ['Vagonlarning to‘xtab turish vaqti (Prostoy) va Jarima hisoboti', `Sana: ${new Date().toLocaleDateString()}`],
      [],
      [
        'FIFO №',
        'Vagon №',
        'Partiya №',
        'Egaligi',
        'Mahsulot',
        'Kelgan vaqti',
        'Hududdagi vaqt (soat)',
        'Xavf zonasi',
        'Joriy bosqich',
        'Kechikish sababchisi (Rol / Xizmat)',
        'Sababchi bosqich / Izoh',
        'Normativ (soat)',
        'Ortiqcha turish (soat)',
        'Taxminiy jarima (so‘m)',
        'Mijoz / Kontragent',
        'Manzil stansiya',
      ],
      ...filteredItems.map((item, idx) => [
        idx + 1,
        item.wagonNumber,
        item.arrivalNumber,
        item.ownership === 'tashqi' ? "Tashqi (O'TY)" : 'Majmua',
        item.productType,
        fmtDate(item.arrivalDate),
        item.hoursInPlant,
        item.zone === 'red' ? 'Qizil (>8.9s / >533 daq)' : item.zone === 'yellow' ? 'Sariq (6-8.9s)' : 'Yashil (<6s)',
        item.stageLabel,
        item.delayCulprit?.role || '—',
        item.delayCulprit?.explanation || (item.delayCulprit?.employee ? `Mas'ul: ${item.delayCulprit.employee}` : '—'),
        item.normativeHours,
        item.overdueHours,
        item.estimatedPenaltyUzs,
        item.contractorName || '—',
        item.destinationStation || '—',
      ]),
    ]);
  };

  return (
    <div className="thub min-h-screen">
      <ReportsHistoryTabs active="demurrage" />

      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-semibold text-xs tracking-wider uppercase">
            <Timer className="w-4 h-4" />
            1. Operativ monitoring & O‘TY jarima nazorati
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            Vagonlarning to‘xtab turish vaqti (Prostoy) & O‘TY Jarimalari
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Vagonlarning zavod hududida turish vaqti, O‘TY soatbay jarimalari xavfi, bosqichlar bo‘yicha kechikish tahlili va Dispetcherlik FIFO navbati.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && <button
            type="button"
            onClick={() => setIsTariffModalOpen(true)}
            className="thub-btn thub-btn-secondary"
            title="O'TY soatbay jarima stavkasi va bepul normativ soatlarini sozlash"
          >
            <Settings className="w-4 h-4 text-slate-500" />
            <span>Tarif sozlamalari</span>
          </button>}

          <button
            type="button"
            onClick={() => loadData()}
            disabled={loading}
            className="thub-btn thub-btn-secondary"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Yangilash</span>
          </button>

          <button
            type="button"
            onClick={exportExcel}
            className="thub-btn thub-btn-secondary"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Excel eksport</span>
          </button>
        </div>
      </div>

            {/* Official Norm Banner */}
      <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-emerald-500/10 border border-blue-200/80 dark:border-blue-900/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <span className="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-bold tracking-wide uppercase text-[10px]">
            Rasmiy me'yor: 2-tahrir
          </span>
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            «Sho'rtan GKM» MCHJ Bosh direktori Sh.Ch. Aslanov tasdiqlagan Jarayon reglamenti bo‘yicha texnologik me'yor: <b className="text-blue-600 dark:text-blue-400">533 daqiqa (8 soat 53 daqiqa)</b>
          </span>
        </div>
        <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 shrink-0">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Yashil: &lt;6s</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /> Sariq: 6–8.9s</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500" /> Qizil: &gt;8.9s</span>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Card 1: Hududda jami vagonlar */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold">Hududda jami vagonlar</span>
            <Layers className="w-5 h-5 text-blue-500" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2 tabular-nums">
            {summary.totalActive} <span className="text-sm font-medium text-slate-400">ta</span>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              {summary.tashqiCount} Tashqi (O‘TY)
            </span>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <span className="inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              {summary.majmuaCount} Majmua
            </span>
          </div>
        </div>

        {/* Card 2: Qizil xavf zonasi */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/50 shadow-sm bg-gradient-to-br from-rose-50/50 via-white to-white dark:from-rose-950/20 dark:via-slate-900 dark:to-slate-900 relative overflow-hidden">
          <div className="flex items-center justify-between text-rose-600 dark:text-rose-400">
            <span className="text-xs font-semibold">Qizil xavf zonasi (&gt;8.9 soat)</span>
            <Flame className="w-5 h-5 text-rose-600 animate-pulse" />
          </div>
          <div className="text-3xl font-extrabold text-rose-600 dark:text-rose-400 mt-2 tabular-nums">
            {summary.redCount} <span className="text-sm font-medium text-rose-400">ta vagon</span>
          </div>
          <div className="mt-3 text-xs text-rose-700 dark:text-rose-300 font-medium">
            Shundan {summary.redTashqiCount} tasi Tashqi vagon (Darhol yuklash zarur!)
          </div>
        </div>

        {/* Card 3: Sariq xavf zonasi */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/50 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
            <span className="text-xs font-semibold">Sariq ogohlantirish (6–8.9 soat)</span>
            <Clock className="w-5 h-5 text-amber-500" />
          </div>
          <div className="text-3xl font-extrabold text-amber-600 dark:text-amber-400 mt-2 tabular-nums">
            {summary.yellowCount} <span className="text-sm font-medium text-amber-400">ta vagon</span>
          </div>
          <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Normagacha 4–8 soat qolgan (Yuklashga tayyorlash kerak)
          </div>
        </div>

        {/* Card 4: Taxminiy Jarima */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold">O‘TY taxminiy jarimasi</span>
            <ShieldAlert className="w-5 h-5 text-rose-500" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2 tabular-nums">
            {fmtMoney(summary.totalPenaltyUzs)}{' '}
            <span className="text-xs font-normal text-slate-400">so‘m</span>
          </div>
          <div className="mt-3 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>O‘rtacha hududda: <b>{summary.avgHoursInPlant} soat</b></span>
            <span className="text-emerald-600 font-semibold">{summary.greenCount} ta me‘yorda</span>
          </div>
        </div>
      </div>

      {/* Bosqichlar bo'yicha Kechikish (Funnel / Bottleneck) & Rollar Antireytingi */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Train className="w-5 h-5 text-blue-600" />
              Operativ bosqichlar tahlili: Vagonlar qayerda ko‘proq turib qolmoqda?
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Har bir bosqichning o‘rtacha davomiyligi (soatlarda).
            </p>
          </div>
          <div className="text-xs px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900 font-medium">
            Asosiy tor joy: <b className="text-slate-700 dark:text-slate-200">{summary.stageBottlenecks.bottleneckStage}</b>
          </div>
        </div>

        {/* 5 Stages Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">1. Kiritish & Tara tortish</div>
            <div className="text-xl font-bold text-slate-800 dark:text-white mt-1 tabular-nums">
              {summary.stageBottlenecks.tareAvgHours} <span className="text-xs font-normal text-slate-400">soat</span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-blue-500 h-full rounded-full"
                style={{ width: `${Math.min(100, (summary.stageBottlenecks.tareAvgHours / 12) * 100)}%` }}
              />
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
            <div className="text-xs text-amber-600 dark:text-amber-400 font-semibold flex items-center justify-between">
              <span>2. Estakada yuklash</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500 text-white">Tor joy</span>
            </div>
            <div className="text-xl font-bold text-amber-700 dark:text-amber-300 mt-1 tabular-nums">
              {summary.stageBottlenecks.loadingAvgHours} <span className="text-xs font-normal">soat</span>
            </div>
            <div className="w-full bg-amber-200 dark:bg-amber-950 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-amber-500 h-full rounded-full"
                style={{ width: `${Math.min(100, (summary.stageBottlenecks.loadingAvgHours / 12) * 100)}%` }}
              />
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">3. Brutto tortish</div>
            <div className="text-xl font-bold text-slate-800 dark:text-white mt-1 tabular-nums">
              {summary.stageBottlenecks.scaleAvgHours} <span className="text-xs font-normal text-slate-400">soat</span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-blue-500 h-full rounded-full"
                style={{ width: `${Math.min(100, (summary.stageBottlenecks.scaleAvgHours / 12) * 100)}%` }}
              />
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">4. Plombalash & Hujjat</div>
            <div className="text-xl font-bold text-slate-800 dark:text-white mt-1 tabular-nums">
              {summary.stageBottlenecks.sealAvgHours} <span className="text-xs font-normal text-slate-400">soat</span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-amber-500 h-full rounded-full"
                style={{ width: `${Math.min(100, (summary.stageBottlenecks.sealAvgHours / 12) * 100)}%` }}
              />
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">5. Chiqish / Kengsoy topshirish</div>
            <div className="text-xl font-bold text-slate-800 dark:text-white mt-1 tabular-nums">
              {summary.stageBottlenecks.dispatchAvgHours} <span className="text-xs font-normal text-slate-400">soat</span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full"
                style={{ width: `${Math.min(100, (summary.stageBottlenecks.dispatchAvgHours / 12) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Kechikish Sababchilari (Rollar & Xizmatlar antireytingi) */}
        {summary.roleDelayStats && summary.roleDelayStats.length > 0 && (
          <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500" />
                <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  🚨 Kechikish sababchilari — Xizmatlar va Mas‘ul rollar tahlili (Antireyting)
                </span>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                (Karta ustiga bosib, aynan shu xizmat ushlab qolgan vagonlarni filtrlang)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {summary.roleDelayStats.map((st) => {
                const isSelected = roleFilter === st.roleName;
                return (
                  <div
                    key={st.roleName}
                    onClick={() => setRoleFilter(isSelected ? 'all' : st.roleName)}
                    className={`p-3 rounded-xl border transition cursor-pointer select-none ${
                      isSelected
                        ? 'ring-2 ring-blue-500 border-transparent shadow-sm'
                        : 'hover:border-slate-300 dark:hover:border-slate-700'
                    } ${st.color}`}
                    title="Bosganda pastdagi jadval faqat ushbu xizmat kechiktirgan vagonlar bo‘yicha filtrlanadi"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs">{st.roleName}</span>
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-white/90 dark:bg-black/50 shadow-xs">
                        +{st.totalDelayHours} soat
                      </span>
                    </div>
                    <div className="text-[11px] opacity-80 mt-0.5">{st.department}</div>
                    <div className="mt-2.5 flex items-center justify-between text-[11px] pt-2 border-t border-current/15">
                      <span>Kechiktirilgan vagonlar:</span>
                      <span className="font-bold">{st.delayedWagonsCount} ta vagon</span>
                    </div>
                    {st.totalPenaltyUzs > 0 && (
                      <div className="mt-1.5 flex items-center justify-between text-[11px] pt-1.5 border-t border-dashed border-rose-300 dark:border-rose-900/60 font-semibold text-rose-700 dark:text-rose-300">
                        <span>Yuklatilgan O‘TY jarimasi:</span>
                        <span className="font-mono font-bold">{fmtMoney(st.totalPenaltyUzs)} so‘m</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Toolbar / Filters */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Scope */}
          <div className="thub-pills" role="group">
            <button
              type="button"
              className={historyScope === 'active' ? 'is-on' : undefined}
              onClick={() => setHistoryScope('active')}
            >
              Hozir hududda ({summary.totalActive})
            </button>
            <button
              type="button"
              className={historyScope === 'exited' ? 'is-on' : undefined}
              onClick={() => setHistoryScope('exited')}
            >
              Chiqib ketganlar ({summary.totalExited})
            </button>
            <button
              type="button"
              className={historyScope === 'all' ? 'is-on' : undefined}
              onClick={() => setHistoryScope('all')}
            >
              Barcha tarix ({items.length})
            </button>
          </div>

          {/* Zone filter */}
          <div className="thub-pills" role="group">
            <button
              type="button"
              className={zoneFilter === 'all' ? 'is-on' : undefined}
              onClick={() => setZoneFilter('all')}
            >
              Barcha zonalar
            </button>
            <button
              type="button"
              className={zoneFilter === 'red' ? 'is-on' : undefined}
              onClick={() => setZoneFilter('red')}
            >
              <span className="w-2 h-2 rounded-full bg-rose-500 inline-block mr-1" />
              Qizil ({summary.redCount})
            </button>
            <button
              type="button"
              className={zoneFilter === 'yellow' ? 'is-on' : undefined}
              onClick={() => setZoneFilter('yellow')}
            >
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block mr-1" />
              Sariq ({summary.yellowCount})
            </button>
            <button
              type="button"
              className={zoneFilter === 'green' ? 'is-on' : undefined}
              onClick={() => setZoneFilter('green')}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block mr-1" />
              Yashil ({summary.greenCount})
            </button>
          </div>

          {/* Ownership */}
          <div className="thub-pills" role="group">
            <button
              type="button"
              className={ownershipFilter === 'all' ? 'is-on' : undefined}
              onClick={() => setOwnershipFilter('all')}
            >
              Barcha egalik
            </button>
            <button
              type="button"
              className={ownershipFilter === 'tashqi' ? 'is-on' : undefined}
              onClick={() => setOwnershipFilter('tashqi')}
            >
              🔴 Tashqi (O‘TY jarima xavfi)
            </button>
            <button
              type="button"
              className={ownershipFilter === 'majmua' ? 'is-on' : undefined}
              onClick={() => setOwnershipFilter('majmua')}
            >
              🔵 Majmua vagonlari
            </button>
          </div>

          {/* Active Role Filter Badge */}
          {roleFilter !== 'all' && (
            <button
              type="button"
              onClick={() => setRoleFilter('all')}
              className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200 border border-rose-300 dark:border-rose-800 flex items-center gap-1.5"
              title="Filtrni bekor qilish"
            >
              <span>Sababchi: <b>{roleFilter}</b></span>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Vagon №, partiya, xodim..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* FIFO Navbat Jadvali */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden mb-6">
        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Flame className="w-4 h-4 text-rose-500" />
              Dispetcherlik FIFO Navbati — Birinchi navbatda qaysi vagonlarni yuklab jo‘natish kerak?
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              1-navbatda: O‘TY jarimasi o‘sayotgan Tashqi vagonlar (&gt;8.9 soat me‘yordan oshgan), keyin qolgan vagonlar tartiblangan.
            </p>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
            {filteredItems.length} ta vagon ko‘rsatilmoqda
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/75 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="py-3 px-3 w-16 text-center">FIFO №</th>
                <th className="py-3 px-3 font-bold">Vagon №</th>
                <th className="py-3 px-3">Egaligi</th>
                <th className="py-3 px-3">Partiya & Mahsulot</th>
                <th className="py-3 px-3">Kelgan vaqti</th>
                <th className="py-3 px-3">Hududdagi vaqt</th>
                <th className="py-3 px-3">Xavf darajasi</th>
                <th className="py-3 px-3">Joriy bosqich</th>
                <th className="py-3 px-3">Kechikish sababchisi</th>
                <th className="py-3 px-3">Taxminiy jarima</th>
                <th className="py-3 px-3 text-right">Amal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-400">
                    Mos keluvchi vagonlar topilmadi
                  </td>
                </tr>
              ) : (
                filteredItems.map((wagon, index) => {
                  const isRed = wagon.zone === 'red';
                  const isYellow = wagon.zone === 'yellow';
                  const isTashqi = wagon.ownership === 'tashqi';

                  return (
                    <tr
                      key={wagon.id}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition ${
                        isRed && isTashqi ? 'bg-rose-50/40 dark:bg-rose-950/20' : ''
                      }`}
                    >
                      {/* Priority */}
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-bold text-xs ${
                            index < 3 && isRed
                              ? 'bg-rose-600 text-white shadow-sm'
                              : isYellow
                              ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {index + 1}
                        </span>
                      </td>

                      {/* Wagon Number */}
                      <td className="py-3 px-3 font-bold font-mono text-slate-900 dark:text-white">
                        <div className="flex items-center gap-1.5">
                          <span>{wagon.wagonNumber}</span>
                          {isRed && <span className="inline-block w-2 h-2 rounded-full bg-rose-500 animate-pulse" />}
                        </div>
                      </td>

                      {/* Ownership */}
                      <td className="py-3 px-3">
                        {wagon.ownership === 'tashqi' ? (
                          <span className="px-2 py-0.5 rounded-full font-semibold text-[10px] bg-rose-100 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
                            Tashqi (O‘TY)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full font-medium text-[10px] bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                            Majmua
                          </span>
                        )}
                      </td>

                      {/* Batch & Product */}
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {wagon.arrivalNumber}
                        </div>
                        <div className="text-[11px] text-slate-400">{wagon.productType}</div>
                      </td>

                      {/* Arrival date */}
                      <td className="py-3 px-3 text-slate-500 dark:text-slate-400 font-mono">
                        {fmtDate(wagon.arrivalDate)}
                      </td>

                      {/* Hours in plant */}
                      <td className="py-3 px-3 font-bold text-sm tabular-nums">
                        <span
                          className={
                            isRed
                              ? 'text-rose-600 dark:text-rose-400'
                              : isYellow
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }
                        >
                          {wagon.hoursInPlant} soat
                        </span>
                        <div className="text-[10px] text-slate-400 font-normal">
                          Norma: {wagon.normativeHours}s
                        </div>
                      </td>

                      {/* Risk Zone Badge */}
                      <td className="py-3 px-3">
                        {isRed ? (
                          <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-rose-500 text-white flex items-center gap-1 w-max">
                            <Flame className="w-3 h-3" />
                            Qizil (&gt;8.9s)
                          </span>
                        ) : isYellow ? (
                          <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-amber-400 text-amber-950 flex items-center gap-1 w-max">
                            <Clock className="w-3 h-3" />
                            Sariq (6–8.9s)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full font-semibold text-[10px] bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 flex items-center gap-1 w-max">
                            <CheckCircle2 className="w-3 h-3" />
                            Me‘yorda
                          </span>
                        )}
                      </td>

                      {/* Stage */}
                      <td className="py-3 px-3 font-medium text-slate-700 dark:text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${wagon.isExited ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                          <span>{wagon.stageLabel}</span>
                        </div>
                      </td>

                      {/* Kechikish sababchisi (Mas'ul xizmat) */}
                      <td className="py-3 px-3">
                        {wagon.delayCulprit ? (
                          <div className="flex flex-col">
                            <span className="font-semibold text-xs text-rose-700 dark:text-rose-300 flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                              {wagon.delayCulprit.role}
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400" title={wagon.delayCulprit.explanation}>
                              {wagon.delayCulprit.stageName} (+{wagon.delayCulprit.hours}s)
                            </span>
                            {wagon.delayCulprit.employee && (
                              <span className="text-[9px] text-slate-400 font-medium">
                                Mas‘ul: {wagon.delayCulprit.employee}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">—</span>
                        )}
                      </td>

                      {/* Penalty */}
                      <td className="py-3 px-3 font-mono">
                        {wagon.estimatedPenaltyUzs > 0 ? (
                          <div className="font-bold text-rose-600 dark:text-rose-400">
                            {fmtMoney(wagon.estimatedPenaltyUzs)} so‘m
                            <span className="block text-[10px] font-normal text-rose-500">
                              +{wagon.overdueHours} soat kechikish
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">0 so‘m (Jarimasiz)</span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedWagonForStopwatch(wagon)}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800/80 transition flex items-center gap-1"
                            title="10 bosqichli daqiqabay xronometraj va jarima taqsimotini ko‘rish"
                          >
                            <Timer className="w-3.5 h-3.5" />
                            <span>Xronometraj</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => navigate('/transport/tared')}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition flex items-center gap-1"
                          >
                            <span>O‘tish</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
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

      <WagonStopwatchModal
        wagon={selectedWagonForStopwatch}
        isOpen={!!selectedWagonForStopwatch}
        onClose={() => setSelectedWagonForStopwatch(null)}
      />
    </div>
  );
}
