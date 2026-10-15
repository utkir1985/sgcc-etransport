import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  CalendarClock,
  CheckCircle2,
  LogIn,
  TrainFront,
  Undo2,
  FileDown,
  Clock3,
  FileSpreadsheet,
  Hourglass,
  LayoutDashboard,
  Scale,
  Target,
  Truck,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { api } from '../../../shared/services/api';
import type { CatalogFleetWagon, EmptyWagonArrival, EmptyWagonUnit, LoadingRegistry, MonthlyOrder } from '../../../shared/types';
import { getProductLabel } from '../../../shared/constants/productTypes';
import { logisticsFromRoute } from '../../../shared/constants/logisticsTypes';
import { DEFECT_ACT_TYPE_LABEL } from '../../../shared/constants/defectActTypes';
import { normalizeWagonOwnership } from '../../../shared/constants/wagonOwnership';
import { MONTH_NAMES_UZ, todayIso } from '../../../shared/utils/dates';
import { formatTons } from '../../../shared/utils/orderQuantity';
import { excludeOneCArrivals } from '../../../shared/utils/oneCSources';
import { exportSheets, todayStamp } from '../../../shared/utils/excelExport';
import { buildDefectsGu23Analysis, buildDemurrageAnalysis, buildWeightAnalysis } from '../utils/demurrageUtils';
import { loadedWagonCountOf, localDateKey, wagonCountOf } from '../utils/sharedPanels';
import { StatsMultiSelect, type StatsOption } from '../components/StatsMultiSelect';
import { StatsPeriodPicker } from '../components/StatsPeriodPicker';
import { StatsDrillTable, type DrillColumn, type DrillRow, type DrillState } from '../components/StatsDrillTable';

const PRODUCT_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];
const WEEKDAYS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];
const NORM_HOURS = 8.9;

type Tab = 'overview' | 'plan' | 'deadlines' | 'intake' | 'loading' | 'idle' | 'quality' | 'returned' | 'defects' | 'fleet' | 'staff';
type Compare = 'none' | 'prev' | 'yoy';

/** Bo‘lim ichidagi qismlar (sarlavha bilan ketma-ket chiqadi) */
const SECTIONS: { id: Tab; label: string; icon: typeof Target }[] = [
  { id: 'overview', label: 'Umumiy', icon: LayoutDashboard },
  { id: 'plan', label: 'Reja ijrosi', icon: Target },
  { id: 'deadlines', label: 'Buyurtma muddatlari', icon: CalendarClock },
  { id: 'intake', label: 'Vagonlarni kiritish', icon: LogIn },
  { id: 'loading', label: 'Yuklash va jo‘natish', icon: Activity },
  { id: 'idle', label: 'Bekor turish vaqti', icon: Clock3 },
  { id: 'quality', label: 'Yuklash sifati', icon: Scale },
  { id: 'returned', label: 'Qaytarilgan vagonlar', icon: Undo2 },
  { id: 'defects', label: 'Nosozliklar', icon: Wrench },
  { id: 'fleet', label: 'Vagon parki', icon: TrainFront },
  { id: 'staff', label: 'Xodimlar va xizmatlar', icon: Users },
];

type Group = 'overview' | 'orders' | 'intake' | 'loading' | 'idle' | 'quality-group' | 'fleet' | 'staff';
/** 8 ta asosiy bo‘lim — bog‘liq qismlar bitta bo‘limda */
const TABS: { id: Group; label: string; icon: typeof Target; parts: Tab[] }[] = [
  { id: 'overview', label: 'Umumiy', icon: LayoutDashboard, parts: ['overview'] },
  { id: 'orders', label: 'Buyurtmalar', icon: Target, parts: ['plan', 'deadlines'] },
  { id: 'intake', label: 'Kiritish', icon: LogIn, parts: ['intake'] },
  { id: 'loading', label: 'Yuklash va jo‘natish', icon: Activity, parts: ['loading'] },
  { id: 'idle', label: 'Bekor turish', icon: Clock3, parts: ['idle'] },
  { id: 'quality-group', label: 'Sifat va nosozliklar', icon: Scale, parts: ['quality', 'returned', 'defects'] },
  { id: 'fleet', label: 'Vagon parki', icon: TrainFront, parts: ['fleet'] },
  { id: 'staff', label: 'Xodimlar', icon: Users, parts: ['staff'] },
];

const STAGES = [
  { key: 'toTare', label: 'Kirish va tara', norm: 98 },
  { key: 'loading', label: 'Estakada va yuklash', norm: 225 },
  { key: 'toGross', label: 'Brutto tortish', norm: 80 },
  { key: 'sealing', label: 'Ko‘rik va hujjat', norm: 100 },
  { key: 'dispatch', label: 'Stansiyaga chiqarish', norm: 30 },
] as const;

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shiftDays = (s: string, n: number) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return iso(d); };
const shiftYears = (s: string, n: number) => (s ? `${Number(s.slice(0, 4)) + n}${s.slice(4)}` : s);
const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86400000) + 1;
const monthStart = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}-01`;
const monthEnd = (y: number, m: number) => iso(new Date(y, m, 0));
const periodKeyOf = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
// O‘q yozuvlari: «22k» emas — «22 000» (minglar bo‘sh joy bilan)
const shortNum = (v: number) => formatTons(Math.round(v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const monthLabel = (k: string) => `${(MONTH_NAMES_UZ[Number(k.slice(5, 7)) - 1] || '').slice(0, 3)} ${k.slice(2, 4)}`;

const HOUR_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', hour12: false });
const hourOf = (isoStr: string) => Number(HOUR_FMT.format(new Date(isoStr))) % 24;
const hoursBetween = (a?: string | null, b?: string | null) => {
  if (!a || !b) return null;
  const h = (new Date(b).getTime() - new Date(a).getTime()) / 3600000;
  return Number.isFinite(h) && h >= 0 ? h : null;
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function shortContractor(name: string) {
  return name.replace(/gaz ta['‘’`]?minoti filiali/i, '').replace(/[«»"]/g, '').replace(/\s+/g, ' ').trim() || name;
}

function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

interface Range { from: string; to: string }

const inDay = (day: string, r: Range) => !(r.from && day < r.from) && !(r.to && day > r.to);
function inMonth(y: number, m: number, r: Range) {
  const k = periodKeyOf(y, m);
  return !(r.from && k < r.from.slice(0, 7)) && !(r.to && k > r.to.slice(0, 7));
}

interface Filters {
  products: string[];
  transport: string;
  contractors: string[];
  stations: string[];
  ownership: string;
}

function routeTons(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(/[^\d.]/g, '')) || 0;
  return n > 200 ? n / 1000 : n;
}

/** Tanlangan davr va filtrlar bo‘yicha barcha ko‘rsatkichlar. */
function computeAll(
  range: Range,
  f: Filters,
  orders: MonthlyOrder[],
  arrivals: EmptyWagonArrival[],
  registries: LoadingRegistry[],
  demurrage: ReturnType<typeof buildDemurrageAnalysis> | null,
  weight: ReturnType<typeof buildWeightAnalysis> | null,
  defects: ReturnType<typeof buildDefectsGu23Analysis> | null,
) {
  const productOk = (p?: string) => f.products.length === 0 || (!!p && f.products.includes(p));
  const contractorOk = (c?: string) => f.contractors.length === 0 || (!!c && f.contractors.includes(c.trim()));
  const stationOk = (s?: string) => f.stations.length === 0 || (!!s && f.stations.includes(s.trim()));
  const transportOk = (lt?: string) => !f.transport || (lt || 'Railway') === f.transport;

  // Buyurtma qatorlari (faqat tasdiqlangan buyurtmalar)
  const lines: { order: MonthlyOrder; line: MonthlyOrder['lines'][number]; contractor: string; plan: number; done: number; remain: number }[] = [];
  for (const o of orders) {
    if (o.status !== 'Active' && o.status !== 'Completed') continue;
    if (!inMonth(o.year, o.month, range) || !productOk(o.productType) || !transportOk(o.logisticsType)) continue;
    for (const l of o.lines ?? []) {
      const contractor = (l.contractor || 'Ko‘rsatilmagan').trim();
      if (!contractorOk(contractor)) continue;
      if (f.stations.length && !stationOk(l.destinationStation) && !(l.stationShipments ?? []).some(s => stationOk(s.station))) continue;
      const plan = Number(l.tonCount || 0);
      const done = Number(l.fulfilledNetWeight ?? 0);
      lines.push({ order: o, line: l, contractor, plan, done, remain: o.status === 'Completed' ? 0 : Math.max(0, plan - done) });
    }
  }

  // Jo‘natish — yuk xatidagi har bir vagon
  const exits: { day: string; at: string; tons: number; product: string; station: string; contractor: string; wagonNumber: string; registryId: string; registryNumber: string }[] = [];
  if (!f.transport || f.transport === 'Railway') {
    for (const r of registries) {
      if (!r.exitedToKengsoyAt) continue;
      const day = localDateKey(r.exitedToKengsoyAt);
      if (!inDay(day, range)) continue;
      for (const w of r.wagonRoutes ?? []) {
        if (w.isDefective) continue;
        const product = w.productType || r.productType;
        if (!productOk(product) || !contractorOk(w.contractorName || r.contractorName) || !stationOk(w.destinationStation || r.destinationStation)) continue;
        exits.push({
          day,
          at: r.exitedToKengsoyAt,
          tons: routeTons(w.netWeight ?? w.NetWeight ?? w.nettoWeight),
          product: product || 'Boshqa',
          station: (w.destinationStation || r.destinationStation || '').trim(),
          contractor: (w.contractorName || r.contractorName || '').trim(),
          wagonNumber: w.wagonNumber,
          registryId: r.id,
          registryNumber: r.registryNumber,
        });
      }
    }
  }

  // Kirish va yuklash — partiyalar (kontragent/stansiya bilan bog‘lanmagan)
  const entries: { day: string; n: number; at: string }[] = [];
  const loads: { day: string; n: number; at: string }[] = [];
  if (!f.contractors.length && !f.stations.length && (!f.transport || f.transport === 'Railway')) {
    for (const a of excludeOneCArrivals(arrivals)) {
      if (!productOk(a.productType)) continue;
      const stamp = a.arrivalDate || a.createdAt;
      if (stamp) {
        const day = localDateKey(stamp);
        if (inDay(day, range)) entries.push({ day, n: wagonCountOf(a), at: stamp });
      }
      const perWagon = (a.wagons ?? []).filter(w => w.loadingCompletedAt);
      if (perWagon.length) {
        for (const w of perWagon) {
          const day = localDateKey(w.loadingCompletedAt!);
          if (inDay(day, range)) loads.push({ day, n: 1, at: w.loadingCompletedAt! });
        }
      } else if (a.loadingCompletedAt) {
        const day = localDateKey(a.loadingCompletedAt);
        if (inDay(day, range)) loads.push({ day, n: loadedWagonCountOf(a), at: a.loadingCompletedAt });
      }
    }
  }

  const stays = (demurrage?.items ?? []).filter(i =>
    i.isExited && i.exitedAt && inDay(localDateKey(i.exitedAt), range)
    && productOk(i.productType) && contractorOk(i.contractorName) && stationOk(i.destinationStation)
    && (!f.ownership || i.ownership === f.ownership));

  const weights = (weight?.items ?? []).filter(i =>
    i.date && inDay(localDateKey(i.date), range)
    && productOk(i.productType) && contractorOk(i.contractorName) && stationOk(i.destinationStation));

  const defectItems = (defects?.items ?? []).filter(i => i.arrivalDate && inDay(localDateKey(i.arrivalDate), range));

  return {
    lines,
    plan: lines.reduce((s, l) => s + l.plan, 0),
    done: lines.reduce((s, l) => s + l.done, 0),
    remain: lines.reduce((s, l) => s + l.remain, 0),
    orderCount: new Set(lines.map(l => l.order.id)).size,
    exits,
    exitWagons: exits.length,
    exitTons: exits.reduce((s, e) => s + e.tons, 0),
    entries,
    loads,
    stays,
    stayMedian: median(stays.map(s => s.hoursInPlant)),
    stayOver: stays.filter(s => s.hoursInPlant > NORM_HOURS).length,
    weights,
    defectItems,
  };
}

type Computed = ReturnType<typeof computeAll>;

function ChartCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="stat-card">
      <header className="stat-card__head">
        <h3>{title}</h3>
        {hint ? <p>{hint}</p> : null}
      </header>
      <div className="stat-card__body">{children}</div>
    </section>
  );
}

function Delta({ cur, prev, pp = false, invert = false }: { cur: number; prev: number | null; pp?: boolean; invert?: boolean }) {
  if (prev === null) return null;
  if (prev === 0 && cur === 0) return <span className="stat-delta">—</span>;
  const diff = pp ? cur - prev : prev === 0 ? 100 : ((cur - prev) / Math.abs(prev)) * 100;
  const rounded = Math.round(diff);
  const good = invert ? rounded < 0 : rounded > 0;
  return (
    <span className={`stat-delta ${rounded === 0 ? '' : good ? 'is-good' : 'is-bad'}`} title="Solishtirma davrga nisbatan">
      {rounded > 0 ? '▲' : rounded < 0 ? '▼' : ''} {Math.abs(rounded)}{pp ? ' p.p.' : '%'}
    </span>
  );
}

