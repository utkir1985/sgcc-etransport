import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  BarChart3,
  Boxes,
  CheckCircle2,
  ClipboardList,
  History,
  Hourglass,
  LayoutGrid,
  Package,
  TrendingUp,
  MapPin,
  Timer,
  TriangleAlert,
  Lock,
  FileSpreadsheet,
} from 'lucide-react';
import { api } from '../../../shared/services/api';
import type { EmptyWagonArrival, LoadingRegistry, MonthlyOrder } from '../../../shared/types';
import { DatePicker } from '../../../shared/components/DatePicker';
import { OrderPeriodPicker } from '../../../shared/components/OrderPeriodPicker';
import { HubZoneTabs } from '../../../shared/components/HubZoneTabs';
import { GroupedColumnsChart, RankedBars } from '../components/StatCharts';
import { ReportsHistoryTabs } from '../components/ReportsHistoryTabs';
import { exportSheets, todayStamp } from '../../../shared/utils/excelExport';
import type { HubZoneTone } from '../../../shared/components/HubZoneTabs';
import { LOGISTICS_TYPES } from '../../../shared/constants/logisticsTypes';
import { formatDateUz, formatPeriodRangeLabel, defaultYearMonthFromRange, parseIsoDate, monthRangeIso } from '../../../shared/utils/dates';
import { subscribeOrdersChanged } from '../../../shared/utils/realtimeSync';
import {
  buildTrendSeries,
  computeCycleReport,
  computeDestinationReport,
  computeExceptionReport,
  computeKindReport,
  computeOrdersPeriodStats,
  computeOwnershipReport,
  computePeriodReport,
  fmtTon,
  listFlowParties,
  localDateKey,
  weekEndOf,
  weekStartOf,
  type ReportLane,
  type ReportMode,
} from '../utils/reportsHub';

function todayKey() {
  return localDateKey(new Date().toISOString());
}

/** Joriy oyning statistik oralig'i: 1-sanadan bugungi (yoki oy oxiri) sanagacha. */
function currentMonthRange() {
  const now = new Date();
  return monthRangeIso(now.getFullYear(), now.getMonth() + 1);
}

function toMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Soatni odam o‘qiydigan ko‘rinishga keltiradi: 5,4 soat yoki 2 kun 6 soat. */
function fmtHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return '—';
  if (hours < 24) return `${Math.round(hours * 10) / 10} soat`;
  const days = Math.floor(hours / 24);
  const rest = Math.round(hours - days * 24);
  return rest === 0 ? `${days} kun` : `${days} kun ${rest} soat`;
}

function fmtAt(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const LANES: Array<{
  id: ReportLane;
  label: string;
  hint: string;
  icon: typeof LayoutGrid;
  tone: HubZoneTone;
}> = [
  { id: 'overview', label: 'Umumiy', hint: 'Davr ko‘rsatkichlari', icon: LayoutGrid, tone: 'sky' },
  { id: 'products', label: 'Mahsulot', hint: 'Mahsulot kesimi', icon: Package, tone: 'platform' },
  { id: 'destinations', label: 'Yo‘nalish', hint: 'Kontragent · stansiya', icon: MapPin, tone: 'sisterna' },
  { id: 'ownership', label: 'Egalik', hint: 'Majmua / tashqi', icon: Boxes, tone: 'amber' },
  { id: 'kinds', label: 'Vagon turi', hint: 'Sisterna / yopiq / platforma', icon: BarChart3, tone: 'container' },
  { id: 'cycle', label: 'Aylanma', hint: 'Kirishdan chiqishgacha', icon: Timer, tone: 'done' },
  { id: 'exceptions', label: 'Istisnolar', hint: 'Dalolatnoma · plomba', icon: TriangleAlert, tone: 'rose' },
  { id: 'orders', label: 'Buyurtmalar', hint: 'Davrdagi buyurtmalar', icon: ClipboardList, tone: 'closed' },
  { id: 'trend', label: 'Tendensiya', hint: 'Oxirgi kunlar / oylar', icon: TrendingUp, tone: 'emerald' },
];

const FLOW_KIND_LABEL = {
  kirish: 'Kirish',
  yuklash: 'Yuklash',
  chiqish: 'Chiqish',
} as const;

/** Oqim filtri → Jarayonlar tarixidagi mos tab. */
const FLOW_TO_HISTORY_TAB: Record<'all' | 'kirish' | 'yuklash' | 'chiqish', string> = {
  all: 'timeline',
  kirish: 'entries',
  yuklash: 'loads',
  chiqish: 'exits',
};

export default function ReportsPage() {
  const navigate = useNavigate();
  const [lane, setLane] = useState<ReportLane>('overview');
  const [mode, setMode] = useState<ReportMode>('daily');
  const [day, setDay] = useState(todayKey);
  const [week, setWeek] = useState(() => weekStartOf(todayKey()));
  const [monthFrom, setMonthFrom] = useState(() => currentMonthRange().from);
  const [monthTo, setMonthTo] = useState(() => currentMonthRange().to);
  const [flowKind, setFlowKind] = useState<'all' | 'kirish' | 'yuklash' | 'chiqish'>('all');
  const [trendUnit, setTrendUnit] = useState<'wagons' | 'tons'>('wagons');
  const [loading, setLoading] = useState(true);
  const [arrivals, setArrivals] = useState<EmptyWagonArrival[]>([]);
  const [registries, setRegistries] = useState<LoadingRegistry[]>([]);
  const [orders, setOrders] = useState<MonthlyOrder[]>([]);

  const monthParts = defaultYearMonthFromRange(monthFrom, monthTo);
  const month = toMonthKey(monthParts.year, monthParts.month);
  const periodKey = mode === 'daily' ? day : mode === 'weekly' ? week : month;
  const periodLabel = mode === 'daily'
    ? (parseIsoDate(day) ? formatDateUz(day) : day)
    : mode === 'weekly'
      ? `${formatDateUz(week)} — ${formatDateUz(weekEndOf(week))}`
      : formatPeriodRangeLabel(monthFrom, monthTo);

  // Statistikada tanlangan davrning ISO sana oralig'i — Jarayonlar tarixiga
  // o'tishda (Dan/Gacha) aynan shu davrni ochish uchun ishlatiladi.
  const periodDateRange = mode === 'daily'
    ? { from: day, to: day }
    : mode === 'weekly'
      ? { from: week, to: weekEndOf(week) }
      : { from: monthFrom, to: monthTo };

  const openFlowInHistory = () => {
    const params = new URLSearchParams();
    params.set('tab', FLOW_TO_HISTORY_TAB[flowKind]);
    if (periodDateRange.from) params.set('from', periodDateRange.from);
    if (periodDateRange.to) params.set('to', periodDateRange.to);
    navigate(`/history?${params.toString()}`);
  };

  const load = (silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([
      api.getEmptyWagonArrivals().catch(() => ({ data: [] as EmptyWagonArrival[] })),
      api.getLoadingRegistries().catch(() => ({ data: [] as LoadingRegistry[] })),
      api.getOrders(LOGISTICS_TYPES.Railway).catch(() => ({ data: [] as MonthlyOrder[] })),
    ])
      .then(([a, r, o]) => {
        setArrivals(a.data ?? []);
        setRegistries(r.data ?? []);
        setOrders(o.data ?? []);
      })
      .finally(() => {
        if (!silent) setLoading(false);
      });
  };

  useEffect(() => {
    load();
    return subscribeOrdersChanged(() => load(true));
  }, []);

  const report = useMemo(
    () => computePeriodReport(arrivals, registries, mode, periodKey),
    [arrivals, registries, mode, periodKey],
  );
  const ownership = useMemo(
    () => computeOwnershipReport(arrivals, registries, mode, periodKey),
    [arrivals, registries, mode, periodKey],
  );
  const kinds = useMemo(
    () => computeKindReport(arrivals, registries, mode, periodKey),
    [arrivals, registries, mode, periodKey],
  );
  const orderStats = useMemo(
    () => computeOrdersPeriodStats(orders, mode, periodKey),
    [orders, mode, periodKey],
  );
  const trend = useMemo(
    () => buildTrendSeries(arrivals, registries, mode, periodKey),
    [arrivals, registries, mode, periodKey],
  );
  const flowRows = useMemo(
    () => listFlowParties(arrivals, registries, mode, periodKey, flowKind),
    [arrivals, registries, mode, periodKey, flowKind],
  );
  const flowWagonsTotal = useMemo(() => flowRows.reduce((s, r) => s + r.wagons, 0), [flowRows]);
  const flowTonsTotal = useMemo(() => flowRows.reduce((s, r) => s + r.tons, 0), [flowRows]);
  const destinations = useMemo(
    () => computeDestinationReport(arrivals, registries, mode, periodKey),
    [arrivals, registries, mode, periodKey],
  );
  const cycle = useMemo(
    () => computeCycleReport(arrivals, registries, mode, periodKey),
    [arrivals, registries, mode, periodKey],
  );
  const exceptions = useMemo(
    () => computeExceptionReport(arrivals, registries, mode, periodKey),
    [arrivals, registries, mode, periodKey],
  );

  const laneCounts: Record<ReportLane, number> = {
    overview: report.kirish.wagons + report.yuklash.wagons + report.chiqish.wagons,
    flow: flowRows.length,
    products: report.byProduct.length,
    destinations: destinations.length,
    ownership: ownership.majmua.wagons + ownership.tashqi.wagons,
    kinds: kinds.reduce((s, k) => s + k.kirish + k.yuklash + k.chiqish, 0),
    cycle: cycle.measured,
    exceptions: exceptions.rows.length,
    orders: orderStats.total,
    trend: trend.length,
  };

  // Chap menyu o'rniga — Jarayonlar tarixidagi kabi tepada tab qatori.
  const laneTabs = LANES.map(item => ({
    ...item,
    count: loading ? '—' : laneCounts[item.id],
  }));

  // Davrning asosiy mahsuloti — jo‘natilgan tonnasi eng katta bo‘lgani.
  const topProduct = [...report.byProduct]
    .filter(p => p.chiqish.tons > 0)
    .sort((a, b) => b.chiqish.tons - a.chiqish.tons)[0];
  const shippedProducts = [...report.byProduct]
    .filter(p => p.chiqish.wagons > 0 || p.yuklash.wagons > 0)
    .sort((a, b) => b.chiqish.tons - a.chiqish.tons);

  /** Joriy davrdagi barcha bo'limlarni bitta Excel fayliga chiqaradi. */
  const exportExcel = () => {
    const head = [['Statistika', periodLabel], []];
    exportSheets(`statistika_${periodKey}_${todayStamp()}.xlsx`, [
      {
        name: 'Umumiy',
        rows: [
          ...head,
          ['Ko‘rsatkich', 'Vagon', 'Tonna'],
          ['Kirish', report.kirish.wagons, '—'],
          ['Yuklash', report.yuklash.wagons, report.yuklash.tons],
          ['Chiqish', report.chiqish.wagons, report.chiqish.tons],
          [],
          ['Mahsulot', 'Yuklangan, vagon', 'Yuklangan, t', 'Jo‘natilgan, vagon', 'Jo‘natilgan, t'],
          ...shippedProducts.map(r => [r.label, r.yuklash.wagons, r.yuklash.tons, r.chiqish.wagons, r.chiqish.tons]),
        ],
      },
      {
        name: 'Oqim',
        rows: [
          ['Turi', 'Raqam', 'Mahsulot', 'Vagon', 'Tonna', 'Egalik', 'Vaqt'],
          ...flowRows.map(r => [FLOW_KIND_LABEL[r.kind], r.number, r.product, r.wagons, r.tons, r.ownership, fmtAt(r.at)]),
        ],
      },
      {
        name: 'Yo‘nalish',
        rows: [
          ['Kontragent', 'Jo‘natish stansiyasi', 'Yuk xati', 'Vagon', 'Tonna'],
          ...destinations.map(r => [r.contractor, r.station, r.registries, r.wagons, r.tons]),
        ],
      },
      {
        name: 'Vagon turi',
        rows: [
          ['Vagon turi', 'Kirish', 'Yuklash', 'Chiqish'],
          ...kinds.map(r => [r.label, r.kirish, r.yuklash, r.chiqish]),
        ],
      },
      {
        name: 'Aylanma',
        rows: [
          ['Ko‘rsatkich', 'Qiymat'],
          ['O‘lchangan vagon', cycle.measured],
          ['O‘rtacha, soat', cycle.avgHours],
          ['Eng tez, soat', cycle.minHours],
          ['Eng uzoq, soat', cycle.maxHours],
          ['Kirishdan yuklashgacha, soat', cycle.avgToLoadHours],
          ['Yuklashdan chiqishgacha, soat', cycle.avgLoadToExitHours],
          [],
          ['Zavodda turish muddati', 'Vagon'],
          ...cycle.buckets.map(b => [b.label, b.count]),
        ],
      },
      {
        name: 'Istisnolar',
        rows: [
          ['Turi', 'Vagon №', 'Yuk xati', 'Izoh'],
          ...exceptions.rows.map(r => [r.kind, r.wagon, r.registry, r.note]),
        ],
      },
      {
        name: 'Tendensiya',
        rows: [
          ['Davr', 'Kirish, vagon', 'Yuklash, vagon', 'Chiqish, vagon', 'Yuklash, t', 'Chiqish, t'],
          ...trend.map(p => [p.label, p.kirish, p.yuklash, p.chiqish, p.tonsLoad, p.tonsOut]),
        ],
      },
      {
        name: 'Buyurtmalar',
        rows: [
          ['Ko‘rsatkich', 'Qiymat'],
          ['Jami', orderStats.total],
          ['Faol', orderStats.faol],
          ['Tasdiqlanayotgan', orderStats.tasdiq],
          ['Yakunlangan', orderStats.yakun],
          ['Vagon', orderStats.wagons],
          ['Tonna', orderStats.tons],
        ],
      },
    ]);
  };

  const periodControls = (
    <div className="thub__toolbar">
      <div className="thub-pills" role="group" aria-label="Davr turi">
        <button type="button" className={mode === 'daily' ? 'is-on' : undefined} onClick={() => setMode('daily')}>
          Kunlik
        </button>
        <button type="button" className={mode === 'weekly' ? 'is-on' : undefined} onClick={() => setMode('weekly')}>
          Haftalik
        </button>
        <button type="button" className={mode === 'monthly' ? 'is-on' : undefined} onClick={() => setMode('monthly')}>
          Oylik
        </button>
      </div>
      {mode === 'daily' ? (
        <label className="rhub-date">
          <span>Sana</span>
          <DatePicker
            value={day}
            onChange={value => setDay(value || todayKey())}
            placeholder="dd.mm.yyyy"
            variant="compact"
          />
        </label>
      ) : mode === 'weekly' ? (
        <label className="rhub-date">
          <span>Hafta</span>
          <DatePicker
            value={week}
            onChange={value => setWeek(weekStartOf(value || todayKey()))}
            placeholder="dd.mm.yyyy"
            variant="compact"
          />
        </label>
      ) : (
        <OrderPeriodPicker
          from={monthFrom}
          to={monthTo}
          variant="embedded"
          onFromChange={value => {
            // Oylik statistika har doim 1-sanadan (oy oxiri yoki bugungi kungacha) hisoblanadi:
            // tanlangan sananing oyi asosida ikkala chegara ham qayta o'rnatiladi.
            const parsed = parseIsoDate(value);
            if (!parsed) { setMonthFrom(value); return; }
            const range = monthRangeIso(parsed.year, parsed.month);
            setMonthFrom(range.from);
            setMonthTo(range.to);
          }}
          onToChange={value => {
            const parsed = parseIsoDate(value);
            if (!parsed) { setMonthTo(value); return; }
            const range = monthRangeIso(parsed.year, parsed.month);
            setMonthFrom(range.from);
            setMonthTo(range.to);
          }}
        />
      )}
      <div className="rhub-period-chip">
        <em>Davr</em>
        <strong>{periodLabel}</strong>
      </div>
      <button
        type="button"
        className="btn-secondary flex items-center gap-1.5"
        onClick={exportExcel}
        disabled={loading}
        title="Joriy davrdagi barcha bo‘limlarni Excel fayliga yuklash"
      >
        <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        <span>Excel yuklash</span>
      </button>
    </div>
  );

  return (
    <div className="thub">
      <ReportsHistoryTabs active="stats" />
      <header className="thub__hero">
        <div className="thub__hero-text">
          <p className="thub__eyebrow">Operativ tahlil</p>
          <h1 className="thub__title">Hisobotlar</h1>
          <p className="thub__lead">
            Asosiy ko‘rsatkich — jo‘natilgan mahsulot. Kirish, yuklash, yo‘nalish, egalik,
            aylanma va buyurtmalar kunlik, haftalik va oylik kesimda.
          </p>
        </div>
        <div className="thub__hero-stats" aria-label="Davr qisqacha">
          <div>
            <strong>{loading ? '—' : fmtTon(report.chiqish.tons)}</strong>
            <span>Jo‘natilgan, t</span>
          </div>
          <div>
            <strong>{loading || !topProduct ? '—' : fmtTon(topProduct.chiqish.tons)}</strong>
            <span>{topProduct ? topProduct.label : 'Asosiy mahsulot'}</span>
          </div>
          <div>
            <strong>{loading ? '—' : report.chiqish.wagons}</strong>
            <span>Chiqqan vagon</span>
          </div>
          <div>
            <strong>{loading ? '—' : report.kirish.wagons}</strong>
            <span>Kirgan vagon</span>
          </div>
        </div>
      </header>

      <section className="thub__main">
        <HubZoneTabs
          label="Hisobot bo‘limlari"
          columns={5}
          value={lane}
          onChange={setLane}
          items={laneTabs}
        />

        {periodControls}

        <div className="thub__board">
          {loading ? (
              <div className="thub-empty">Yuklanmoqda…</div>
            ) : lane === 'overview' ? (
              <div className="thub-overview">
                {shippedProducts.length > 0 && (
                  <RankedBars
                    unit="tonna — jo‘natilgan"
                    rows={shippedProducts.map(row => ({
                      id: row.productType,
                      label: row.label,
                      sub: `${row.chiqish.wagons} vagon`,
                      value: Math.round(row.chiqish.tons * 10) / 10,
                    }))}
                  />
                )}
                {shippedProducts.length > 0 && (
                  <div className="thub-table-wrap">
                    <table className="thub-table">
                      <thead>
                        <tr>
                          <th>Mahsulot</th>
                          <th className="rhub-right">Yuklangan</th>
                          <th className="rhub-right">Jo‘natilgan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shippedProducts.map(row => (
                          <tr key={row.productType}>
                            <td><span className="thub-table__code">{row.label}</span></td>
                            <td className="rhub-right">
                              <div className="thub-table__code">{fmtTon(row.yuklash.tons)} t</div>
                              <div className="rhub-sub">{row.yuklash.wagons} vagon</div>
                            </td>
                            <td className="rhub-right">
                              <div className="thub-table__code">{fmtTon(row.chiqish.tons)} t</div>
                              <div className="rhub-sub">{row.chiqish.wagons} vagon</div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <HubZoneTabs
                  label="Davr ko‘rsatkichlari"
                  columns={4}
                  value={flowKind === 'all' ? null : flowKind}
                  onChange={id => {
                    if (id === 'orders') {
                      setLane('orders');
                      return;
                    }
                    setFlowKind(current => current === id ? 'all' : id);
                  }}
                  items={[
                    {
                      id: 'kirish' as const,
                      label: 'Kirish',
                      hint: 'Bo‘sh vagon qabul qilindi',
                      icon: ArrowDownToLine,
                      tone: 'sisterna' as HubZoneTone,
                      count: report.kirish.wagons,
                    },
                    {
                      id: 'yuklash' as const,
                      label: 'Yuklash',
                      hint: `${fmtTon(report.yuklash.tons)} t`,
                      icon: Package,
                      tone: 'platform' as HubZoneTone,
                      count: report.yuklash.wagons,
                    },
                    {
                      id: 'chiqish' as const,
                      label: 'Chiqish',
                      hint: `${fmtTon(report.chiqish.tons)} t`,
                      icon: ArrowUpFromLine,
                      tone: 'container' as HubZoneTone,
                      count: report.chiqish.wagons,
                    },
                    {
                      id: 'orders' as const,
                      label: 'Buyurtmalar',
                      hint: `${fmtTon(orderStats.tons)} t · ${orderStats.wagons} vagon`,
                      icon: ClipboardList,
                      tone: 'closed' as HubZoneTone,
                      count: orderStats.total,
                    },
                  ]}
                />

                {flowRows.length > 0 && (
                  <div className="rhub-flow-summary">
                    <p className="rhub-flow-summary__count">
                      {flowKind === 'all' ? 'Davr bo‘yicha barchasi' : FLOW_KIND_LABEL[flowKind]}
                      {' — '}
                      <strong>{flowRows.length}</strong> ta yozuv · <strong>{flowWagonsTotal}</strong> vagon
                      {flowTonsTotal > 0 ? <> · <strong>{fmtTon(flowTonsTotal)}</strong> t</> : null}
                      {flowKind !== 'all' && (
                        <button
                          type="button"
                          className="ml-2 text-primary-600 underline text-sm font-normal dark:text-primary-400"
                          onClick={() => setFlowKind('all')}
                        >
                          Barchasi
                        </button>
                      )}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Har bir partiya/vagonning to‘liq ro‘yxati — mas’ul xodim, hujjat va nosozliklar
                      bilan — Jarayonlar tarixida ko‘rinadi.
                    </p>
                    <button
                      type="button"
                      className="btn-secondary flex items-center gap-1.5"
                      onClick={openFlowInHistory}
                    >
                      <History className="w-4 h-4" strokeWidth={1.75} />
                      <span>Jarayonlar tarixida ko‘rish</span>
                    </button>
                  </div>
                )}

                <div className="thub-overview__flow">
                  <button type="button" className="thub-flow" onClick={() => setLane('products')}>
                    <Package className="w-4 h-4" strokeWidth={2} />
                    <div>
                      <strong>Mahsulot</strong>
                      <span>{report.byProduct.length} ta tur</span>
                    </div>
                    <em>{report.byProduct.length}</em>
                  </button>
                  <button type="button" className="thub-flow" onClick={() => setLane('ownership')}>
                    <Boxes className="w-4 h-4" strokeWidth={2} />
                    <div>
                      <strong>Egalik</strong>
                      <span>M {ownership.majmua.wagons} · T {ownership.tashqi.wagons}</span>
                    </div>
                    <em>{ownership.majmua.wagons + ownership.tashqi.wagons}</em>
                  </button>
                  <button type="button" className="thub-flow" onClick={() => setLane('kinds')}>
                    <BarChart3 className="w-4 h-4" strokeWidth={2} />
                    <div>
                      <strong>Vagon turi</strong>
                      <span>Sisterna / yopiq / platforma</span>
                    </div>
                    <em>{kinds.reduce((s, k) => s + k.chiqish, 0)}</em>
                  </button>
                  <button type="button" className="thub-flow" onClick={() => setLane('trend')}>
                    <TrendingUp className="w-4 h-4" strokeWidth={2} />
                    <div>
                      <strong>Tendensiya</strong>
                      <span>{mode === 'daily' ? '7 kun' : mode === 'weekly' ? '8 hafta' : '6 oy'}</span>
                    </div>
                    <em>{trend.length}</em>
                  </button>
                </div>
              </div>
            ) : lane === 'products' ? (
              report.byProduct.length === 0 ? (
                <div className="thub-empty">
                  <p className="thub-empty__title">Mahsulot kesimi bo‘sh</p>
                </div>
              ) : (
                <div className="thub-table-wrap">
                  <table className="thub-table">
                    <thead>
                      <tr>
                        <th>Mahsulot</th>
                        <th className="rhub-right">Kirish, vagon</th>
                        <th className="rhub-right">Yuklash</th>
                        <th className="rhub-right">Chiqish</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.byProduct.map(row => (
                        <tr key={row.productType}>
                          <td><span className="thub-table__code">{row.label}</span></td>
                          <td className="rhub-right">
                            <div className="thub-table__code">{row.kirish.wagons}</div>
                            <div className="rhub-sub">vagon</div>
                          </td>
                          <td className="rhub-right">
                            <div className="thub-table__code">{row.yuklash.wagons}</div>
                            <div className="rhub-sub">{fmtTon(row.yuklash.tons)} t</div>
                          </td>
                          <td className="rhub-right">
                            <div className="thub-table__code">{row.chiqish.wagons}</div>
                            <div className="rhub-sub">{fmtTon(row.chiqish.tons)} t</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : lane === 'destinations' ? (
              destinations.length === 0 ? (
                <div className="thub-empty">
                  <p className="thub-empty__title">Bu davrda chiqish yo‘q</p>
                  <p className="thub-empty__text">Kontragent va stansiya kesimi chiqib ketgan vagonlar asosida tuziladi.</p>
                </div>
              ) : (
                <div className="thub-overview">
                <RankedBars
                  unit="tonna"
                  maxRows={8}
                  rows={destinations.map(row => ({
                    id: row.id,
                    label: row.contractor,
                    sub: row.station,
                    value: row.tons,
                  }))}
                />
                <div className="thub-table-wrap">
                  <table className="thub-table">
                    <thead>
                      <tr>
                        <th>Kontragent</th>
                        <th>Jo‘natish stansiyasi</th>
                        <th className="rhub-right">Yuk xati</th>
                        <th className="rhub-right">Vagon</th>
                        <th className="rhub-right">Tonna</th>
                      </tr>
                    </thead>
                    <tbody>
                      {destinations.map(row => (
                        <tr key={row.id}>
                          <td><span className="thub-table__code">{row.contractor}</span></td>
                          <td>{row.station}</td>
                          <td className="rhub-right thub-mono">{row.registries}</td>
                          <td className="rhub-right thub-mono">{row.wagons}</td>
                          <td className="rhub-right thub-mono">{fmtTon(row.tons)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan={2}><b>Jami</b></td>
                        <td className="rhub-right thub-mono">—</td>
                        <td className="rhub-right thub-mono"><b>{destinations.reduce((n, r) => n + r.wagons, 0)}</b></td>
                        <td className="rhub-right thub-mono"><b>{fmtTon(destinations.reduce((n, r) => n + r.tons, 0))}</b></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                </div>
              )
            ) : lane === 'cycle' ? (
              cycle.measured === 0 ? (
                <div className="thub-empty">
                  <p className="thub-empty__title">Aylanma hisoblanmadi</p>
                  <p className="thub-empty__text">Bu davrda chiqib ketgan vagon yo‘q yoki kirish sanasi yozilmagan.</p>
                </div>
              ) : (
                <div className="thub-overview">
                  <HubZoneTabs
                    label="Aylanma vaqti"
                    columns={4}
                    value={null}
                    onChange={() => {}}
                    readOnly
                    items={[
                      {
                        id: 'avg' as const,
                        label: 'O‘rtacha',
                        hint: `${fmtHours(cycle.avgHours)} · ${cycle.measured} vagon`,
                        icon: Timer,
                        tone: 'sisterna' as HubZoneTone,
                        count: Math.round(cycle.avgHours / 24 * 10) / 10,
                      },
                      {
                        id: 'min' as const,
                        label: 'Eng tez',
                        hint: fmtHours(cycle.minHours),
                        icon: TrendingUp,
                        tone: 'done' as HubZoneTone,
                        count: Math.round(cycle.minHours / 24 * 10) / 10,
                      },
                      {
                        id: 'max' as const,
                        label: 'Eng uzoq',
                        hint: fmtHours(cycle.maxHours),
                        icon: Hourglass,
                        tone: 'amber' as HubZoneTone,
                        count: Math.round(cycle.maxHours / 24 * 10) / 10,
                      },
                      {
                        id: 'load' as const,
                        label: 'Yuklashgacha',
                        hint: `Yuklashdan chiqishgacha ${fmtHours(cycle.avgLoadToExitHours)}`,
                        icon: Package,
                        tone: 'platform' as HubZoneTone,
                        count: Math.round(cycle.avgToLoadHours / 24 * 10) / 10,
                      },
                    ]}
                  />
                  <RankedBars
                    unit="vagon — zavodda turish muddati"
                    rows={cycle.buckets.map(b => ({ id: b.id, label: b.label, value: b.count }))}
                  />
                  <div className="thub-table-wrap">
                    <table className="thub-table">
                      <thead>
                        <tr>
                          <th>Zavodda turish muddati</th>
                          <th className="rhub-right">Vagon</th>
                          <th className="rhub-right">Ulush</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cycle.buckets.map(b => (
                          <tr key={b.id}>
                            <td>{b.label}</td>
                            <td className="rhub-right thub-mono">{b.count}</td>
                            <td className="rhub-right thub-mono">
                              {cycle.measured === 0 ? '—' : `${Math.round((b.count / cycle.measured) * 100)}%`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="rhub-note">
                    Raqamlar kartalarda kunda, izohda soatda. Har bir vagon o‘z tashrifining
                    kirish sanasidan hisoblanadi.
                  </p>
                </div>
              )
            ) : lane === 'exceptions' ? (
              <div className="thub-overview">
                <HubZoneTabs
                  label="Istisnolar"
                  columns={4}
                  value={null}
                  onChange={() => {}}
                  readOnly
                  items={[
                    {
                      id: 'def' as const,
                      label: 'Dalolatnoma',
                      hint: 'Nomuvofiq vagonlar',
                      icon: TriangleAlert,
                      tone: 'amber' as HubZoneTone,
                      count: exceptions.defective,
                    },
                    {
                      id: 'txt' as const,
                      label: 'Raqamsiz plomba',
                      hint: 'PLOMBASIZ, tashkilot plombasi',
                      icon: Lock,
                      tone: 'container' as HubZoneTone,
                      count: exceptions.sealTextOnly,
                    },
                    {
                      id: 'nos' as const,
                      label: 'Plombasiz',
                      hint: 'Maydon bo‘sh',
                      icon: TriangleAlert,
                      tone: 'closed' as HubZoneTone,
                      count: exceptions.noSeal,
                    },
                    {
                      id: 'rep' as const,
                      label: 'Takror tashrif',
                      hint: 'Qayta kelgan vagonlar',
                      icon: ArrowLeftRight,
                      tone: 'sisterna' as HubZoneTone,
                      count: exceptions.repeatVisits,
                    },
                  ]}
                />
                {exceptions.rows.length === 0 ? (
                  <div className="thub-empty">
                    <p className="thub-empty__title">Bu davrda istisno yo‘q</p>
                  </div>
                ) : (
                  <div className="thub-table-wrap">
                    <table className="thub-table">
                      <thead>
                        <tr>
                          <th>Turi</th>
                          <th>Vagon №</th>
                          <th>Yuk xati</th>
                          <th>Izoh</th>
                        </tr>
                      </thead>
                      <tbody>
                        {exceptions.rows.map(row => (
                          <tr key={row.id}>
                            <td><span className="thub-chip thub-chip--stage">{row.kind}</span></td>
                            <td><span className="thub-table__code">{row.wagon}</span></td>
                            <td className="thub-mono">{row.registry}</td>
                            <td>{row.note}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="rhub-note">
                  Davrda chiqqan vagonlar: <b>{exceptions.exitedWagons}</b>. Raqamsiz plomba —
                  zavod ehtiyoji yoki tashkilot plombasi bo‘lgan normal holat, nazorat uchun ko‘rsatiladi.
                </p>
              </div>
            ) : lane === 'ownership' ? (
              <HubZoneTabs
                label="Egalik"
                columns={2}
                value={null}
                onChange={() => {}}
                readOnly
                items={[
                  {
                    id: 'majmua' as const,
                    label: 'Majmua',
                    hint: `Chiqish · ${fmtTon(ownership.majmua.tons)} t`,
                    icon: Boxes,
                    tone: 'sisterna',
                    count: ownership.majmua.wagons,
                  },
                  {
                    id: 'tashqi' as const,
                    label: 'Tashqi',
                    hint: `Chiqish · ${fmtTon(ownership.tashqi.tons)} t`,
                    icon: Boxes,
                    tone: 'platform',
                    count: ownership.tashqi.wagons,
                  },
                ]}
              />
            ) : lane === 'kinds' ? (
              <div className="thub-table-wrap">
                <table className="thub-table">
                  <thead>
                    <tr>
                      <th>Vagon turi</th>
                      <th className="rhub-right">Kirish</th>
                      <th className="rhub-right">Yuklash</th>
                      <th className="rhub-right">Chiqish</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kinds.map(row => (
                      <tr key={row.kind}>
                        <td>
                          <span className={`thub-chip thub-chip--${row.kind}`}>{row.label}</span>
                        </td>
                        <td className="rhub-right thub-mono">{row.kirish}</td>
                        <td className="rhub-right thub-mono">{row.yuklash}</td>
                        <td className="rhub-right thub-mono">{row.chiqish}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : lane === 'orders' ? (
              <div className="thub-overview">
                <HubZoneTabs
                  label="Buyurtmalar statistikasi"
                  columns={4}
                  value={null}
                  onChange={() => {}}
                  readOnly
                  items={[
                    {
                      id: 'total' as const,
                      label: 'Jami',
                      hint: 'Davrdagi buyurtmalar',
                      icon: ClipboardList,
                      tone: 'sky',
                      count: orderStats.total,
                    },
                    {
                      id: 'faol' as const,
                      label: 'Faol',
                      hint: 'Active',
                      icon: Hourglass,
                      tone: 'sisterna',
                      count: orderStats.faol,
                    },
                    {
                      id: 'tasdiq' as const,
                      label: 'Tasdiqlanayotgan',
                      hint: 'Jarayonda',
                      icon: Hourglass,
                      tone: 'amber',
                      count: orderStats.tasdiq,
                    },
                    {
                      id: 'yakun' as const,
                      label: 'Yakunlangan',
                      hint: `${fmtTon(orderStats.tons)} t`,
                      icon: CheckCircle2,
                      tone: 'done',
                      count: orderStats.yakun,
                    },
                  ]}
                />
                <p className="rhub-note">
                  Buyurtma vagonlari: <b>{orderStats.wagons}</b> · tonna: <b>{fmtTon(orderStats.tons)}</b>
                </p>
              </div>
            ) : (
              <div className="thub-overview">
                <div className="thub-pills" role="group" aria-label="O‘lchov">
                  <button type="button" className={trendUnit === 'wagons' ? 'is-on' : undefined} onClick={() => setTrendUnit('wagons')}>
                    Vagon
                  </button>
                  <button type="button" className={trendUnit === 'tons' ? 'is-on' : undefined} onClick={() => setTrendUnit('tons')}>
                    Tonna
                  </button>
                </div>
                <GroupedColumnsChart
                  unit={trendUnit === 'wagons' ? 'vagon' : 'tonna'}
                  series={trendUnit === 'wagons'
                    ? [
                      { key: 'kirish', label: 'Kirish', color: 'var(--viz-s1)' },
                      { key: 'yuklash', label: 'Yuklash', color: 'var(--viz-s2)' },
                      { key: 'chiqish', label: 'Chiqish', color: 'var(--viz-s3)' },
                    ]
                    : [
                      { key: 'yuklash', label: 'Yuklash', color: 'var(--viz-s2)' },
                      { key: 'chiqish', label: 'Chiqish', color: 'var(--viz-s3)' },
                    ]}
                  points={trend.map(p => ({
                    key: p.key,
                    label: p.label,
                    values: (trendUnit === 'wagons'
                      ? { kirish: p.kirish, yuklash: p.yuklash, chiqish: p.chiqish }
                      : { yuklash: p.tonsLoad, chiqish: p.tonsOut }) as Record<string, number>,
                  }))}
                />
                {trendUnit === 'tons' && (
                  <p className="rhub-note">
                    Kirishda tonna ko‘rsatilmaydi: vagon korxonaga bo‘sh kiradi.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
    </div>
  );
}