export default function StatisticsPage() {
  const dark = useIsDark();
  const [sp, setSp] = useSearchParams();

  const [orders, setOrders] = useState<MonthlyOrder[]>([]);
  const [arrivals, setArrivals] = useState<EmptyWagonArrival[]>([]);
  const [registries, setRegistries] = useState<LoadingRegistry[]>([]);
  const [fleetCatalog, setFleetCatalog] = useState<CatalogFleetWagon[]>([]);
  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState<DrillState | null>(null);
  const [printAll, setPrintAll] = useState(false);
  const [dailyMetric, setDailyMetric] = useState<'vagon' | 'tonna'>('vagon');
  const [stationMetric, setStationMetric] = useState<'tonna' | 'vagon'>('tonna');

  // Filtrlar havolada saqlanadi — ko‘rinishni havola orqali boshqa xodimga yuborish mumkin
  const list = (k: string) => (sp.get(k) || '').split('|').filter(Boolean);
  // Eski havolalar (?tab=plan va h.k.) tegishli guruhga o‘tadi
  const tabParam = sp.get('tab') || '';
  const tab = (TABS.find(t => t.id === tabParam)?.id ?? TABS.find(t => t.parts.includes(tabParam as Tab))?.id ?? 'overview') as Group;
  const groupParts = TABS.find(t => t.id === tab)?.parts ?? ['overview'];
  const range: Range = { from: sp.get('from') || '', to: sp.get('to') || '' };
  const filters: Filters = {
    products: list('p'),
    transport: sp.get('t') || '',
    contractors: list('c'),
    stations: list('s'),
    ownership: sp.get('o') || '',
  };
  const compare = (['prev', 'yoy'].includes(sp.get('cmp') || '') ? sp.get('cmp') : 'none') as Compare;

  const setParam = (patch: Record<string, string | string[] | null>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      const val = Array.isArray(v) ? v.join('|') : v;
      if (!val) next.delete(k); else next.set(k, val);
    }
    setSp(next, { replace: true });
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      const [o, a, r] = await Promise.all([
        api.getOrders().catch(() => ({ data: [] as MonthlyOrder[] })),
        api.getEmptyWagonArrivals().catch(() => ({ data: [] as EmptyWagonArrival[] })),
        api.getLoadingRegistries().catch(() => ({ data: [] as LoadingRegistry[] })),
      ]);
      if (!alive) return;
      setOrders(o?.data ?? []);
      setArrivals(a?.data ?? []);
      setRegistries(r?.data ?? []);
      setLoading(false);
      const fc = await api.getFleetWagons('majmua').catch(() => null);
      if (alive && fc?.data) setFleetCatalog(fc.data);
    })();
    return () => { alive = false; };
  }, []);

  const demurrage = useMemo(() => (arrivals.length ? buildDemurrageAnalysis(arrivals, registries) : null), [arrivals, registries]);
  const weight = useMemo(() => (arrivals.length ? buildWeightAnalysis(arrivals, registries) : null), [arrivals, registries]);
  const defects = useMemo(() => (arrivals.length ? buildDefectsGu23Analysis(arrivals, registries) : null), [arrivals, registries]);

  // ---- Filtr variantlari ----
  const productOptions = useMemo<StatsOption[]>(() => {
    const m = new Map<string, string>();
    for (const o of orders) if (o.productType && !m.has(o.productType)) m.set(o.productType, getProductLabel(o.productType, logisticsFromRoute(o.logisticsType)));
    return Array.from(m, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [orders]);
  const contractorOptions = useMemo<StatsOption[]>(() => {
    const s = new Set<string>();
    for (const o of orders) for (const l of o.lines ?? []) if (l.contractor?.trim()) s.add(l.contractor.trim());
    return Array.from(s).map(v => ({ value: v, label: shortContractor(v) })).sort((a, b) => a.label.localeCompare(b.label));
  }, [orders]);

  const now = new Date();
  const cy = now.getFullYear();
  const cm = now.getMonth() + 1;
  const years = useMemo(() => {
    const s = new Set<number>(orders.map(o => o.year).filter(Boolean));
    s.add(cy);
    return Array.from(s).sort((a, b) => b - a);
  }, [orders, cy]);

  // ---- Davr: tezkor tugmalar ----
  const pm = cm === 1 ? 12 : cm - 1;
  const py = cm === 1 ? cy - 1 : cy;
  const presets = [
    { id: 'month', label: 'Bu oy', from: monthStart(cy, cm), to: todayIso() },
    { id: 'prev', label: 'O‘tgan oy', from: monthStart(py, pm), to: monthEnd(py, pm) },
    { id: 'quarter', label: 'Chorak', from: monthStart(cy, Math.floor((cm - 1) / 3) * 3 + 1), to: todayIso() },
    { id: 'ytd', label: 'Yil boshidan', from: monthStart(cy, 1), to: todayIso() },
    { id: 'lastyear', label: 'O‘tgan yil', from: monthStart(cy - 1, 1), to: monthEnd(cy - 1, 12) },
    { id: 'all', label: 'Hammasi', from: '', to: '' },
  ];
  // ---- Solishtirma davr ----
  const cmpRange: Range | null = compare === 'none' || !range.from || !range.to
    ? null
    : compare === 'yoy'
      ? { from: shiftYears(range.from, -1), to: shiftYears(range.to, -1) }
      : { from: shiftDays(range.from, -daysBetween(range.from, range.to)), to: shiftDays(range.from, -1) };

  const filterKey = JSON.stringify(filters);
  useEffect(() => { setDrill(null); }, [tab, range.from, range.to, filterKey]);
  /* eslint-disable react-hooks/exhaustive-deps */
  const cur = useMemo(() => computeAll(range, filters, orders, arrivals, registries, demurrage, weight, defects),
    [range.from, range.to, filterKey, orders, arrivals, registries, demurrage, weight, defects]);
  const prev = useMemo<Computed | null>(() => (cmpRange ? computeAll(cmpRange, filters, orders, arrivals, registries, demurrage, weight, defects) : null),
    [cmpRange?.from, cmpRange?.to, filterKey, orders, arrivals, registries, demurrage, weight, defects]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // ---- Diagramma uslubi ----
  const axis = dark ? '#94a3b8' : '#64748b';
  const grid = dark ? '#1e293b' : '#e8eef5';
  const ghost = dark ? '#334155' : '#cbd5e1';
  const cursor = { fill: dark ? 'rgb(148 163 184 / 0.08)' : 'rgb(148 163 184 / 0.12)' };
  const tooltipStyle = {
    background: dark ? '#0f172a' : '#ffffff',
    border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`,
    borderRadius: 10,
    fontSize: 13,
    color: dark ? '#e2e8f0' : '#0f172a',
  };
  const tons = (v: number) => `${formatTons(r1(v))} t`;
  // O‘qning o‘lchov birligi (yuqorida, chap burchakda)
  const yUnit = (unit: string) => ({ value: unit, position: 'top' as const, offset: 12, fill: axis, fontSize: 11.5, dx: 14 });
  const empty = (text = 'Tanlangan filtr bo‘yicha ma’lumot yo‘q') => <div className="stat-empty">{text}</div>;
  const prodLabel = (p: string) => productOptions.find(o => o.value === p)?.label || p;
  const pct = (d: number, p: number) => (p > 0 ? Math.round((d / p) * 100) : 0);

  // ============================================================
  // Diagramma ma’lumotlari
  // ============================================================

  const monthly = useMemo(() => {
    const map = new Map<string, { key: string; label: string; reja: number; bajarildi: number; oldin?: number }>();
    for (const l of cur.lines) {
      const key = periodKeyOf(l.order.year, l.order.month);
      const row = map.get(key) ?? { key, label: monthLabel(key), reja: 0, bajarildi: 0 };
      row.reja += l.plan;
      row.bajarildi += l.done;
      map.set(key, row);
    }
    const rows = Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key)).slice(-18);
    if (prev && compare === 'yoy') {
      const pmap = new Map<string, number>();
      for (const l of prev.lines) {
        const k = periodKeyOf(l.order.year + 1, l.order.month);
        pmap.set(k, (pmap.get(k) || 0) + l.done);
      }
      rows.forEach(r => { r.oldin = Math.round(pmap.get(r.key) || 0); });
    }
    return rows.map(r => ({ ...r, reja: Math.round(r.reja), bajarildi: Math.round(r.bajarildi) }));
  }, [cur, prev, compare]);

  const byProduct = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of cur.lines) {
      const name = prodLabel(l.order.productType);
      m.set(name, (m.get(name) || 0) + l.done);
    }
    return Array.from(m, ([name, value]) => ({ name, value: Math.round(value) })).filter(r => r.value > 0).sort((a, b) => b.value - a.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, productOptions]);

  const contractorRows = useMemo(() => {
    const m = new Map<string, { name: string; reja: number; bajarildi: number; qoldiq: number }>();
    for (const l of cur.lines) {
      const row = m.get(l.contractor) ?? { name: shortContractor(l.contractor), reja: 0, bajarildi: 0, qoldiq: 0 };
      row.reja += l.plan;
      row.bajarildi += l.done;
      row.qoldiq += l.remain;
      m.set(l.contractor, row);
    }
    return Array.from(m.values()).map(r => ({ ...r, foiz: r.reja > 0 ? Math.round((r.bajarildi / r.reja) * 100) : 0 }));
  }, [cur]);
  const topRemaining = useMemo(() => contractorRows.filter(c => c.qoldiq > 0).sort((a, b) => b.qoldiq - a.qoldiq).slice(0, 10).map(c => ({ ...c, qoldiq: r1(c.qoldiq) })), [contractorRows]);
  const contractorPct = useMemo(() => contractorRows.filter(c => c.reja > 0).sort((a, b) => a.foiz - b.foiz).slice(0, 12), [contractorRows]);

  const byStation = useMemo(() => {
    const m = new Map<string, { name: string; vagon: number; tonna: number }>();
    for (const e of cur.exits) {
      const k = e.station || 'Ko‘rsatilmagan';
      const row = m.get(k) ?? { name: k, vagon: 0, tonna: 0 };
      row.vagon += 1;
      row.tonna += e.tons;
      m.set(k, row);
    }
    return Array.from(m.values()).map(r => ({ ...r, tonna: r1(r.tonna) })).sort((a, b) => (stationMetric === 'tonna' ? b.tonna - a.tonna : b.vagon - a.vagon)).slice(0, 12);
  }, [cur, stationMetric]);

  // Grafik oralig‘i Davr filtridan olinadi: tanlanmagan bo‘lsa — oxirgi 12 oy
  const chartEnd = range.to && range.to < todayIso() ? range.to : todayIso();
  const chartStart = (() => {
    // Davr tanlanmagan bo‘lsa — birinchi ma’lumot kunidan (ko‘pi bilan 12 oy)
    const firstDay = [...cur.entries.map(e => e.day), ...cur.loads.map(e => e.day), ...cur.exits.map(e => e.day)].sort()[0];
    const yearAgo = shiftDays(chartEnd, -364);
    const start = range.from || (firstDay && firstDay > yearAgo ? firstDay : yearAgo);
    return daysBetween(start, chartEnd) > 1100 ? shiftDays(chartEnd, -1099) : start;
  })();
  const spanDays = daysBetween(chartStart, chartEnd);
  // Bo‘lak avtomatik: 45 kungacha — kun, 200 kungacha — hafta, undan ko‘p — oy
  const gran: 'day' | 'week' | 'month' = spanDays <= 45 ? 'day' : spanDays <= 200 ? 'week' : 'month';

  const daily = useMemo(() => {
    const rows = new Map<string, { day: string; label: string; kirdi: number; yuklandi: number; chiqdi: number; chiqdiT: number; oldin?: number }>();
    for (let d = chartStart; d <= chartEnd; d = shiftDays(d, 1)) rows.set(d, { day: d, label: `${d.slice(8, 10)}.${d.slice(5, 7)}`, kirdi: 0, yuklandi: 0, chiqdi: 0, chiqdiT: 0 });
    cur.entries.forEach(e => { const r = rows.get(e.day); if (r) r.kirdi += e.n; });
    cur.loads.forEach(e => { const r = rows.get(e.day); if (r) r.yuklandi += e.n; });
    cur.exits.forEach(e => { const r = rows.get(e.day); if (r) { r.chiqdi += 1; r.chiqdiT += e.tons; } });
    const out = Array.from(rows.values());
    if (prev && cmpRange && range.from) {
      const pmap = new Map<string, { n: number; t: number }>();
      prev.exits.forEach(e => { const x = pmap.get(e.day) ?? { n: 0, t: 0 }; x.n += 1; x.t += e.tons; pmap.set(e.day, x); });
      const offset = daysBetween(cmpRange.from, range.from) - 1;
      out.forEach(r => {
        const x = pmap.get(compare === 'yoy' ? shiftYears(r.day, -1) : shiftDays(r.day, -offset));
        r.oldin = x ? (dailyMetric === 'tonna' ? r1(x.t) : x.n) : 0;
      });
    }
    return out;
  }, [cur, prev, cmpRange?.from, range.from, chartStart, chartEnd, compare, dailyMetric]);

  // Kun → hafta / oy bo‘yicha guruhlash
  const series = useMemo(() => {
    if (gran === 'day') return daily.map(d => ({ ...d, chiqdiT: r1(d.chiqdiT) }));
    const map = new Map<string, { key: string; label: string; day: string; kirdi: number; yuklandi: number; chiqdi: number; chiqdiT: number; oldin?: number }>();
    for (const d of daily) {
      let key: string;
      let label: string;
      if (gran === 'week') {
        const dt = new Date(`${d.day}T00:00:00`);
        const monday = shiftDays(d.day, -((dt.getDay() + 6) % 7));
        key = monday;
        label = `${monday.slice(8, 10)}.${monday.slice(5, 7)} hafta`;
      } else {
        key = d.day.slice(0, 7);
        label = monthLabel(key);
      }
      const row = map.get(key) ?? { key, label, day: key, kirdi: 0, yuklandi: 0, chiqdi: 0, chiqdiT: 0, oldin: d.oldin === undefined ? undefined : 0 };
      row.kirdi += d.kirdi; row.yuklandi += d.yuklandi; row.chiqdi += d.chiqdi; row.chiqdiT += d.chiqdiT;
      if (d.oldin !== undefined) row.oldin = (row.oldin || 0) + d.oldin;
      map.set(key, row);
    }
    return Array.from(map.values()).map(r => ({ ...r, chiqdiT: r1(r.chiqdiT), oldin: r.oldin === undefined ? undefined : r1(r.oldin) }));
  }, [daily, gran]);

  const weekday = useMemo(() => {
    const sums = Array(7).fill(0);
    const days = Array(7).fill(0);
    for (const d of daily) {
      const wd = (new Date(`${d.day}T00:00:00`).getDay() + 6) % 7;
      sums[wd] += d.chiqdi;
      days[wd] += 1;
    }
    return WEEKDAYS.map((label, i) => ({ label, ortacha: days[i] ? r1(sums[i] / days[i]) : 0 }));
  }, [daily]);

  const exitByProduct = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of cur.exits) {
      const name = prodLabel(e.product);
      m.set(name, (m.get(name) || 0) + e.tons);
    }
    return Array.from(m, ([name, value]) => ({ name, value: Math.round(value) })).filter(r => r.value > 0).sort((a, b) => b.value - a.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, productOptions]);

  const stageChart = useMemo(() => STAGES.map(st => {
    const v = cur.stays.map(i => i.stepHours[st.key]).filter(x => x > 0);
    const pv = prev ? prev.stays.map(i => i.stepHours[st.key]).filter(x => x > 0) : [];
    return { key: st.key, label: st.label, meyor: r1(st.norm / 60), haqiqiy: r1(median(v)), oldin: prev ? r1(median(pv)) : undefined };
  }), [cur, prev]);

  const stayTrend = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const i of cur.stays) {
      const d = localDateKey(i.exitedAt!);
      const arr = m.get(d) ?? [];
      arr.push(i.hoursInPlant);
      m.set(d, arr);
    }
    return Array.from(m, ([day, v]) => ({ day, label: `${day.slice(8, 10)}.${day.slice(5, 7)}`, soat: r1(median(v)) }))
      .sort((a, b) => a.day.localeCompare(b.day)).slice(-60);
  }, [cur]);

  const ownershipStay = useMemo(() => ([
    { id: 'majmua', name: 'Majmua vagonlari' },
    { id: 'tashqi', name: 'Tashqi (O‘TY)' },
  ]).map(g => {
    const v = cur.stays.filter(s => s.ownership === g.id).map(s => s.hoursInPlant);
    return { name: g.name, soat: r1(median(v)), soni: v.length };
  }), [cur]);

  const culprits = useMemo(() => {
    const m = new Map<string, { name: string; soat: number; soni: number }>();
    for (const s of cur.stays) {
      if (!s.delayCulprit || s.delayCulprit.hours <= 0) continue;
      const k = s.delayCulprit.role || 'Boshqa';
      const row = m.get(k) ?? { name: k, soat: 0, soni: 0 };
      row.soat += s.delayCulprit.hours;
      row.soni += 1;
      m.set(k, row);
    }
    return Array.from(m.values()).map(r => ({ ...r, soat: r1(r.soat) })).sort((a, b) => b.soat - a.soat).slice(0, 8);
  }, [cur]);

  const weightRows = useMemo(() => {
    const m = new Map<string, { name: string; ortiqcha: number; meyorda: number; kam: number; netto: number; n: number }>();
    for (const i of cur.weights) {
      const name = prodLabel(i.productType || 'Boshqa');
      const row = m.get(name) ?? { name, ortiqcha: 0, meyorda: 0, kam: 0, netto: 0, n: 0 };
      if (i.status === 'overload') row.ortiqcha += 1;
      else if (i.status === 'underload') row.kam += 1;
      else row.meyorda += 1;
      row.netto += i.nettoWeight;
      row.n += 1;
      m.set(name, row);
    }
    return Array.from(m.values()).map(r => ({ ...r, ortacha: r1(r.netto / Math.max(1, r.n)) })).sort((a, b) => b.n - a.n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, productOptions]);

  const weightTrend = useMemo(() => {
    const m = new Map<string, { k: string; ortiqcha: number; kam: number; jami: number }>();
    for (const i of cur.weights) {
      const k = localDateKey(i.date).slice(0, 7);
      const row = m.get(k) ?? { k, ortiqcha: 0, kam: 0, jami: 0 };
      row.jami += 1;
      if (i.status === 'overload') row.ortiqcha += 1;
      if (i.status === 'underload') row.kam += 1;
      m.set(k, row);
    }
    return Array.from(m.values()).sort((a, b) => a.k.localeCompare(b.k)).map(r => ({
      label: monthLabel(r.k),
      ortiqcha: r.jami ? r1((r.ortiqcha / r.jami) * 100) : 0,
      kam: r.jami ? r1((r.kam / r.jami) * 100) : 0,
    }));
  }, [cur]);

  const defectCharts = useMemo(() => {
    const station = new Map<string, number>();
    const type = new Map<string, number>();
    const month = new Map<string, number>();
    for (const i of cur.defectItems) {
      const st = i.station || 'Noma’lum';
      station.set(st, (station.get(st) || 0) + 1);
      const t = (DEFECT_ACT_TYPE_LABEL as Record<string, string>)[i.actType] || i.actType || 'Boshqa';
      type.set(t, (type.get(t) || 0) + 1);
      const mk = localDateKey(i.arrivalDate).slice(0, 7);
      month.set(mk, (month.get(mk) || 0) + 1);
    }
    const rows = (m: Map<string, number>) => Array.from(m, ([name, soni]) => ({ name, soni })).sort((a, b) => b.soni - a.soni);
    return {
      byStation: rows(station).slice(0, 10),
      byType: rows(type),
      byMonth: Array.from(month, ([k, soni]) => ({ k, label: monthLabel(k), soni })).sort((a, b) => a.k.localeCompare(b.k)),
      returned: cur.defectItems.filter(i => i.isReturned).length,
      delay: r1(cur.defectItems.reduce((s, i) => s + (i.delayHours || 0), 0)),
    };
  }, [cur]);

  // ---- Soatlar bo‘yicha yuklanish ----
  const hourly = useMemo(() => {
    const rows = Array.from({ length: 24 }, (_, h) => ({ label: `${String(h).padStart(2, '0')}:00`, kirdi: 0, yuklandi: 0, chiqdi: 0 }));
    cur.entries.forEach(e => { rows[hourOf(e.at)].kirdi += e.n; });
    cur.loads.forEach(e => { rows[hourOf(e.at)].yuklandi += e.n; });
    cur.exits.forEach(e => { rows[hourOf(e.at)].chiqdi += 1; });
    return rows;
  }, [cur]);
  const heat = useMemo(() => {
    const grid = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
    for (const e of cur.exits) {
      const wd = (new Date(`${e.day}T00:00:00`).getDay() + 6) % 7;
      grid[wd][hourOf(e.at)] += 1;
    }
    const max = Math.max(1, ...grid.flat());
    return { grid, max };
  }, [cur]);

  // ---- Oy oxirigacha prognoz (joriy oy, tanlangan mahsulot/kontragent/stansiya bo‘yicha) ----
  /* eslint-disable react-hooks/exhaustive-deps */
  const forecast = useMemo(() => {
    const today = todayIso();
    const mFrom = monthStart(cy, cm);
    const m = computeAll({ from: mFrom, to: today }, filters, orders, arrivals, registries, null, null, null);
    const daysInMonth = Number(monthEnd(cy, cm).slice(8, 10));
    const elapsed = Number(today.slice(8, 10));
    const byDay = Array(daysInMonth + 1).fill(0) as number[];
    m.exits.forEach(e => { byDay[Number(e.day.slice(8, 10))] += e.tons; });
    const shipped = byDay.reduce((a, b) => a + b, 0);
    const pace = elapsed > 0 ? shipped / elapsed : 0;
    const plan = m.plan;
    const base = m.done;
    const projected = base + pace * (daysInMonth - elapsed);
    const need = daysInMonth - elapsed > 0 ? Math.max(0, plan - base) / (daysInMonth - elapsed) : 0;
    let cum = base - shipped;
    const rows = [];
    for (let d = 1; d <= daysInMonth; d += 1) {
      cum += byDay[d];
      rows.push({
        label: String(d),
        haqiqiy: d <= elapsed ? Math.max(0, Math.round(cum)) : undefined,
        prognoz: d >= elapsed ? Math.round(base + pace * (d - elapsed)) : undefined,
      });
    }
    return { rows, plan, base, pace, projected, need, elapsed, daysInMonth, pct: plan > 0 ? Math.round((projected / plan) * 100) : 0 };
  }, [filterKey, orders, arrivals, registries, cy, cm]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // ---- Xodimlar va xizmatlar ----
  const approvals = useMemo(() => {
    const steps: { name: string; group: string; vals: number[] }[] = [
      { name: 'Buxgalteriya kelishuvi', group: 'Buyurtma', vals: [] },
      { name: 'O‘rinbosar tasdig‘i', group: 'Buyurtma', vals: [] },
      { name: 'ICHDX ijroga qabul', group: 'Buyurtma', vals: [] },
      { name: 'Kirish: smena boshlig‘i', group: 'Kirish ruxsati', vals: [] },
      { name: 'Kirish: ruxsatnoma byurosi', group: 'Kirish ruxsati', vals: [] },
      { name: 'Kirish: qo‘riqlash', group: 'Kirish ruxsati', vals: [] },
      { name: 'Yuk xati: smena boshlig‘i', group: 'Yuk xati', vals: [] },
      { name: 'Yuk xati: ruxsatnoma byurosi', group: 'Yuk xati', vals: [] },
      { name: 'Yuk xati: qo‘riqlash', group: 'Yuk xati', vals: [] },
      { name: 'Yuk xati: iqtisodchi', group: 'Yuk xati', vals: [] },
    ];
    const push = (i: number, a?: string | null, b?: string | null) => {
      if (!b || !inDay(localDateKey(b), range)) return;
      const h = hoursBetween(a, b);
      if (h !== null && h < 24 * 30) steps[i].vals.push(h);
    };
    for (const o of orders) {
      if (filters.products.length && !filters.products.includes(o.productType)) continue;
      push(0, o.submittedAt, o.approvedAt);
      push(1, o.approvedAt, o.deputyApprovedAt);
      push(2, o.deputyApprovedAt, o.dispatchApprovedAt);
    }
    for (const a of excludeOneCArrivals(arrivals)) {
      if (filters.products.length && !filters.products.includes(a.productType)) continue;
      push(3, a.createdAt, a.entryPermitShiftApprovedAt);
      push(4, a.createdAt, a.entryPermitPermitApprovedAt);
      push(5, a.createdAt, a.entryPermitSecurityApprovedAt);
    }
    for (const r of registries) {
      if (filters.products.length && !filters.products.includes(r.productType)) continue;
      push(6, r.preparedAt, r.shiftSupervisorApprovedAt);
      push(7, r.preparedAt, r.permitApprovedAt);
      push(8, r.preparedAt, r.securityApprovedAt);
      push(9, r.preparedAt, r.economistApprovedAt);
    }
    return steps.filter(st => st.vals.length > 0).map(st => ({ name: st.name, group: st.group, daqiqa: Math.round(median(st.vals) * 60), soni: st.vals.length }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, arrivals, registries, range.from, range.to, filterKey]);

  const people = useMemo(() => {
    const m = new Map<string, { name: string; buyurtma: number; kirish: number; yuklash: number; yukxati: number }>();
    const add = (name: string | undefined | null, kind: 'buyurtma' | 'kirish' | 'yuklash' | 'yukxati', at?: string | null) => {
      const n = (name || '').trim();
      // Tizim va admin yozuvlari xodimlar reytingiga kirmaydi
      if (!n || /tizim|admin/i.test(n) || !at || !inDay(localDateKey(at), range)) return;
      const row = m.get(n) ?? { name: n, buyurtma: 0, kirish: 0, yuklash: 0, yukxati: 0 };
      row[kind] += 1;
      m.set(n, row);
    };
    for (const o of orders) {
      if (filters.products.length && !filters.products.includes(o.productType)) continue;
      add(o.accountingApproverName, 'buyurtma', o.approvedAt);
      add(o.deputyApproverName, 'buyurtma', o.deputyApprovedAt);
      add(o.dispatchApproverName, 'buyurtma', o.dispatchApprovedAt);
    }
    for (const a of excludeOneCArrivals(arrivals)) {
      if (filters.products.length && !filters.products.includes(a.productType)) continue;
      add(a.entryPermitShiftApprovedByName, 'kirish', a.entryPermitShiftApprovedAt);
      add(a.entryPermitPermitApprovedByName, 'kirish', a.entryPermitPermitApprovedAt);
      add(a.entryPermitSecurityApprovedByName, 'kirish', a.entryPermitSecurityApprovedAt);
      for (const w of a.wagons ?? []) add(w.loadingCompletedByName, 'yuklash', w.loadingCompletedAt);
    }
    for (const r of registries) {
      if (filters.products.length && !filters.products.includes(r.productType)) continue;
      add(r.preparedByName, 'yukxati', r.preparedAt);
      add(r.shiftSupervisorApprovedByName, 'yukxati', r.shiftSupervisorApprovedAt);
      add(r.permitApprovedByName, 'yukxati', r.permitApprovedAt);
      add(r.securityApprovedByName, 'yukxati', r.securityApprovedAt);
      add(r.economistApprovedByName, 'yukxati', r.economistApprovedAt);
    }
    return Array.from(m.values())
      .map(r => ({ ...r, jami: r.buyurtma + r.kirish + r.yuklash + r.yukxati }))
      .sort((a, b) => b.jami - a.jami)
      .slice(0, 15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, arrivals, registries, range.from, range.to, filterKey]);

  // ============================================================
  // Buyurtma muddatlari — qator «Yuklash oxirgi sanasi»ga nisbatan
  // ============================================================
  const deadlines = useMemo(() => {
    const today = todayIso();
    // Har bir buyurtma qatori bo‘yicha chiqqan vagonlar (sana, tonna) — qachon reja to‘lgani aniqlanadi
    const byLine = new Map<string, { day: string; tons: number }[]>();
    for (const r of registries) {
      if (!r.exitedToKengsoyAt) continue;
      const day = localDateKey(r.exitedToKengsoyAt);
      for (const w of r.wagonRoutes ?? []) {
        if (w.isDefective || !w.monthlyOrderLineId) continue;
        const arr = byLine.get(w.monthlyOrderLineId) ?? [];
        arr.push({ day, tons: routeTons(w.netWeight ?? w.NetWeight ?? w.nettoWeight) });
        byLine.set(w.monthlyOrderLineId, arr);
      }
    }
    type St = 'ontime' | 'late' | 'overdue' | 'open' | 'done' | 'nodeadline';
    const rows: { order: MonthlyOrder; contractor: string; deadline: string; plan: number; done: number; status: St; doneDay?: string; days: number }[] = [];
    for (const l of cur.lines) {
      const line = l.line;
      const deadline = line?.lastLoadingDate ? localDateKey(line.lastLoadingDate) : '';
      const finished = l.order.status === 'Completed' || (l.plan > 0 && l.done >= l.plan * 0.999);
      let doneDay: string | undefined;
      if (line?.id) {
        let cum = 0;
        for (const e of (byLine.get(line.id) ?? []).sort((a, b) => a.day.localeCompare(b.day))) {
          cum += e.tons;
          if (cum >= l.plan * 0.999) { doneDay = e.day; break; }
        }
      }
      let status: St;
      let days = 0;
      if (!deadline) status = 'nodeadline';
      else if (finished && doneDay) { status = doneDay <= deadline ? 'ontime' : 'late'; days = Math.max(0, daysBetween(deadline, doneDay) - 1); }
      else if (finished) status = 'done';
      else if (deadline < today) { status = 'overdue'; days = daysBetween(deadline, today) - 1; }
      else { status = 'open'; days = daysBetween(today, deadline) - 1; }
      rows.push({ order: l.order, contractor: l.contractor, deadline, plan: l.plan, done: l.done, status, doneDay, days });
    }
    const label: Record<St, string> = { ontime: 'Muddatida bajarildi', late: 'Kechikib bajarildi', overdue: 'Muddati o‘tgan', open: 'Muddati bor', done: 'Bajarildi (sana noma’lum)', nodeadline: 'Muddat belgilanmagan' };
    const color: Record<St, string> = { ontime: '#10b981', late: '#f59e0b', overdue: '#ef4444', open: '#3b82f6', done: '#94a3b8', nodeadline: '#cbd5e1' };
    const counts = (Object.keys(label) as St[]).map(k => ({ id: k, name: label[k], soni: rows.filter(r => r.status === k).length, color: color[k] })).filter(x => x.soni > 0);
    const judged = rows.filter(r => r.status === 'ontime' || r.status === 'late');
    const ontimePct = judged.length ? Math.round((rows.filter(r => r.status === 'ontime').length / judged.length) * 100) : 0;
    const byMonth = new Map<string, { k: string; muddatida: number; kechikib: number; otgan: number }>();
    for (const r of rows) {
      if (!r.deadline || !['ontime', 'late', 'overdue'].includes(r.status)) continue;
      const k = r.deadline.slice(0, 7);
      const m = byMonth.get(k) ?? { k, muddatida: 0, kechikib: 0, otgan: 0 };
      if (r.status === 'ontime') m.muddatida += 1; else if (r.status === 'late') m.kechikib += 1; else m.otgan += 1;
      byMonth.set(k, m);
    }
    return {
      rows, counts, ontimePct, label,
      byMonth: Array.from(byMonth.values()).sort((a, b) => a.k.localeCompare(b.k)).map(m => ({ ...m, label: monthLabel(m.k) })),
      overdue: rows.filter(r => r.status === 'overdue').sort((a, b) => b.days - a.days),
      soon: rows.filter(r => r.status === 'open' && r.days <= 5).sort((a, b) => a.days - b.days),
    };
  }, [cur, registries]);

  // ============================================================
  // Vagonlarni kiritish — kelishdan zavodga kirib tortilgunicha
  // ============================================================
  const intake = useMemo(() => {
    const steps = [
      { name: 'Kelish → smena tasdig‘i', vals: [] as number[] },
      { name: 'Smena → ruxsatnoma byurosi', vals: [] as number[] },
      { name: 'Ruxsatnoma → qo‘riqlash', vals: [] as number[] },
      { name: 'Qo‘riqlash → tara tortish', vals: [] as number[] },
    ];
    const total: number[] = [];
    const daily = new Map<string, { day: string; majmua: number; tashqi: number }>();
    const list: { a: EmptyWagonArrival; hours: number | null }[] = [];
    const productOk = (p?: string) => filters.products.length === 0 || (!!p && filters.products.includes(p));
    for (const a of excludeOneCArrivals(arrivals)) {
      const start = a.arrivalDate || a.createdAt;
      if (!start || !inDay(localDateKey(start), range) || !productOk(a.productType)) continue;
      const units = a.wagons ?? [];
      const tare = units.map(u => u.tareWeighedAt).filter((x): x is string => Boolean(x)).sort()[0] ?? null;
      const push = (i: number, x?: string | null, y?: string | null) => { const h = hoursBetween(x, y); if (h !== null && h < 24 * 20) steps[i].vals.push(h); };
      push(0, start, a.entryPermitShiftApprovedAt);
      push(1, a.entryPermitShiftApprovedAt, a.entryPermitPermitApprovedAt);
      push(2, a.entryPermitPermitApprovedAt, a.entryPermitSecurityApprovedAt);
      push(3, a.entryPermitSecurityApprovedAt, tare);
      const all = hoursBetween(start, tare);
      if (all !== null && all < 24 * 20) total.push(all);
      list.push({ a, hours: all });
      const day = localDateKey(start);
      const row = daily.get(day) ?? { day, majmua: 0, tashqi: 0 };
      if (units.length) units.forEach(u => { if (normalizeWagonOwnership(u.ownership) === 'majmua') row.majmua += 1; else row.tashqi += 1; });
      else row.tashqi += a.wagonCount || 0;
      daily.set(day, row);
    }
    return {
      steps: steps.map(st => ({ name: st.name, soat: r1(median(st.vals)), soni: st.vals.length })),
      median: r1(median(total)),
      parties: list.length,
      wagons: Array.from(daily.values()).reduce((s0, d) => s0 + d.majmua + d.tashqi, 0),
      daily: Array.from(daily.values()).sort((a, b) => a.day.localeCompare(b.day)).map(d => ({ ...d, label: `${d.day.slice(8, 10)}.${d.day.slice(5, 7)}` })),
      list: list.sort((x, y) => (y.hours ?? 0) - (x.hours ?? 0)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrivals, range.from, range.to, filterKey]);

  // ============================================================
  // Qaytarilgan vagonlar
  // ============================================================
  const returned = useMemo(() => {
    const items: { u: EmptyWagonUnit; a: EmptyWagonArrival; day: string; reason: string; owner: string }[] = [];
    for (const a of excludeOneCArrivals(arrivals)) {
      if (filters.products.length && !filters.products.includes(a.productType)) continue;
      for (const u of a.wagons ?? []) {
        if (u.status !== 'Returned') continue;
        const at = u.defectActUploadedAt || a.arrivalDate || a.createdAt;
        if (!at || !inDay(localDateKey(at), range)) continue;
        const reason = (DEFECT_ACT_TYPE_LABEL as Record<string, string>)[u.defectActType || ''] || (u.defectActType ? u.defectActType : 'Sababi ko‘rsatilmagan');
        items.push({ u, a, day: localDateKey(at), reason, owner: normalizeWagonOwnership(u.ownership) === 'majmua' ? 'Majmua' : 'Tashqi (O‘TY)' });
      }
    }
    const group = (key: (x: typeof items[number]) => string) => {
      const m = new Map<string, number>();
      items.forEach(x => m.set(key(x), (m.get(key(x)) || 0) + 1));
      return Array.from(m, ([name, soni]) => ({ name, soni })).sort((a, b) => b.soni - a.soni);
    };
    const totalUnits = excludeOneCArrivals(arrivals).reduce((s0, a) => {
      const st = a.arrivalDate || a.createdAt;
      return st && inDay(localDateKey(st), range) ? s0 + (a.wagons?.length || a.wagonCount || 0) : s0;
    }, 0);
    return {
      items,
      byReason: group(x => x.reason),
      byOwner: group(x => x.owner),
      byProduct: group(x => prodLabel(x.a.productType)),
      byMonth: group(x => x.day.slice(0, 7)).map(m => ({ ...m, k: m.name, label: monthLabel(m.name) })).sort((a, b) => a.k.localeCompare(b.k)),
      pct: totalUnits ? r1((items.length / totalUnits) * 100) : 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrivals, range.from, range.to, filterKey, productOptions]);

  // ============================================================
  // Vagon parki — majmua vagonlarining aylanishi
  // ============================================================
  const fleet = useMemo(() => {
    const visits = new Map<string, { at: string; exit?: string | null; arrivalId: string; arrivalNumber: string }[]>();
    for (const a of excludeOneCArrivals(arrivals)) {
      const at = a.arrivalDate || a.createdAt;
      if (!at) continue;
      for (const u of a.wagons ?? []) {
        if (normalizeWagonOwnership(u.ownership) !== 'majmua' || !u.wagonNumber) continue;
        const arr = visits.get(u.wagonNumber) ?? [];
        arr.push({ at, exit: u.scaleExitedAt, arrivalId: a.id, arrivalNumber: a.arrivalNumber });
        visits.set(u.wagonNumber, arr);
      }
    }
    const today = todayIso();
    const cycles: number[] = [];
    const cycleByMonth = new Map<string, number[]>();
    const away: number[] = [];
    const rows: { wagon: string; trips: number; last: string; idleDays: number; cycle: number }[] = [];
    for (const [wagon, vs] of visits) {
      vs.sort((a, b) => a.at.localeCompare(b.at));
      const inRange = vs.filter(v => inDay(localDateKey(v.at), range));
      const wagonCycles: number[] = [];
      for (let i = 1; i < vs.length; i += 1) {
        if (!inDay(localDateKey(vs[i].at), range)) continue;
        const c = (new Date(vs[i].at).getTime() - new Date(vs[i - 1].at).getTime()) / 86400000;
        if (c > 0 && c < 120) { cycles.push(c); wagonCycles.push(c); const mk = localDateKey(vs[i].at).slice(0, 7); cycleByMonth.set(mk, [...(cycleByMonth.get(mk) ?? []), c]); }
        const ex = vs[i - 1].exit;
        if (ex) { const aw = (new Date(vs[i].at).getTime() - new Date(ex).getTime()) / 86400000; if (aw >= 0 && aw < 120) away.push(aw); }
      }
      const last = vs[vs.length - 1];
      rows.push({ wagon, trips: inRange.length, last: localDateKey(last.at), idleDays: Math.max(0, daysBetween(localDateKey(last.exit || last.at), today) - 1), cycle: r1(median(wagonCycles)) });
    }
    const hist = [
      { name: '≤ 7 kun', min: 0, max: 7 }, { name: '7–10 kun', min: 7, max: 10 }, { name: '10–15 kun', min: 10, max: 15 },
      { name: '15–20 kun', min: 15, max: 20 }, { name: '20–30 kun', min: 20, max: 30 }, { name: '30+ kun', min: 30, max: 1e9 },
    ].map(h => ({ name: h.name, soni: cycles.filter(c => c > h.min && c <= h.max).length }));
    const cycleTrend = Array.from(cycleByMonth, ([k, v]) => ({ k, label: monthLabel(k), kun: r1(median(v)), reys: v.length })).sort((a, b) => a.k.localeCompare(b.k));
    return {
      cycleTrend,
      total: rows.length,
      active: rows.filter(r => r.trips > 0).length,
      tripsTotal: rows.reduce((s0, r) => s0 + r.trips, 0),
      cycle: r1(median(cycles)),
      away: r1(median(away)),
      hist,
      top: rows.filter(r => r.trips > 0).sort((a, b) => b.trips - a.trips).slice(0, 15).map(r => ({ name: r.wagon, reys: r.trips })),
      idle: rows.filter(r => r.idleDays >= 15).sort((a, b) => b.idleDays - a.idleDays),
      rows,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrivals, range.from, range.to]);

  // ============================================================
  // Vagon parki — ma’lumotnoma + harakat (texnik holat, joylashuv, yo‘nalish, samaradorlik, nosozlik)
  // ============================================================
  const fleet2 = useMemo(() => {
    const today = todayIso();
    const majmua = new Set<string>(fleetCatalog.map(w => w.wagonNumber.trim()));
    for (const a of arrivals) for (const u of a.wagons ?? []) if (normalizeWagonOwnership(u.ownership) === 'majmua' && u.wagonNumber) majmua.add(u.wagonNumber.trim());

    // 1. Texnik holat va depo ta’miri muddati
    const cond = (w: CatalogFleetWagon) => {
      const k = (w.serviceability || '').trim().toLowerCase();
      if (k === 'yaroqli' || k === 'eslatma' || k === 'yaroqsiz') return k;
      const d = w.daysUntilNextDepotRepair;
      if (typeof d === 'number' && d < 0) return 'yaroqsiz';
      if (typeof d === 'number' && d <= 30) return 'eslatma';
      return 'yaroqli';
    };
    const condCount = { yaroqli: 0, eslatma: 0, yaroqsiz: 0 } as Record<string, number>;
    fleetCatalog.forEach(w => { condCount[cond(w)] += 1; });
    const repairBuckets = [
      { id: 'over', name: 'Muddati o‘tgan', test: (d: number) => d < 0, color: '#ef4444' },
      { id: 'd30', name: '30 kun ichida', test: (d: number) => d >= 0 && d <= 30, color: '#f59e0b' },
      { id: 'd60', name: '31–60 kun', test: (d: number) => d > 30 && d <= 60, color: '#eab308' },
      { id: 'ok', name: '60 kundan ko‘p', test: (d: number) => d > 60, color: '#10b981' },
    ];
    const repair = repairBuckets.map(b => ({ id: b.id, name: b.name, color: b.color, soni: fleetCatalog.filter(w => typeof w.daysUntilNextDepotRepair === 'number' && b.test(w.daysUntilNextDepotRepair)).length }));
    const repairUnknown = fleetCatalog.filter(w => typeof w.daysUntilNextDepotRepair !== 'number').length;

    // Har bir vagonning tashriflari (kelish, chiqish)
    const visits = new Map<string, { at: string; exit?: string | null; status: string; defect: boolean; arrivalId: string }[]>();
    for (const a of excludeOneCArrivals(arrivals)) {
      const at = a.arrivalDate || a.createdAt;
      if (!at) continue;
      for (const u of a.wagons ?? []) {
        const n = (u.wagonNumber || '').trim();
        if (!majmua.has(n)) continue;
        const arr = visits.get(n) ?? [];
        arr.push({ at, exit: u.scaleExitedAt, status: u.status, defect: u.status === 'Returned' || Boolean(u.defectActType || u.defectActNumber), arrivalId: a.id });
        visits.set(n, arr);
      }
    }
    visits.forEach(v => v.sort((a, b) => a.at.localeCompare(b.at)));

    // 2. Hozir qayerda
    const where = { zavod: 0, yolda: 0, nomalum: 0 };
    const whereRows: { wagon: string; place: string; since: string; days: number }[] = [];
    for (const n of majmua) {
      const v = visits.get(n);
      const last = v?.[v.length - 1];
      if (!last) { where.nomalum += 1; whereRows.push({ wagon: n, place: 'Ma’lumot yo‘q', since: '', days: 0 }); continue; }
      if (last.exit) { where.yolda += 1; whereRows.push({ wagon: n, place: 'Yo‘lda (zavoddan chiqqan)', since: localDateKey(last.exit), days: daysBetween(localDateKey(last.exit), today) - 1 }); }
      else if (last.status === 'Returned') { where.yolda += 1; whereRows.push({ wagon: n, place: 'Qaytarilgan', since: localDateKey(last.at), days: daysBetween(localDateKey(last.at), today) - 1 }); }
      else { where.zavod += 1; whereRows.push({ wagon: n, place: 'Zavod hududida', since: localDateKey(last.at), days: daysBetween(localDateKey(last.at), today) - 1 }); }
    }

    // 3–4. Yo‘nalishlar (stansiya → qaytib kelgunicha kun) va vagon bo‘yicha tashilgan tonna
    const stationTrips = new Map<string, number[]>();
    const stationOpen = new Map<string, number>();
    const perWagon = new Map<string, { reys: number; tonna: number }>();
    for (const r of registries) {
      if (!r.exitedToKengsoyAt) continue;
      for (const w of r.wagonRoutes ?? []) {
        const n = (w.wagonNumber || '').trim();
        if (w.isDefective || !majmua.has(n)) continue;
        const exitAt = r.exitedToKengsoyAt;
        if (inDay(localDateKey(exitAt), range)) {
          const pw = perWagon.get(n) ?? { reys: 0, tonna: 0 };
          pw.reys += 1; pw.tonna += routeTons(w.netWeight ?? w.NetWeight ?? w.nettoWeight);
          perWagon.set(n, pw);
        }
        // Stansiya nomi har xil yozilgan bo‘lishi mumkin (KENGSOY / Kengsoy) — bitta ko‘rinishga
        const rawSt = (w.destinationStation || r.destinationStation || 'Ko‘rsatilmagan').trim();
        const st = rawSt.charAt(0).toLocaleUpperCase('uz') + rawSt.slice(1).toLocaleLowerCase('uz');
        const next = (visits.get(n) ?? []).find(v => v.at > exitAt);
        if (next) {
          const d = (new Date(next.at).getTime() - new Date(exitAt).getTime()) / 86400000;
          if (d > 0 && d < 120 && inDay(localDateKey(exitAt), range)) {
            const arr = stationTrips.get(st) ?? [];
            arr.push(d);
            stationTrips.set(st, arr);
          }
        } else {
          stationOpen.set(st, (stationOpen.get(st) || 0) + 1);
        }
      }
    }
    const stations = Array.from(new Set([...stationTrips.keys(), ...stationOpen.keys()]))
      .map(st => ({ name: st, kun: r1(median(stationTrips.get(st) ?? [])), reys: (stationTrips.get(st) ?? []).length, yolda: stationOpen.get(st) || 0 }))
      .filter(x => x.reys > 0 || x.yolda > 0)
      .sort((a, b) => b.kun - a.kun)
      .slice(0, 12);
    const wagonsTons = Array.from(perWagon, ([name, x]) => ({ name, tonna: r1(x.tonna), reys: x.reys })).sort((a, b) => b.tonna - a.tonna);

    // 5. Eng ko‘p nosozlik / qaytarish bo‘lgan vagonlar
    const defectsTop = Array.from(visits, ([name, v]) => ({ name, soni: v.filter(x => x.defect && inDay(localDateKey(x.at), range)).length }))
      .filter(x => x.soni > 0).sort((a, b) => b.soni - a.soni).slice(0, 12);

    return {
      catalogCount: fleetCatalog.length,
      cond: [
        { id: 'yaroqli', name: 'Yaroqli', soni: condCount.yaroqli, color: '#10b981' },
        { id: 'eslatma', name: 'Eslatma (ta’mir yaqin)', soni: condCount.eslatma, color: '#f59e0b' },
        { id: 'yaroqsiz', name: 'Yaroqsiz', soni: condCount.yaroqsiz, color: '#ef4444' },
      ].filter(x => x.soni > 0),
      repair, repairUnknown,
      where: [
        { id: 'zavod', name: 'Zavod hududida', soni: where.zavod, color: '#3b82f6' },
        { id: 'yolda', name: 'Yo‘lda', soni: where.yolda, color: '#f59e0b' },
        { id: 'nomalum', name: 'Ma’lumot yo‘q', soni: where.nomalum, color: '#cbd5e1' },
      ].filter(x => x.soni > 0),
      whereRows, stations, wagonsTons,
      tonsTop: wagonsTons.slice(0, 12),
      tonsLow: [...wagonsTons].reverse().slice(0, 8),
      defectsTop,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleetCatalog, arrivals, registries, range.from, range.to]);

  const openFleetCatalogDrill = (title: string, pred: (w: CatalogFleetWagon) => boolean) => {
    openDrill({
      title,
      columns: [
        { key: 'wagon', label: 'Vagon' }, { key: 'kind', label: 'Turi' }, { key: 'cond', label: 'Holati' },
        { key: 'built', label: 'Qurilgan', align: 'center' }, { key: 'depot', label: 'Oxirgi depo ta’miri', align: 'center' },
        { key: 'days', label: 'Ta’mirgacha (kun)', align: 'right' }, { key: 'station', label: 'Stansiya' },
      ],
      rows: fleetCatalog.filter(pred).sort((a, b) => (a.daysUntilNextDepotRepair ?? 9999) - (b.daysUntilNextDepotRepair ?? 9999)).map(w => ({
        id: w.id,
        cells: {
          wagon: w.wagonNumber, kind: w.wagonKind || '—', cond: w.serviceability || '—',
          built: w.builtAt ? w.builtAt.slice(0, 10).split('-').reverse().join('.') : '—',
          depot: w.lastDepotRepairAt ? w.lastDepotRepairAt.slice(0, 10).split('-').reverse().join('.') : '—',
          days: typeof w.daysUntilNextDepotRepair === 'number' ? w.daysUntilNextDepotRepair : '—',
          station: w.destinationStation || '—',
        },
      })),
    });
  };
  const openWhereDrill = (title: string, pred: (r: (typeof fleet2.whereRows)[number]) => boolean) => {
    openDrill({
      title,
      columns: [{ key: 'wagon', label: 'Vagon' }, { key: 'place', label: 'Joylashuv' }, { key: 'since', label: 'Qachondan', align: 'center' }, { key: 'days', label: 'Necha kun', align: 'right' }],
      rows: fleet2.whereRows.filter(pred).sort((a, b) => b.days - a.days).map(r => ({
        id: r.wagon,
        cells: { wagon: r.wagon, place: r.place, since: r.since ? r.since.split('-').reverse().join('.') : '—', days: r.since ? r.days : '—' },
      })),
    });
  };

  // ============================================================
  // Tafsilot (drill-down) — diagramma bo‘lagi bosilganda
  // ============================================================

  const openDrill = (d: DrillState) => {
    setDrill(d);
    window.setTimeout(() => document.getElementById('stat-drill')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };
  const orderHref = (o: MonthlyOrder) => `/orders/${o.logisticsType === 'Road' ? 'road' : 'railway'}?view=${o.status === 'Completed' ? 'yakun' : 'faol'}&open=${o.id}`;
  const fmtDay = (iso?: string | null) => (iso ? localDateKey(iso).split('-').reverse().join('.') : '—');

  const ORDER_COLS: DrillColumn[] = [
    { key: 'num', label: 'Hujjat raqami' },
    { key: 'period', label: 'Davr' },
    { key: 'product', label: 'Mahsulot' },
    { key: 'contractor', label: 'Kontragent' },
    { key: 'plan', label: 'Reja (t)', align: 'right' },
    { key: 'done', label: 'Bajarildi (t)', align: 'right' },
    { key: 'remain', label: 'Qoldiq (t)', align: 'right' },
    { key: 'status', label: 'Holat', align: 'center' },
  ];
  const drillOrders = (title: string, pred: (l: Computed['lines'][number]) => boolean, subtitle?: string) => {
    const rows: DrillRow[] = cur.lines.filter(pred).map((l, i) => ({
      id: `${l.order.id}-${i}`,
      href: orderHref(l.order),
      cells: {
        num: l.order.orderNumber,
        period: `${MONTH_NAMES_UZ[l.order.month - 1] || ''} ${l.order.year}`,
        product: prodLabel(l.order.productType),
        contractor: shortContractor(l.contractor),
        plan: formatTons(r1(l.plan)),
        done: formatTons(r1(l.done)),
        remain: l.order.status === 'Completed' ? 'Yopildi' : formatTons(r1(l.remain)),
        status: l.order.status === 'Completed' ? 'Yakunlangan' : 'Ijroda',
      },
    }));
    openDrill({ title, subtitle, columns: ORDER_COLS, rows });
  };

  const drillExits = (title: string, pred: (e: Computed['exits'][number]) => boolean, subtitle?: string) => {
    const rows: DrillRow[] = cur.exits.filter(pred).sort((a, b) => b.day.localeCompare(a.day)).map((e, i) => ({
      id: `${e.registryId}-${e.wagonNumber}-${i}`,
      href: `/registry?expanded=reg:${e.registryId}`,
      cells: {
        day: e.day.split('-').reverse().join('.'),
        wagon: e.wagonNumber,
        reg: e.registryNumber,
        product: prodLabel(e.product),
        contractor: shortContractor(e.contractor),
        station: e.station || '—',
        tons: formatTons(r1(e.tons)),
      },
    }));
    openDrill({
      title, subtitle, rows,
      columns: [
        { key: 'day', label: 'Chiqqan sana' }, { key: 'wagon', label: 'Vagon' }, { key: 'reg', label: 'Yuk xati' },
        { key: 'product', label: 'Mahsulot' }, { key: 'contractor', label: 'Kontragent' }, { key: 'station', label: 'Stansiya' },
        { key: 'tons', label: 'Netto (t)', align: 'right' },
      ],
    });
  };

  const drillStays = (title: string, pred: (s: Computed['stays'][number]) => boolean, sortKey?: (typeof STAGES)[number]['key'], subtitle?: string) => {
    const list = cur.stays.filter(pred).sort((a, b) => (sortKey ? b.stepHours[sortKey] - a.stepHours[sortKey] : b.hoursInPlant - a.hoursInPlant));
    const rows: DrillRow[] = list.map((s0, i) => ({
      id: `${s0.id}-${i}`,
      href: s0.arrivalId ? `/empty-wagons?arrivalId=${s0.arrivalId}` : undefined,
      cells: {
        wagon: s0.wagonNumber,
        arrival: s0.arrivalNumber,
        product: prodLabel(s0.productType),
        exited: fmtDay(s0.exitedAt),
        stage: sortKey ? r1(s0.stepHours[sortKey]) : '—',
        total: r1(s0.hoursInPlant),
        culprit: s0.delayCulprit?.role || '—',
      },
    }));
    openDrill({
      title, subtitle, rows,
      columns: [
        { key: 'wagon', label: 'Vagon' }, { key: 'arrival', label: 'Partiya' }, { key: 'product', label: 'Mahsulot' },
        { key: 'exited', label: 'Chiqqan sana' },
        ...(sortKey ? [{ key: 'stage', label: 'Bosqichda (soat)', align: 'right' as const }] : []),
        { key: 'total', label: 'Jami (soat)', align: 'right' }, { key: 'culprit', label: 'Kechikish xizmati' },
      ],
    });
  };

  const drillWeights = (title: string, pred: (w: Computed['weights'][number]) => boolean) => {
    const label = { overload: 'Ortiqcha yuklash', underload: 'Kam yuklash', normal: 'Me’yorda' } as const;
    const rows: DrillRow[] = cur.weights.filter(pred).sort((a, b) => Math.abs(b.diffTons) - Math.abs(a.diffTons)).map((w, i) => ({
      id: `${w.wagonNumber}-${i}`,
      cells: {
        wagon: w.wagonNumber, arrival: w.arrivalNumber, product: prodLabel(w.productType), day: fmtDay(w.date),
        netto: r1(w.nettoWeight), cap: r1(w.capacityTons), diff: `${w.diffTons > 0 ? '+' : ''}${r1(w.diffTons)}`, status: label[w.status],
      },
    }));
    openDrill({
      title, rows, subtitle: '≈ sig‘im mahsulot turi bo‘yicha taxminiy',
      columns: [
        { key: 'wagon', label: 'Vagon' }, { key: 'arrival', label: 'Partiya' }, { key: 'product', label: 'Mahsulot' }, { key: 'day', label: 'Sana' },
        { key: 'netto', label: 'Netto (t)', align: 'right' }, { key: 'cap', label: '≈ Sig‘im (t)', align: 'right' },
        { key: 'diff', label: 'Farq (t)', align: 'right' }, { key: 'status', label: 'Holat', align: 'center' },
      ],
    });
  };

  const drillDefects = (title: string, pred: (d: Computed['defectItems'][number]) => boolean) => {
    const rows: DrillRow[] = cur.defectItems.filter(pred).map((d, i) => ({
      id: `${d.actNumber}-${i}`,
      cells: {
        act: d.actNumber || '—', wagon: d.wagonNumber, arrival: d.arrivalNumber, day: fmtDay(d.arrivalDate), station: d.station || '—',
        type: (DEFECT_ACT_TYPE_LABEL as Record<string, string>)[d.actType] || d.actType || '—', reason: d.defectReason || '—',
        returned: d.isReturned ? 'Ha' : 'Yo‘q',
      },
    }));
    openDrill({
      title, rows,
      columns: [
        { key: 'act', label: 'Dalolatnoma' }, { key: 'wagon', label: 'Vagon' }, { key: 'arrival', label: 'Partiya' }, { key: 'day', label: 'Kelgan sana' },
        { key: 'station', label: 'Stansiya' }, { key: 'type', label: 'Turi' }, { key: 'reason', label: 'Sabab' }, { key: 'returned', label: 'Qaytarilgan', align: 'center' },
      ],
    });
  };

  const openDeadlineDrill = (title: string, pred: (r: (typeof deadlines.rows)[number]) => boolean) => {
    openDrill({
      title,
      columns: [
        { key: 'num', label: 'Hujjat raqami' }, { key: 'contractor', label: 'Kontragent' }, { key: 'product', label: 'Mahsulot' },
        { key: 'deadline', label: 'Yuklash muddati', align: 'center' }, { key: 'doneDay', label: 'Bajarilgan sana', align: 'center' },
        { key: 'plan', label: 'Reja (t)', align: 'right' }, { key: 'done', label: 'Bajarildi (t)', align: 'right' },
        { key: 'status', label: 'Holat', align: 'center' }, { key: 'days', label: 'Kun', align: 'right' },
      ],
      rows: deadlines.rows.filter(pred).map((r, i) => ({
        id: `${r.order.id}-${i}`,
        href: orderHref(r.order),
        cells: {
          num: r.order.orderNumber, contractor: shortContractor(r.contractor), product: prodLabel(r.order.productType),
          deadline: r.deadline ? r.deadline.split('-').reverse().join('.') : '—', doneDay: r.doneDay ? r.doneDay.split('-').reverse().join('.') : '—',
          plan: formatTons(r1(r.plan)), done: formatTons(r1(r.done)), status: deadlines.label[r.status],
          days: r.status === 'overdue' ? `+${r.days}` : r.status === 'late' ? `+${r.days}` : r.status === 'open' ? `${r.days} qoldi` : '—',
        },
      })),
    });
  };

  const openIntakeDrill = () => {
    openDrill({
      title: 'Partiyalar — kelishdan tara tortishgacha',
      columns: [
        { key: 'num', label: 'Partiya' }, { key: 'product', label: 'Mahsulot' }, { key: 'arrived', label: 'Kelgan' },
        { key: 'shift', label: 'Smena tasdig‘i' }, { key: 'permit', label: 'Ruxsatnoma' }, { key: 'security', label: 'Qo‘riqlash' },
        { key: 'wagons', label: 'Vagon', align: 'right' }, { key: 'hours', label: 'Jami (soat)', align: 'right' },
      ],
      rows: intake.list.map(({ a, hours }) => ({
        id: a.id,
        href: `/empty-wagons?arrivalId=${a.id}`,
        cells: {
          num: a.arrivalNumber, product: prodLabel(a.productType), arrived: fmtDay(a.arrivalDate || a.createdAt),
          shift: fmtDay(a.entryPermitShiftApprovedAt), permit: fmtDay(a.entryPermitPermitApprovedAt), security: fmtDay(a.entryPermitSecurityApprovedAt),
          wagons: a.wagons?.length || a.wagonCount || 0, hours: hours === null ? '—' : r1(hours),
        },
      })),
    });
  };

  const openReturnedDrill = (title: string, pred: (x: (typeof returned.items)[number]) => boolean) => {
    openDrill({
      title,
      columns: [
        { key: 'wagon', label: 'Vagon' }, { key: 'arrival', label: 'Partiya' }, { key: 'product', label: 'Mahsulot' },
        { key: 'day', label: 'Sana', align: 'center' }, { key: 'owner', label: 'Egaligi' }, { key: 'reason', label: 'Sabab' }, { key: 'act', label: 'Dalolatnoma' },
      ],
      rows: returned.items.filter(pred).map((x, i) => ({
        id: `${x.u.id}-${i}`,
        href: `/empty-wagons?arrivalId=${x.a.id}`,
        cells: {
          wagon: x.u.wagonNumber, arrival: x.a.arrivalNumber, product: prodLabel(x.a.productType), day: x.day.split('-').reverse().join('.'),
          owner: x.owner, reason: x.reason, act: x.u.defectActNumber || '—',
        },
      })),
    });
  };

  const openFleetDrill = (title: string, pred: (r: (typeof fleet.rows)[number]) => boolean) => {
    openDrill({
      title,
      columns: [
        { key: 'wagon', label: 'Vagon' }, { key: 'trips', label: 'Davrdagi reys', align: 'right' }, { key: 'cycle', label: 'Aylanish (kun)', align: 'right' },
        { key: 'last', label: 'Oxirgi kelgan', align: 'center' }, { key: 'idle', label: 'Kelmaganiga (kun)', align: 'right' },
      ],
      rows: fleet.rows.filter(pred).sort((a, b) => b.idleDays - a.idleDays).map(r => ({
        id: r.wagon,
        cells: { wagon: r.wagon, trips: r.trips, cycle: r.cycle || '—', last: r.last.split('-').reverse().join('.'), idle: r.idleDays },
      })),
    });
  };

  // Recharts bosish hodisasidan qator ma’lumotini olish
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payloadOf = (d: any) => (d && d.payload ? d.payload : d);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linePayload = (st: any) => st?.activePayload?.[0]?.payload;

  // ============================================================
  // Excel
  // ============================================================

  const exportAll = () => {
    exportSheets(`Statistika_${todayStamp()}`, [
      {
        name: 'Filtrlar',
        rows: [
          ['Filtr', 'Qiymat'],
          ['Davr', range.from || range.to ? `${range.from || '…'} — ${range.to || '…'}` : 'Hammasi'],
          ['Mahsulot', filters.products.map(prodLabel).join(', ') || 'Hammasi'],
          ['Transport', filters.transport === 'Road' ? 'Avtotransport' : filters.transport === 'Railway' ? 'Temir yo‘l' : 'Hammasi'],
          ['Kontragent', filters.contractors.map(shortContractor).join(', ') || 'Hammasi'],
          ['Stansiya', filters.stations.join(', ') || 'Hammasi'],
          ['Vagon', filters.ownership === 'majmua' ? 'Majmua' : filters.ownership === 'tashqi' ? 'Tashqi (O‘TY)' : 'Hammasi'],
        ],
      },
      { name: 'Reja ijrosi (oylar)', rows: [['Oy', 'Reja (t)', 'Bajarildi (t)', 'Bajarilish (%)'], ...monthly.map(m => [m.label, m.reja, m.bajarildi, m.reja > 0 ? `${pct(m.bajarildi, m.reja)}%` : '—'])] },
      { name: 'Kontragentlar', rows: [['Kontragent', 'Reja (t)', 'Bajarildi (t)', 'Bajarilish (%)', 'Qoldiq (t)'], ...contractorRows.map(c => [c.name, r1(c.reja), r1(c.bajarildi), `${c.foiz}%`, r1(c.qoldiq)])] },
      { name: 'Stansiyalar', rows: [['Stansiya', 'Vagon', 'Tonna'], ...byStation.map(s => [s.name, s.vagon, s.tonna])] },
      { name: 'Kunlik vagonlar', rows: [['Sana', 'Kirdi', 'Yuklandi', 'Chiqdi'], ...daily.map(d => [d.day, d.kirdi, d.yuklandi, d.chiqdi])] },
      { name: 'Bekor turish', rows: [['Bosqich', 'Me’yor (soat)', 'Haqiqiy, mediana (soat)'], ...stageChart.map(s => [s.label, s.meyor, s.haqiqiy])] },
      { name: 'Yuklash sifati', rows: [['Mahsulot', 'Tortilgan', 'Kam yuklash', 'Me’yorda', 'Ortiqcha yuklash', 'O‘rtacha netto (t)'], ...weightRows.map(w => [w.name, w.n, w.kam, w.meyorda, w.ortiqcha, w.ortacha])] },
      { name: 'Nosozliklar', rows: [['Stansiya', 'Dalolatnoma'], ...defectCharts.byStation.map(d => [d.name, d.soni])] },
    ]);
  };

  // ============================================================
  // Qayta ishlatiladigan diagrammalar
  // ============================================================

  const monthlyChart = (
    <ChartCard title="Oylar bo‘yicha reja va bajarilish" hint={`${compare === 'yoy' && prev ? 'Tonna · och ko‘k — o‘tgan yilning shu oyi' : 'Tasdiqlangan buyurtmalar, tonna'} · ustun bosilsa — buyurtmalar ro‘yxati`}>
      {monthly.length === 0 ? empty() : (
        <ResponsiveContainer width="100%" height={290}>
          <BarChart data={monthly} margin={{ top: 22, right: 8, left: 0, bottom: 0 }} barGap={6} barCategoryGap="28%">
            <CartesianGrid stroke={grid} vertical={false} />
            <XAxis dataKey="label" stroke={axis} fontSize={12} tickLine={false} axisLine={false} />
            <YAxis label={yUnit('tonna')} stroke={axis} fontSize={12} tickLine={false} axisLine={false} tickFormatter={shortNum} width={60} />
            <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v: number) => tons(v)} />
            <Legend wrapperStyle={{ fontSize: 13 }} />
            <Bar dataKey="reja" name="Reja" fill={ghost} radius={[6, 6, 0, 0]} maxBarSize={56} cursor="pointer" onClick={d => { const r = payloadOf(d); drillOrders(`${r.label} — buyurtmalar`, l => periodKeyOf(l.order.year, l.order.month) === r.key); }} />
            <Bar dataKey="bajarildi" name="Bajarildi" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={56} cursor="pointer" onClick={d => { const r = payloadOf(d); drillOrders(`${r.label} — buyurtmalar`, l => periodKeyOf(l.order.year, l.order.month) === r.key); }} />
            {compare === 'yoy' && prev ? <Bar dataKey="oldin" name="O‘tgan yil" fill="#93c5fd" radius={[6, 6, 0, 0]} maxBarSize={56} /> : null}
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );

  const dailyTotals = daily.reduce((acc, d) => ({ k: acc.k + d.kirdi, y: acc.y + d.yuklandi, c: acc.c + d.chiqdi, t: acc.t + d.chiqdiT }), { k: 0, y: 0, c: 0, t: 0 });
  const periodPred = (row: { day: string }) => (e: { day: string }) =>
    gran === 'day' ? e.day === row.day : gran === 'month' ? e.day.slice(0, 7) === row.day : e.day >= row.day && e.day <= shiftDays(row.day, 6);
  const dailyChart = (
    <ChartCard
      title={gran === 'day' ? 'Kunlar bo‘yicha' : gran === 'week' ? 'Haftalar bo‘yicha' : 'Oylar bo‘yicha'}
      hint={`Kirdi: ${dailyTotals.k} · Yuklandi: ${dailyTotals.y} · Chiqdi: ${dailyTotals.c} vagon (${formatTons(r1(dailyTotals.t))} t) · ${daily.length} kun · nuqta bosilsa — chiqqan vagonlar${filters.contractors.length || filters.stations.length ? ' · kontragent/stansiya filtri faqat chiqishga qo‘llanadi' : ''}`}
    >
      <div className="stat-toggles">
        <div className="stat-seg" role="group" aria-label="O‘lchov">
          {([['vagon', 'Vagon'], ['tonna', 'Tonna']] as const).map(([id, l]) => (
            <button key={id} type="button" className={dailyMetric === id ? 'is-active' : ''} onClick={() => setDailyMetric(id)}>{l}</button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={series}
          margin={{ top: 22, right: 12, left: 0, bottom: 0 }}
          onClick={st => {
            const row = linePayload(st);
            if (row) drillExits(`${row.label} — chiqqan vagonlar`, periodPred(row));
          }}
          style={{ cursor: 'pointer' }}
        >
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="label" stroke={axis} fontSize={12} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
          <YAxis label={yUnit(dailyMetric === 'tonna' ? 'tonna' : 'vagon')} stroke={axis} fontSize={12} tickLine={false} axisLine={false} allowDecimals={dailyMetric === 'tonna'} width={60} tickFormatter={shortNum} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => (dailyMetric === 'tonna' ? tons(v) : `${v} vagon`)} />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          {/* Recharts Fragment ichidagi chiziqlarni ko‘rmaydi — har biri alohida shart bilan */}
          {dailyMetric === 'vagon' ? <Line type="linear" dataKey="kirdi" name="Kirdi" stroke="#f59e0b" strokeWidth={2.2} dot={false} /> : null}
          {dailyMetric === 'vagon' ? <Line type="linear" dataKey="yuklandi" name="Yuklandi" stroke="#3b82f6" strokeWidth={2.2} dot={false} /> : null}
          {dailyMetric === 'vagon' ? <Line type="linear" dataKey="chiqdi" name="Chiqdi" stroke="#10b981" strokeWidth={2.4} dot={gran !== 'day'} /> : null}
          {dailyMetric === 'tonna' ? <Line type="linear" dataKey="chiqdiT" name="Jo‘natildi (t)" stroke="#10b981" strokeWidth={2.4} dot={gran !== 'day'} /> : null}
          {prev ? <Line type="linear" dataKey="oldin" name="Solishtirma davr" stroke="#10b981" strokeOpacity={0.45} strokeDasharray="5 4" strokeWidth={2} dot={false} /> : null}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );

  const stageChartCard = (
    <ChartCard title="Bosqichlar bo‘yicha vaqt" hint={`${cur.stays.length} ta chiqqan vagon · mediana, soat · kulrang — reglament me’yori (jami 533 daqiqa) · ustun bosilsa — vagonlar`}>
      {cur.stays.length === 0 ? empty() : (
        <ResponsiveContainer width="100%" height={290}>
          <BarChart data={stageChart} margin={{ top: 22, right: 8, left: 0, bottom: 0 }} barGap={4} barCategoryGap="22%">
            <CartesianGrid stroke={grid} vertical={false} />
            <XAxis dataKey="label" stroke={axis} fontSize={11.5} tickLine={false} axisLine={false} interval={0} />
            <YAxis label={yUnit('soat')} stroke={axis} fontSize={12} tickLine={false} axisLine={false} width={60} />
            <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v: number) => `${v} soat`} />
            <Legend wrapperStyle={{ fontSize: 13 }} />
            <Bar dataKey="meyor" name="Me’yor" fill={ghost} radius={[6, 6, 0, 0]} maxBarSize={40} />
            <Bar dataKey="haqiqiy" name="Haqiqiy" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={40} cursor="pointer" onClick={d => { const r = payloadOf(d); drillStays(`${r.label} — eng uzoq turgan vagonlar`, () => true, r.key); }}>
              {stageChart.map((r, i) => <Cell key={i} fill={r.haqiqiy > r.meyor ? '#ef4444' : '#10b981'} />)}
            </Bar>
            {prev ? <Bar dataKey="oldin" name="Solishtirma davr" fill="#a78bfa" radius={[6, 6, 0, 0]} maxBarSize={40} /> : null}
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );

  const topRemainingChart = (
    <ChartCard title="Qoldig‘i eng ko‘p kontragentlar" hint="Ijrodagi buyurtmalar bo‘yicha yetkazilmagan tonna (top 10)">
      {topRemaining.length === 0 ? empty('Qoldiq yo‘q') : (
        <ResponsiveContainer width="100%" height={Math.max(160, topRemaining.length * 32 + 30)}>
          <BarChart data={topRemaining} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
            <CartesianGrid stroke={grid} horizontal={false} />
            <XAxis type="number" stroke={axis} fontSize={12} tickLine={false} axisLine={false} tickFormatter={v => `${shortNum(v)}`} />
            <YAxis type="category" dataKey="name" stroke={axis} fontSize={12} tickLine={false} axisLine={false} width={190} />
            <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v: number) => tons(v)} />
            <Bar dataKey="qoldiq" name="Qoldiq" fill="#f59e0b" radius={[0, 6, 6, 0]} maxBarSize={22} cursor="pointer" onClick={d => { const r = payloadOf(d); drillOrders(`${r.name} — qoldiqli buyurtmalar`, l => shortContractor(l.contractor) === r.name && l.remain > 0); }} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );

  const pieCard = (title: string, data: { name: string; value: number }[], hint: string, onSlice?: (name: string) => void) => (
    <ChartCard title={title} hint={hint}>
      {data.length === 0 ? empty() : (
        <ResponsiveContainer width="100%" height={290}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={62} outerRadius={100} paddingAngle={2} stroke="none" cursor={onSlice ? 'pointer' : undefined} onClick={onSlice ? d => onSlice(payloadOf(d).name) : undefined}>
              {data.map((_, i) => <Cell key={i} fill={PRODUCT_COLORS[i % PRODUCT_COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => tons(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );

  const kpis = [
    { tone: 'blue', icon: Target, title: 'Reja', hint: `${cur.orderCount} ta tasdiqlangan buyurtma`, value: tons(cur.plan), delta: <Delta cur={cur.plan} prev={prev ? prev.plan : null} /> },
    { tone: 'green', icon: CheckCircle2, title: 'Bajarildi', hint: `${tons(cur.done)} yuklandi`, value: `${pct(cur.done, cur.plan)}%`, delta: <Delta cur={pct(cur.done, cur.plan)} prev={prev ? pct(prev.done, prev.plan) : null} pp /> },
    { tone: 'amber', icon: Hourglass, title: 'Qoldiq', hint: 'ijrodagi buyurtmalar bo‘yicha', value: tons(cur.remain), delta: <Delta cur={cur.remain} prev={prev ? prev.remain : null} invert /> },
    { tone: 'violet', icon: Truck, title: 'Jo‘natildi', hint: tons(cur.exitTons), value: `${cur.exitWagons} vagon`, delta: <Delta cur={cur.exitWagons} prev={prev ? prev.exitWagons : null} /> },
  ];

  // PDF hisobot: barcha bo‘limlar bitta sahifada chiziladi va chop etish oynasi ochiladi
  useEffect(() => {
    if (!printAll) return;
    const done = () => setPrintAll(false);
    window.addEventListener('afterprint', done);
    const timer = window.setTimeout(() => window.print(), 900);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', done);
    };
  }, [printAll]);
  const show = (t: Tab) => (printAll ? t !== 'overview' : groupParts.includes(t));
  const sectionTitle = (t: Tab) => {
    if (!printAll && groupParts.length < 2) return null;
    const sec = SECTIONS.find(x => x.id === t);
    if (!sec) return null;
    const Icon = sec.icon;
    return printAll
      ? <h2 className="stat-print-section">{sec.label}</h2>
      : <h2 className="stat-subsection"><Icon className="w-4 h-4" aria-hidden />{sec.label}</h2>;
  };
  const filterSummary = [
    range.from || range.to ? `Davr: ${range.from || '…'} — ${range.to || '…'}` : 'Davr: barcha',
    filters.products.length ? `Mahsulot: ${filters.products.map(prodLabel).join(', ')}` : null,
    filters.transport ? `Transport: ${filters.transport === 'Road' ? 'Avtotransport' : 'Temir yo‘l'}` : null,
    filters.contractors.length ? `Kontragent: ${filters.contractors.map(shortContractor).join(', ')}` : null,
    filters.stations.length ? `Stansiya: ${filters.stations.join(', ')}` : null,
    filters.ownership ? `Vagon: ${filters.ownership === 'majmua' ? 'Majmua' : 'Tashqi (O‘TY)'}` : null,
    cmpRange ? `Solishtirma davr: ${cmpRange.from} — ${cmpRange.to}` : null,
  ].filter(Boolean).join(' · ');

  const hasFilters = Boolean(filters.products.length || filters.transport || filters.contractors.length || filters.stations.length || filters.ownership || range.from || range.to || compare !== 'none');

  return (
    <div className={`space-y-4${printAll ? ' stat-printing' : ''}`}>
      {printAll ? (
        <header className="stat-print-header">
          <div>
            <h1>E-Transport — Statistika hisoboti</h1>
            <p>{filterSummary}</p>
          </div>
          <span>{new Intl.DateTimeFormat('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' }).format(new Date())}</span>
        </header>
      ) : null}
      <div className="order-status-cards order-status-cards--four plan-kpis">
        {kpis.map(k => {
          const Icon = k.icon;
          return (
            <div key={k.title} className={`order-status-card order-status-card--${k.tone}`}>
              <span className="order-status-card__icon"><Icon strokeWidth={1.9} aria-hidden /></span>
              <span className="order-status-card__text">
                <strong>{k.title} {k.delta}</strong>
                <small>{k.hint}</small>
              </span>
              <span className="order-status-card__count">{k.value}</span>
            </div>
          );
        })}
      </div>

      <div className="docs-panel">
        <div className="stats-filters">
          <div className="stats-filters__row">
            <StatsPeriodPicker
              from={range.from}
              to={range.to}
              presets={presets}
              years={years}
              currentYear={cy}
              currentMonth={cm}
              onChange={(f, t) => setParam({ from: f, to: t })}
            />
            <StatsMultiSelect label="Mahsulot" options={productOptions} value={filters.products} onChange={v => setParam({ p: v })} />
            <StatsMultiSelect label="Kontragent" options={contractorOptions} value={filters.contractors} onChange={v => setParam({ c: v })} />
            <StatsMultiSelect
              label="Transport"
              single
              options={[{ value: 'Railway', label: 'Temir yo‘l' }, { value: 'Road', label: 'Avtotransport' }]}
              value={filters.transport ? [filters.transport] : []}
              onChange={v => setParam({ t: v[0] || null })}
            />
            <StatsMultiSelect
              label="Vagon"
              single
              options={[{ value: 'majmua', label: 'Majmua vagonlari' }, { value: 'tashqi', label: 'Tashqi (O‘TY)' }]}
              value={filters.ownership ? [filters.ownership] : []}
              onChange={v => setParam({ o: v[0] || null })}
            />
            <StatsMultiSelect
              label="Solishtirish"
              single
              allLabel="Yo‘q"
              options={[{ value: 'prev', label: 'Oldingi davr bilan' }, { value: 'yoy', label: 'O‘tgan yil bilan' }]}
              value={compare === 'none' ? [] : [compare]}
              onChange={v => {
                // Davr tanlanmagan bo‘lsa, solishtirish uchun «Bu oy» olinadi
                const needs = v[0] && (!range.from || !range.to);
                const month = presets.find(p => p.id === 'month')!;
                setParam({ cmp: v[0] || null, ...(needs ? { from: month.from, to: month.to } : {}) });
              }}
            />
            {hasFilters ? (
              <button type="button" className="stats-reset" onClick={() => setSp(new URLSearchParams(tab === 'overview' ? {} : { tab }), { replace: true })}>
                <X className="w-3.5 h-3.5" /> Tozalash
              </button>
            ) : null}
            <div className="stats-filters__spacer" />
            <button type="button" className="btn-secondary stats-action" onClick={() => { setDrill(null); setPrintAll(true); }} disabled={loading || printAll} title="Barcha bo‘limlar diagrammalari bilan — chop etish oynasida «PDF sifatida saqlash»">
              <FileDown className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              <span>{printAll ? 'Tayyorlanmoqda…' : 'PDF'}</span>
            </button>
            <button type="button" className="btn-secondary stats-action" onClick={exportAll} disabled={loading}>
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Excel</span>
            </button>
          </div>
          {prev && cmpRange ? (
            <p className="stats-compare-note">Solishtirma davr: {cmpRange.from.split('-').reverse().join('.')} — {cmpRange.to.split('-').reverse().join('.')}. Kartochkalardagi ▲▼ shu davrga nisbatan.</p>
          ) : null}
        </div>

        <div className="order-kind-toggle plan-view-toggle stats-tabs" role="tablist" aria-label="Statistika bo‘limlari">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`order-kind-toggle__btn${tab === t.id ? ' is-active' : ''}`} onClick={() => setParam({ tab: t.id === 'overview' ? null : t.id })}>
                <Icon className="order-kind-toggle__icon" aria-hidden />
                {t.label}
              </button>
            );
          })}
        </div>

        {loading ? <div className="stat-empty">Ma’lumotlar yuklanmoqda…</div> : (
          <>
            {show('overview') ? (
              <>
                <div className="stat-grid stat-grid--1-1">
                  {monthlyChart}
                  {stageChartCard}
                </div>
                {dailyChart}
                <div className="stat-grid stat-grid--1-1">
                  {topRemainingChart}
                  {pieCard('Mahsulotlar ulushi', byProduct, 'Yuklangan tonna bo‘yicha · bo‘lak bosilsa — buyurtmalar', name => drillOrders(`${name} — buyurtmalar`, l => prodLabel(l.order.productType) === name))}
                </div>
              </>
            ) : null}

            {printAll || tab === 'orders' || tab === 'overview' ? (
              <ChartCard
                title={`${MONTH_NAMES_UZ[cm - 1]} oyi — oy oxirigacha prognoz`}
                hint={`Reja: ${tons(forecast.plan)} · bajarildi: ${tons(forecast.base)} · hozirgi sur’at: ${tons(forecast.pace)}/kun · prognoz: ${tons(forecast.projected)} (${forecast.pct}%)${forecast.plan > forecast.projected ? ` · rejaga yetish uchun kuniga ${tons(forecast.need)} kerak` : ''}`}
              >
                {forecast.plan === 0 ? empty('Joriy oy uchun tasdiqlangan buyurtma yo‘q') : (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={forecast.rows} margin={{ top: 22, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={grid} vertical={false} />
                      <XAxis dataKey="label" stroke={axis} fontSize={12} tickLine={false} axisLine={false} interval={2} />
                      <YAxis label={yUnit('tonna')} stroke={axis} fontSize={12} tickLine={false} axisLine={false} tickFormatter={shortNum} width={60} domain={[0, (dataMax: number) => Math.max(dataMax, forecast.plan) * 1.05]} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => tons(v)} labelFormatter={l => `${l}-${MONTH_NAMES_UZ[cm - 1].toLowerCase()}`} />
                      <Legend wrapperStyle={{ fontSize: 13 }} />
                      <ReferenceLine y={forecast.plan} stroke="#64748b" strokeDasharray="6 4" label={{ value: 'Reja', position: 'insideTopLeft', fill: axis, fontSize: 12 }} />
                      <Line type="linear" dataKey="haqiqiy" name="Bajarildi (yig‘ma)" stroke="#3b82f6" strokeWidth={2.6} dot={false} connectNulls={false} />
                      <Line type="linear" dataKey="prognoz" name="Prognoz" stroke={forecast.pct >= 100 ? '#10b981' : '#f59e0b'} strokeWidth={2.2} strokeDasharray="6 4" dot={false} connectNulls={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            ) : null}

            {show('plan') ? (
              <>
                {sectionTitle('plan')}
                <div className="stat-grid stat-grid--2-1">
                  {monthlyChart}
                  {pieCard('Mahsulotlar ulushi', byProduct, 'Yuklangan tonna bo‘yicha · bo‘lak bosilsa — buyurtmalar', name => drillOrders(`${name} — buyurtmalar`, l => prodLabel(l.order.productType) === name))}
                </div>
                <div className="stat-grid stat-grid--1-1">
                  {topRemainingChart}
                  <ChartCard title="Kontragentlar bo‘yicha bajarilish" hint="Eng past foizdan boshlab (top 12)">
                    {contractorPct.length === 0 ? empty() : (
                      <ResponsiveContainer width="100%" height={Math.max(160, contractorPct.length * 30 + 30)}>
                        <BarChart data={contractorPct} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                          <CartesianGrid stroke={grid} horizontal={false} />
                          <XAxis type="number" stroke={axis} fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                          <YAxis type="category" dataKey="name" stroke={axis} fontSize={12} tickLine={false} axisLine={false} width={190} />
                          <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v: number) => `${v}%`} />
                          <Bar dataKey="foiz" name="Bajarilish" radius={[0, 6, 6, 0]} maxBarSize={20} cursor="pointer" onClick={d => { const r = payloadOf(d); drillOrders(`${r.name} — buyurtmalar`, l => shortContractor(l.contractor) === r.name); }}>
                            {contractorPct.map((c, i) => <Cell key={i} fill={c.foiz >= 100 ? '#10b981' : c.foiz >= 75 ? '#3b82f6' : c.foiz >= 40 ? '#f59e0b' : '#ef4444'} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                </div>
                <ChartCard title="Stansiyalar bo‘yicha jo‘natish" hint="Yuk xatlari bo‘yicha chiqib ketgan yuk (top 12) · ustun bosilsa — vagonlar">
                  <div className="stat-toggles">
                    <div className="stat-seg" role="group" aria-label="O‘lchov">
                      {([['tonna', 'Tonna'], ['vagon', 'Vagon']] as const).map(([id, l]) => (
                        <button key={id} type="button" className={stationMetric === id ? 'is-active' : ''} onClick={() => setStationMetric(id)}>{l}</button>
                      ))}
                    </div>
                  </div>
                  {byStation.length === 0 ? empty() : (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={byStation} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke={grid} vertical={false} />
                        <XAxis dataKey="name" stroke={axis} fontSize={11.5} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={60} />
                        <YAxis label={yUnit(stationMetric === 'tonna' ? 'tonna' : 'vagon')} stroke={axis} fontSize={12} tickLine={false} axisLine={false} tickFormatter={shortNum} width={60} />
                        <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v: number) => (stationMetric === 'tonna' ? tons(v) : `${v} vagon`)} />
                        <Bar dataKey={stationMetric} name={stationMetric === 'tonna' ? 'Tonna' : 'Vagon'} fill="#06b6d4" radius={[6, 6, 0, 0]} maxBarSize={44} cursor="pointer" onClick={d => { const r = payloadOf(d); drillExits(`${r.name} — chiqqan vagonlar`, e => (e.station || 'Ko‘rsatilmagan') === r.name); }} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
              </>
            ) : null}

            {show('intake') ? (
              <>
                {sectionTitle('intake')}
                <p className="stat-note">
                  {intake.parties} ta partiya · {intake.wagons} vagon · kelishdan tara tortishgacha odatiy vaqt (mediana): <b>{intake.median} soat</b>
                </p>
                <div className="stat-grid stat-grid--1-1">
                  <ChartCard title="Kiritish bosqichlari vaqti" hint="Mediana, soat · har bir bosqich oldingisidan keyin">
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={intake.steps} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke={grid} vertical={false} />
                        <XAxis dataKey="name" stroke={axis} fontSize={11.5} tickLine={false} axisLine={false} interval={0} />
                        <YAxis label={yUnit('soat')} stroke={axis} fontSize={12} tickLine={false} axisLine={false} width={60} />
                        <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v: number, _n: string, it: { payload?: { soni?: number } }) => [`${v} soat (${it?.payload?.soni ?? 0} partiya)`, 'Mediana']} />
                        <Bar dataKey="soat" name="Mediana" fill="#f59e0b" radius={[6, 6, 0, 0]} maxBarSize={56} cursor="pointer"
                          onClick={() => openIntakeDrill()} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                  <ChartCard title="Kunlar bo‘yicha kirgan vagonlar" hint="Majmua va tashqi (O‘TY) vagonlari">
                    {intake.daily.length === 0 ? empty() : (
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={intake.daily} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid stroke={grid} vertical={false} />
                          <XAxis dataKey="label" stroke={axis} fontSize={11.5} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={14} />
                          <YAxis label={yUnit('vagon')} stroke={axis} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} width={60} />
                          <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v: number) => `${v} vagon`} />
                          <Legend wrapperStyle={{ fontSize: 13 }} />
                          <Bar dataKey="majmua" name="Majmua" stackId="i" fill="#3b82f6" />
                          <Bar dataKey="tashqi" name="Tashqi (O‘TY)" stackId="i" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                </div>
              </>
            ) : null}

            {show('loading') ? (
              <>
                {sectionTitle('loading')}
                {dailyChart}
                <div className="stat-grid stat-grid--1-1">
                  <ChartCard title="Hafta kunlari bo‘yicha jo‘natish" hint="Bir kunda o‘rtacha chiqqan vagonlar">
                    <ResponsiveContainer width="100%" height={270}>
                      <BarChart data={weekday} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke={grid} vertical={false} />
                        <XAxis dataKey="label" stroke={axis} fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis label={yUnit('vagon')} stroke={axis} fontSize={12} tickLine={false} axisLine={false} width={60} />
                        <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v: number) => `${v} vagon`} />
                        <Bar dataKey="ortacha" name="O‘rtacha" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={44} cursor="pointer" onClick={d => { const r = payloadOf(d); const wd = WEEKDAYS.indexOf(r.label); drillExits(`${r.label} kunlari — chiqqan vagonlar`, e => (new Date(`${e.day}T00:00:00`).getDay() + 6) % 7 === wd); }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                  {pieCard('Jo‘natilgan mahsulotlar', exitByProduct, 'Yuk xatlari bo‘yicha chiqqan tonna · bo‘lak bosilsa — vagonlar', name => drillExits(`${name} — chiqqan vagonlar`, e => prodLabel(e.product) === name))}
                </div>
              <div className="stat-grid stat-grid--1-1">
                <ChartCard title="Soatlar bo‘yicha yuklanish" hint="Kunning qaysi soatlarida eng ko‘p ish bo‘ladi (vagon soni)">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={hourly} margin={{ top: 22, right: 8, left: 0, bottom: 0 }} barGap={1}>
                      <CartesianGrid stroke={grid} vertical={false} />
                      <XAxis dataKey="label" stroke={axis} fontSize={11} tickLine={false} axisLine={false} interval={2} />
                      <YAxis label={yUnit('vagon')} stroke={axis} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} width={60} />
                      <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v: number) => `${v} vagon`} />
                      <Legend wrapperStyle={{ fontSize: 13 }} />
                      <Bar dataKey="kirdi" name="Kirdi" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="yuklandi" name="Yuklandi" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="chiqdi" name="Chiqdi" fill="#10b981" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
                <ChartCard title="Jo‘natish xaritasi: hafta kuni × soat" hint="Rang qanchalik to‘q — shu vaqtda shuncha ko‘p vagon chiqqan">
                  <div className="stat-heat" role="img" aria-label="Hafta kuni va soat bo‘yicha jo‘natish">
                    <span />
                    {Array.from({ length: 24 }, (_, h) => <span key={h} className="stat-heat__h">{h % 3 === 0 ? String(h).padStart(2, '0') : ''}</span>)}
                    {heat.grid.map((row, wd) => (
                      <div key={wd} className="stat-heat__row">
                        <span className="stat-heat__d">{WEEKDAYS[wd]}</span>
                        {row.map((v, h) => (
                          <span
                            key={h}
                            className="stat-heat__c"
                            title={`${WEEKDAYS[wd]}, ${String(h).padStart(2, '0')}:00 — ${v} vagon`}
                            style={{ background: v ? `rgb(16 185 129 / ${0.12 + 0.88 * (v / heat.max)})` : undefined }}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </ChartCard>
              </div>
              </>
            ) : null}

            {show('idle') ? (
              <>
                {sectionTitle('idle')}
                <div className="stat-grid stat-grid--1-1">
                  {stageChartCard}
                  <ChartCard title="Zavodda turish vaqti (kunlar bo‘yicha)" hint={`Odatiy (mediana) ${r1(cur.stayMedian)} soat · me’yordan oshgan: ${cur.stayOver} / ${cur.stays.length} vagon`}>
                    {stayTrend.length === 0 ? empty() : (
                      <ResponsiveContainer width="100%" height={290}>
                        <LineChart data={stayTrend} margin={{ top: 22, right: 12, left: 0, bottom: 0 }} style={{ cursor: 'pointer' }} onClick={st => { const r = linePayload(st); if (r) drillStays(`${r.label} — chiqqan vagonlar`, x => localDateKey(x.exitedAt!) === r.day); }}>
                          <CartesianGrid stroke={grid} vertical={false} />
                          <XAxis dataKey="label" stroke={axis} fontSize={12} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
                          <YAxis label={yUnit('soat')} stroke={axis} fontSize={12} tickLine={false} axisLine={false} width={60} />
                          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v} soat`} />
                          <ReferenceLine y={NORM_HOURS} stroke="#ef4444" strokeDasharray="5 4" label={{ value: 'Me’yor 8.9 soat', position: 'insideTopRight', fill: '#ef4444', fontSize: 12 }} />
                          <Line type="linear" dataKey="soat" name="Mediana" stroke="#8b5cf6" strokeWidth={2.2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                </div>
                <div className="stat-grid stat-grid--1-1">
                  <ChartCard title="Vagon egaligi bo‘yicha" hint="Mediana turish vaqti, soat · qizil chiziq — me’yor">
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={ownershipStay} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke={grid} vertical={false} />
                        <XAxis dataKey="name" stroke={axis} fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis label={yUnit('soat')} stroke={axis} fontSize={12} tickLine={false} axisLine={false} width={60} />
                        <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v: number) => `${v} soat`} />
                        <ReferenceLine y={NORM_HOURS} stroke="#ef4444" strokeDasharray="5 4" />
                        <Bar dataKey="soat" name="Mediana" fill="#8b5cf6" radius={[6, 6, 0, 0]} maxBarSize={64} cursor="pointer" onClick={d => { const r = payloadOf(d); drillStays(`${r.name} — eng uzoq turganlar`, x => (r.name.startsWith('Majmua') ? x.ownership === 'majmua' : x.ownership === 'tashqi')); }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                  <ChartCard title="Kechikish qaysi xizmatda" hint="Me’yordan oshgan vaqt yig‘indisi, soat">
                    {culprits.length === 0 ? empty('Kechikish aniqlanmagan') : (
                      <ResponsiveContainer width="100%" height={Math.max(220, culprits.length * 32 + 30)}>
                        <BarChart data={culprits} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                          <CartesianGrid stroke={grid} horizontal={false} />
                          <XAxis type="number" stroke={axis} fontSize={12} tickLine={false} axisLine={false} tickFormatter={v => `${shortNum(v)}`} />
                          <YAxis type="category" dataKey="name" stroke={axis} fontSize={12} tickLine={false} axisLine={false} width={190} />
                          <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v: number) => `${v} soat`} />
                          <Bar dataKey="soat" name="Soat" fill="#ef4444" radius={[0, 6, 6, 0]} maxBarSize={20} cursor="pointer" onClick={d => { const r = payloadOf(d); drillStays(`${r.name} — kechikkan vagonlar`, x => (x.delayCulprit?.role || 'Boshqa') === r.name); }} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                </div>
              </>
            ) : null}

            {show('quality') ? (
              <>
                {sectionTitle('quality')}
                <ChartCard
                  title="Mahsulotlar bo‘yicha yuklash natijasi"
                  hint={`Tortilgan: ${cur.weights.length} vagon · ortiqcha yuklash: ${cur.weights.filter(w => w.status === 'overload').length} · kam yuklash: ${cur.weights.filter(w => w.status === 'underload').length} · ≈ vagon sig‘imi mahsulot turi bo‘yicha taxminiy`}
                >
                  {weightRows.length === 0 ? empty() : (
                    <ResponsiveContainer width="100%" height={Math.max(200, weightRows.length * 46 + 50)}>
                      <BarChart data={weightRows} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                        <CartesianGrid stroke={grid} horizontal={false} />
                        <XAxis type="number" stroke={axis} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" stroke={axis} fontSize={12} tickLine={false} axisLine={false} width={200} />
                        <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v: number, n: string) => [`${v} vagon`, n]} />
                        <Legend wrapperStyle={{ fontSize: 13 }} />
                        <Bar dataKey="kam" name="Kam yuklash" stackId="w" cursor="pointer" onClick={d => { const r = payloadOf(d); drillWeights(`${r.name} — kam yuklash`, w => prodLabel(w.productType || 'Boshqa') === r.name && w.status === 'underload'); }} fill="#f59e0b" maxBarSize={26} />
                        <Bar dataKey="meyorda" name="Me’yorda" stackId="w" cursor="pointer" onClick={d => { const r = payloadOf(d); drillWeights(`${r.name} — me’yorda`, w => prodLabel(w.productType || 'Boshqa') === r.name && w.status === 'normal'); }} fill="#10b981" maxBarSize={26} />
                        <Bar dataKey="ortiqcha" name="Ortiqcha yuklash" stackId="w" cursor="pointer" onClick={d => { const r = payloadOf(d); drillWeights(`${r.name} — ortiqcha yuklash`, w => prodLabel(w.productType || 'Boshqa') === r.name && w.status === 'overload'); }} fill="#ef4444" radius={[0, 6, 6, 0]} maxBarSize={26} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
                <div className="stat-grid stat-grid--1-1">
                  <ChartCard title="O‘rtacha netto" hint="Bir vagonga to‘g‘ri kelgan o‘rtacha yuk, tonna">
                    {weightRows.length === 0 ? empty() : (
                      <ResponsiveContainer width="100%" height={270}>
                        <BarChart data={weightRows} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid stroke={grid} vertical={false} />
                          <XAxis dataKey="name" stroke={axis} fontSize={11.5} tickLine={false} axisLine={false} interval={0} />
                          <YAxis label={yUnit('tonna')} stroke={axis} fontSize={12} tickLine={false} axisLine={false} width={60} />
                          <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v: number) => `${v} t`} />
                          <Bar dataKey="ortacha" name="O‘rtacha netto" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={56} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                  <ChartCard title="Ortiqcha va kam yuklash ulushi (oylar)" hint="Tortilgan vagonlarga nisbatan, %">
                    {weightTrend.length === 0 ? empty() : (
                      <ResponsiveContainer width="100%" height={270}>
                        <LineChart data={weightTrend} margin={{ top: 22, right: 12, left: 0, bottom: 0 }}>
                          <CartesianGrid stroke={grid} vertical={false} />
                          <XAxis dataKey="label" stroke={axis} fontSize={12} tickLine={false} axisLine={false} />
                          <YAxis label={yUnit('%')} stroke={axis} fontSize={12} tickLine={false} axisLine={false} width={60} tickFormatter={v => `${v}%`} />
                          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
                          <Legend wrapperStyle={{ fontSize: 13 }} />
                          <Line type="linear" dataKey="ortiqcha" name="Ortiqcha yuklash" stroke="#ef4444" strokeWidth={2.2} />
                          <Line type="linear" dataKey="kam" name="Kam yuklash" stroke="#f59e0b" strokeWidth={2.2} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                </div>
              </>
            ) : null}

            {show('returned') ? (
              <>
                {sectionTitle('returned')}
                <p className="stat-note">
                  Qaytarilgan: <b>{returned.items.length}</b> vagon · kirgan vagonlarning <b>{returned.pct}%</b> · bo‘lak yoki ustun bosilsa — vagonlar ro‘yxati
                </p>
                <div className="stat-grid stat-grid--3">
                  <ChartCard title="Qaytarish sababi">
                    {returned.byReason.length === 0 ? empty('Qaytarilgan vagon yo‘q') : (
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie data={returned.byReason} dataKey="soni" nameKey="name" innerRadius={50} outerRadius={84} paddingAngle={2} stroke="none" cursor="pointer"
                            onClick={d => { const n = payloadOf(d).name; openReturnedDrill(`${n} — qaytarilgan vagonlar`, x => x.reason === n); }}>
                            {returned.byReason.map((_, i) => <Cell key={i} fill={['#ef4444', '#f59e0b', '#8b5cf6', '#06b6d4'][i % 4]} />)}
                          </Pie>
                          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v} vagon`} />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                  <ChartCard title="Mahsulot bo‘yicha">
                    {returned.byProduct.length === 0 ? empty('Qaytarilgan vagon yo‘q') : (
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={returned.byProduct} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                          <CartesianGrid stroke={grid} horizontal={false} />
                          <XAxis type="number" stroke={axis} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                          <YAxis type="category" dataKey="name" stroke={axis} fontSize={12} tickLine={false} axisLine={false} width={150} />
                          <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v: number) => `${v} vagon`} />
                          <Bar dataKey="soni" name="Vagon" fill="#ef4444" radius={[0, 6, 6, 0]} maxBarSize={22} cursor="pointer"
                            onClick={d => { const n = payloadOf(d).name; openReturnedDrill(`${n} — qaytarilgan vagonlar`, x => prodLabel(x.a.productType) === n); }} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                  <ChartCard title="Oylar bo‘yicha">
                    {returned.byMonth.length === 0 ? empty('Qaytarilgan vagon yo‘q') : (
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={returned.byMonth} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid stroke={grid} vertical={false} />
                          <XAxis dataKey="label" stroke={axis} fontSize={12} tickLine={false} axisLine={false} />
                          <YAxis label={yUnit('vagon')} stroke={axis} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} width={60} />
                          <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v: number) => `${v} vagon`} />
                          <Bar dataKey="soni" name="Vagon" fill="#f97316" radius={[6, 6, 0, 0]} maxBarSize={44} cursor="pointer"
                            onClick={d => { const r = payloadOf(d); openReturnedDrill(`${r.label} — qaytarilgan vagonlar`, x => x.day.slice(0, 7) === r.k); }} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                </div>
              </>
            ) : null}

            {show('defects') ? (
              <>
                {sectionTitle('defects')}
                <p className="stat-note">
                  Jami {cur.defectItems.length} ta dalolatnoma · qaytarilgan: {defectCharts.returned} · nosozlik sababli kechikish: {defectCharts.delay} soat
                </p>
                <div className="stat-grid stat-grid--3">
                  <ChartCard title="Stansiyalar bo‘yicha" hint="Nosoz vagon yuborgan stansiya">
                    {defectCharts.byStation.length === 0 ? empty('Dalolatnoma yo‘q') : (
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={defectCharts.byStation} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                          <CartesianGrid stroke={grid} horizontal={false} />
                          <XAxis type="number" stroke={axis} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                          <YAxis type="category" dataKey="name" stroke={axis} fontSize={12} tickLine={false} axisLine={false} width={110} />
                          <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v: number) => `${v} ta`} />
                          <Bar dataKey="soni" name="Dalolatnoma" fill="#ef4444" radius={[0, 6, 6, 0]} maxBarSize={22} cursor="pointer" onClick={d => { const r = payloadOf(d); drillDefects(`${r.name} — dalolatnomalar`, x => (x.station || 'Noma’lum') === r.name); }} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                  <ChartCard title="Nosozlik turlari">
                    {defectCharts.byType.length === 0 ? empty('Dalolatnoma yo‘q') : (
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie data={defectCharts.byType} dataKey="soni" nameKey="name" innerRadius={50} outerRadius={84} paddingAngle={2} stroke="none" cursor="pointer" onClick={d => { const n = payloadOf(d).name; drillDefects(`${n} — dalolatnomalar`, x => ((DEFECT_ACT_TYPE_LABEL as Record<string, string>)[x.actType] || x.actType || 'Boshqa') === n); }}>
                            {defectCharts.byType.map((_, i) => <Cell key={i} fill={['#ef4444', '#f59e0b', '#8b5cf6', '#06b6d4'][i % 4]} />)}
                          </Pie>
                          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v} ta`} />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                  <ChartCard title="Oylar bo‘yicha">
                    {defectCharts.byMonth.length === 0 ? empty('Dalolatnoma yo‘q') : (
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={defectCharts.byMonth} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid stroke={grid} vertical={false} />
                          <XAxis dataKey="label" stroke={axis} fontSize={12} tickLine={false} axisLine={false} />
                          <YAxis label={yUnit('dalolatnoma')} stroke={axis} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} width={60} />
                          <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v: number) => `${v} ta`} />
                          <Bar dataKey="soni" name="Dalolatnoma" fill="#f97316" radius={[6, 6, 0, 0]} maxBarSize={44} cursor="pointer" onClick={d => { const r = payloadOf(d); drillDefects(`${r.label} — dalolatnomalar`, x => localDateKey(x.arrivalDate).slice(0, 7) === r.k); }} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                </div>
              </>
            ) : null}
            {show('deadlines') ? (
              <>
                {sectionTitle('deadlines')}
                <p className="stat-note">
                  Muddatida bajarilish: <b>{deadlines.ontimePct}%</b> (bajarilgan qatorlar ichida) · muddati o‘tgan: <b>{deadlines.overdue.length}</b> · 5 kun ichida muddati tugaydigan: <b>{deadlines.soon.length}</b> qator
                </p>
                <div className="stat-grid stat-grid--1-1">
                  <ChartCard title="Buyurtma qatorlari holati" hint="«Yuklash oxirgi sanasi»ga nisbatan · bo‘lak bosilsa — qatorlar">
                    {deadlines.counts.length === 0 ? empty() : (
                      <ResponsiveContainer width="100%" height={290}>
                        <PieChart>
                          <Pie data={deadlines.counts} dataKey="soni" nameKey="name" innerRadius={62} outerRadius={100} paddingAngle={2} stroke="none" cursor="pointer"
                            onClick={d => { const r = payloadOf(d); openDeadlineDrill(r.name, x => deadlines.label[x.status] === r.name); }}>
                            {deadlines.counts.map(c => <Cell key={c.id} fill={c.color} />)}
                          </Pie>
                          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v} qator`} />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                  <ChartCard title="Oylar bo‘yicha muddatga rioya" hint="Muddati shu oyga to‘g‘ri kelgan qatorlar">
                    {deadlines.byMonth.length === 0 ? empty('Muddat belgilangan qator yo‘q') : (
                      <ResponsiveContainer width="100%" height={290}>
                        <BarChart data={deadlines.byMonth} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid stroke={grid} vertical={false} />
                          <XAxis dataKey="label" stroke={axis} fontSize={12} tickLine={false} axisLine={false} />
                          <YAxis label={yUnit('qator')} stroke={axis} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} width={60} />
                          <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v: number) => `${v} qator`} />
                          <Legend wrapperStyle={{ fontSize: 13 }} />
                          <Bar dataKey="muddatida" name="Muddatida" stackId="d" fill="#10b981" maxBarSize={56} />
                          <Bar dataKey="kechikib" name="Kechikib" stackId="d" fill="#f59e0b" maxBarSize={56} />
                          <Bar dataKey="otgan" name="Muddati o‘tgan" stackId="d" fill="#ef4444" radius={[6, 6, 0, 0]} maxBarSize={56} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                </div>
                <ChartCard title="Muddati o‘tgan va yaqinlashgan qatorlar" hint="Qizil — kechikkan kunlar, ko‘k — muddatgacha qolgan kunlar · ustun bosilsa — tafsilot">
                  {deadlines.overdue.length + deadlines.soon.length === 0 ? empty('Muddati o‘tgan yoki yaqin qator yo‘q') : (
                    <ResponsiveContainer width="100%" height={Math.max(180, (deadlines.overdue.length + deadlines.soon.length) * 30 + 40)}>
                      <BarChart
                        data={[...deadlines.overdue.slice(0, 12).map(r => ({ name: `${r.order.orderNumber} · ${shortContractor(r.contractor)}`, kun: r.days, kind: 'overdue' })), ...deadlines.soon.slice(0, 8).map(r => ({ name: `${r.order.orderNumber} · ${shortContractor(r.contractor)}`, kun: r.days, kind: 'soon' }))]}
                        layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
                      >
                        <CartesianGrid stroke={grid} horizontal={false} />
                        <XAxis type="number" stroke={axis} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" stroke={axis} fontSize={12} tickLine={false} axisLine={false} width={260} />
                        <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v: number, _n: string, it: { payload?: { kind?: string } }) => [`${v} kun`, it?.payload?.kind === 'overdue' ? 'Kechikdi' : 'Qoldi']} />
                        <Bar dataKey="kun" name="Kun" radius={[0, 6, 6, 0]} maxBarSize={18} cursor="pointer"
                          onClick={d => { const r = payloadOf(d); openDeadlineDrill(r.kind === 'overdue' ? 'Muddati o‘tgan qatorlar' : 'Muddati yaqinlashgan qatorlar', x => (r.kind === 'overdue' ? x.status === 'overdue' : x.status === 'open' && x.days <= 5)); }}>
                          {[...deadlines.overdue.slice(0, 12), ...deadlines.soon.slice(0, 8)].map((r, i) => <Cell key={i} fill={r.status === 'overdue' ? '#ef4444' : '#3b82f6'} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
              </>
            ) : null}

            {show('fleet') ? (
              <>
                {sectionTitle('fleet')}
                <div className="order-status-cards order-status-cards--four plan-kpis">
                  <div className="order-status-card order-status-card--blue">
                    <span className="order-status-card__icon"><TrainFront strokeWidth={1.9} aria-hidden /></span>
                    <span className="order-status-card__text"><strong>Majmua parki</strong><small>davrda harakatda: {fleet.active} vagon · {fleet.tripsTotal} reys</small></span>
                    <span className="order-status-card__count">{fleet2.catalogCount || fleet.total} vagon</span>
                  </div>
                  <div className="order-status-card order-status-card--violet">
                    <span className="order-status-card__icon"><Activity strokeWidth={1.9} aria-hidden /></span>
                    <span className="order-status-card__text"><strong>Bir aylanish</strong><small>kelishdan keyingi kelishgacha (mediana)</small></span>
                    <span className="order-status-card__count">{fleet.cycle} kun</span>
                  </div>
                  <div className="order-status-card order-status-card--amber">
                    <span className="order-status-card__icon"><Truck strokeWidth={1.9} aria-hidden /></span>
                    <span className="order-status-card__text"><strong>Zavoddan tashqarida</strong><small>chiqib, qaytib kelgunicha (mediana)</small></span>
                    <span className="order-status-card__count">{fleet.away} kun</span>
                  </div>
                  <button type="button" className="order-status-card order-status-card--red-soft" onClick={() => openFleetDrill('15 kundan ortiq kelmagan vagonlar', r => r.idleDays >= 15)}>
                    <span className="order-status-card__icon"><Hourglass strokeWidth={1.9} aria-hidden /></span>
                    <span className="order-status-card__text"><strong>15+ kun kelmagan</strong><small>bosilsa — ro‘yxat</small></span>
                    <span className="order-status-card__count">{fleet.idle.length} vagon</span>
                  </button>
                </div>
                <h3 className="stat-mini-title">Park holati</h3>
                {fleet2.catalogCount === 0 ? (
                  <p className="stat-note">Vagonlar ma’lumotnomasi bo‘sh yoki ochib bo‘lmadi — texnik holat va ta’mir ko‘rsatkichlari ma’lumotnoma to‘ldirilgach chiqadi.</p>
                ) : null}
                <div className="stat-grid stat-grid--3">
                  <ChartCard title="Texnik holati" hint={`Ma’lumotnomada ${fleet2.catalogCount} ta majmua vagoni · bo‘lak bosilsa — ro‘yxat`}>
                    {fleet2.cond.length === 0 ? empty('Ma’lumotnoma bo‘sh') : (
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie data={fleet2.cond} dataKey="soni" nameKey="name" innerRadius={50} outerRadius={84} paddingAngle={2} stroke="none" cursor="pointer"
                            onClick={d => { const r = payloadOf(d); openFleetCatalogDrill(`${r.name} vagonlar`, w => { const k = (w.serviceability || '').toLowerCase(); const dd = w.daysUntilNextDepotRepair; const c = k === 'yaroqli' || k === 'eslatma' || k === 'yaroqsiz' ? k : typeof dd === 'number' && dd < 0 ? 'yaroqsiz' : typeof dd === 'number' && dd <= 30 ? 'eslatma' : 'yaroqli'; return c === r.id; }); }}>
                            {fleet2.cond.map(c => <Cell key={c.id} fill={c.color} />)}
                          </Pie>
                          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v} vagon`} />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                  <ChartCard title="Depo ta’miri muddati" hint={`Keyingi ta’mirgacha qolgan kun${fleet2.repairUnknown ? ` · ${fleet2.repairUnknown} ta vagonda sana kiritilmagan` : ''}`}>
                    {fleet2.repair.every(r => r.soni === 0) ? empty('Ta’mir sanalari kiritilmagan') : (
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={fleet2.repair} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid stroke={grid} vertical={false} />
                          <XAxis dataKey="name" stroke={axis} fontSize={11.5} tickLine={false} axisLine={false} interval={0} />
                          <YAxis label={yUnit('vagon')} stroke={axis} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} width={60} />
                          <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v: number) => `${v} vagon`} />
                          <Bar dataKey="soni" name="Vagon" radius={[6, 6, 0, 0]} maxBarSize={48} cursor="pointer"
                            onClick={d => { const r = payloadOf(d); const test: Record<string, (x: number) => boolean> = { over: x => x < 0, d30: x => x >= 0 && x <= 30, d60: x => x > 30 && x <= 60, ok: x => x > 60 }; openFleetCatalogDrill(`Depo ta’miri: ${r.name}`, w => typeof w.daysUntilNextDepotRepair === 'number' && test[r.id](w.daysUntilNextDepotRepair)); }}>
                            {fleet2.repair.map(r => <Cell key={r.id} fill={r.color} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                  <ChartCard title="Hozir qayerda" hint="Oxirgi harakat bo‘yicha · bo‘lak bosilsa — ro‘yxat">
                    {fleet2.where.length === 0 ? empty() : (
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie data={fleet2.where} dataKey="soni" nameKey="name" innerRadius={50} outerRadius={84} paddingAngle={2} stroke="none" cursor="pointer"
                            onClick={d => { const r = payloadOf(d); openWhereDrill(`${r.name} — vagonlar`, x => (r.id === 'zavod' ? x.place === 'Zavod hududida' : r.id === 'yolda' ? x.place !== 'Zavod hududida' && x.place !== 'Ma’lumot yo‘q' : x.place === 'Ma’lumot yo‘q')); }}>
                            {fleet2.where.map(c => <Cell key={c.id} fill={c.color} />)}
                          </Pie>
                          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v} vagon`} />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                </div>

                <h3 className="stat-mini-title">Aylanish va yo‘nalishlar</h3>
                <div className="stat-grid stat-grid--1-1">
                  <ChartCard title="Stansiyalar bo‘yicha qaytish vaqti" hint="Zavoddan chiqib, qaytib kelgunicha (mediana, kun) · hozir yo‘ldagilar tooltipda">
                    {fleet2.stations.length === 0 ? empty() : (
                      <ResponsiveContainer width="100%" height={Math.max(220, fleet2.stations.length * 30 + 40)}>
                        <BarChart data={fleet2.stations} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                          <CartesianGrid stroke={grid} horizontal={false} />
                          <XAxis type="number" stroke={axis} fontSize={12} tickLine={false} axisLine={false} />
                          <YAxis type="category" dataKey="name" stroke={axis} fontSize={12} tickLine={false} axisLine={false} width={130} />
                          <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v: number, _n: string, it: { payload?: { reys?: number; yolda?: number } }) => [`${v} kun · ${it?.payload?.reys ?? 0} reys · hozir yo‘lda: ${it?.payload?.yolda ?? 0}`, 'Qaytish']} />
                          <Bar dataKey="kun" name="Kun" fill="#f59e0b" radius={[0, 6, 6, 0]} maxBarSize={20} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                  <ChartCard title="Aylanish vaqti taqsimoti" hint="Bir kelishdan keyingi kelishgacha o‘tgan kunlar (reyslar soni)">
                    <ResponsiveContainer width="100%" height={270}>
                      <BarChart data={fleet.hist} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke={grid} vertical={false} />
                        <XAxis dataKey="name" stroke={axis} fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis label={yUnit('reys')} stroke={axis} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} width={60} />
                        <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v: number) => `${v} reys`} />
                        <Bar dataKey="soni" name="Reys" fill="#06b6d4" radius={[6, 6, 0, 0]} maxBarSize={56} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>
                <ChartCard title="Aylanish dinamikasi" hint="Oylar bo‘yicha bir aylanishning odatiy davomiyligi (mediana, kun) — pasaysa, park tezroq ishlayapti">
                  {fleet.cycleTrend.length === 0 ? empty() : (
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={fleet.cycleTrend} margin={{ top: 22, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke={grid} vertical={false} />
                        <XAxis dataKey="label" stroke={axis} fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis label={yUnit('kun')} stroke={axis} fontSize={12} tickLine={false} axisLine={false} width={60} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v: number, _n: string, it: { payload?: { reys?: number } }) => [`${v} kun (${it?.payload?.reys ?? 0} reys)`, 'Aylanish']} />
                        <Line type="linear" dataKey="kun" name="Aylanish" stroke="#8b5cf6" strokeWidth={2.4} dot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
              </>
            ) : null}

            {show('staff') ? (
              <>
                {sectionTitle('staff')}
                <ChartCard title="Kelishuv va tasdiqlash vaqti" hint="Hujjat yaratilgandan tasdiqlangungacha, mediana (daqiqa) · davrda tasdiqlanganlar bo‘yicha">
                  {approvals.length === 0 ? empty() : (
                    <ResponsiveContainer width="100%" height={Math.max(220, approvals.length * 34 + 30)}>
                      <BarChart data={approvals} layout="vertical" margin={{ top: 4, right: 32, left: 8, bottom: 4 }}>
                        <CartesianGrid stroke={grid} horizontal={false} />
                        <XAxis type="number" stroke={axis} fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis type="category" dataKey="name" stroke={axis} fontSize={12} tickLine={false} axisLine={false} width={210} />
                        <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v: number, _n: string, it: { payload?: { soni?: number } }) => [`${v} daqiqa (${it?.payload?.soni ?? 0} ta hujjat)`, 'Mediana']} />
                        <Bar dataKey="daqiqa" name="Mediana" radius={[0, 6, 6, 0]} maxBarSize={20} minPointSize={2}>
                          {approvals.map((a, i) => <Cell key={i} fill={a.group === 'Buyurtma' ? '#3b82f6' : a.group === 'Kirish ruxsati' ? '#f59e0b' : '#8b5cf6'} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                  <div className="stat-legend">
                    <span><i style={{ background: '#3b82f6' }} /> Buyurtma</span>
                    <span><i style={{ background: '#f59e0b' }} /> Kirish ruxsati</span>
                    <span><i style={{ background: '#8b5cf6' }} /> Yuk xati</span>
                  </div>
                </ChartCard>
                <ChartCard title="Xodimlar faolligi" hint="Davrda bajarilgan amallar soni (top 15): buyurtma kelishuvi, kirish ruxsati, yuklash, yuk xati">
                  {people.length === 0 ? empty() : (
                    <ResponsiveContainer width="100%" height={Math.max(240, people.length * 32 + 50)}>
                      <BarChart data={people} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                        <CartesianGrid stroke={grid} horizontal={false} />
                        <XAxis type="number" stroke={axis} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" stroke={axis} fontSize={12} tickLine={false} axisLine={false} width={210} />
                        <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v: number) => `${v} ta`} />
                        <Legend wrapperStyle={{ fontSize: 13 }} />
                        <Bar dataKey="buyurtma" name="Buyurtma kelishuvi" stackId="p" fill="#3b82f6" maxBarSize={22} />
                        <Bar dataKey="kirish" name="Kirish ruxsati" stackId="p" fill="#f59e0b" maxBarSize={22} />
                        <Bar dataKey="yuklash" name="Yuklash" stackId="p" fill="#10b981" maxBarSize={22} />
                        <Bar dataKey="yukxati" name="Yuk xati" stackId="p" fill="#8b5cf6" radius={[0, 6, 6, 0]} maxBarSize={22} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
              </>
            ) : null}

            {drill ? <StatsDrillTable drill={drill} onClose={() => setDrill(null)} /> : null}
          </>
        )}
      </div>
    </div>
  );
}
