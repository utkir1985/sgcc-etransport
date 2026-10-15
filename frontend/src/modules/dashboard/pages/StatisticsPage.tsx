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
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  GitCompareArrows,
  Hourglass,
  LayoutDashboard,
  Scale,
  Target,
  Truck,
  Wrench,
  X,
} from 'lucide-react';
import { api } from '../../../shared/services/api';
import type { EmptyWagonArrival, LoadingRegistry, MonthlyOrder } from '../../../shared/types';
import { DateRangePicker } from '../../../shared/components/DateRangePicker';
import { getProductLabel } from '../../../shared/constants/productTypes';
import { logisticsFromRoute } from '../../../shared/constants/logisticsTypes';
import { DEFECT_ACT_TYPE_LABEL } from '../../../shared/constants/defectActTypes';
import { MONTH_NAMES_UZ, todayIso } from '../../../shared/utils/dates';
import { formatTons } from '../../../shared/utils/orderQuantity';
import { excludeOneCArrivals } from '../../../shared/utils/oneCSources';
import { exportSheets, todayStamp } from '../../../shared/utils/excelExport';
import { buildDefectsGu23Analysis, buildDemurrageAnalysis, buildWeightAnalysis } from '../utils/demurrageUtils';
import { loadedWagonCountOf, localDateKey, wagonCountOf } from '../utils/sharedPanels';
import { StatsMultiSelect, type StatsOption } from '../components/StatsMultiSelect';

const PRODUCT_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];
const WEEKDAYS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];
const NORM_HOURS = 8.9;

type Tab = 'overview' | 'plan' | 'loading' | 'idle' | 'quality' | 'defects';
type Compare = 'none' | 'prev' | 'yoy';

const TABS: { id: Tab; label: string; icon: typeof Target }[] = [
  { id: 'overview', label: 'Umumiy', icon: LayoutDashboard },
  { id: 'plan', label: 'Reja ijrosi', icon: Target },
  { id: 'loading', label: 'Yuklash va jo‘natish', icon: Activity },
  { id: 'idle', label: 'Bekor turish vaqti', icon: Clock3 },
  { id: 'quality', label: 'Yuklash sifati', icon: Scale },
  { id: 'defects', label: 'Nosozliklar', icon: Wrench },
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
const shortNum = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1)}k` : `${Math.round(v)}`);
const r1 = (v: number) => Math.round(v * 10) / 10;
const monthLabel = (k: string) => `${(MONTH_NAMES_UZ[Number(k.slice(5, 7)) - 1] || '').slice(0, 3)} ${k.slice(2, 4)}`;

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
  const lines: { order: MonthlyOrder; contractor: string; plan: number; done: number; remain: number }[] = [];
  for (const o of orders) {
    if (o.status !== 'Active' && o.status !== 'Completed') continue;
    if (!inMonth(o.year, o.month, range) || !productOk(o.productType) || !transportOk(o.logisticsType)) continue;
    for (const l of o.lines ?? []) {
      const contractor = (l.contractor || 'Ko‘rsatilmagan').trim();
      if (!contractorOk(contractor)) continue;
      if (f.stations.length && !stationOk(l.destinationStation) && !(l.stationShipments ?? []).some(s => stationOk(s.station))) continue;
      const plan = Number(l.tonCount || 0);
      const done = Number(l.fulfilledNetWeight ?? 0);
      lines.push({ order: o, contractor, plan, done, remain: o.status === 'Completed' ? 0 : Math.max(0, plan - done) });
    }
  }

  // Jo‘natish — yuk xatidagi har bir vagon
  const exits: { day: string; tons: number; product: string; station: string }[] = [];
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
          tons: routeTons(w.netWeight ?? w.NetWeight ?? w.nettoWeight),
          product: product || 'Boshqa',
          station: (w.destinationStation || r.destinationStation || '').trim(),
        });
      }
    }
  }

  // Kirish va yuklash — partiyalar (kontragent/stansiya bilan bog‘lanmagan)
  const entries: { day: string; n: number }[] = [];
  const loads: { day: string; n: number }[] = [];
  if (!f.contractors.length && !f.stations.length && (!f.transport || f.transport === 'Railway')) {
    for (const a of excludeOneCArrivals(arrivals)) {
      if (!productOk(a.productType)) continue;
      const stamp = a.arrivalDate || a.createdAt;
      if (stamp) {
        const day = localDateKey(stamp);
        if (inDay(day, range)) entries.push({ day, n: wagonCountOf(a) });
      }
      const perWagon = (a.wagons ?? []).filter(w => w.loadingCompletedAt);
      if (perWagon.length) {
        for (const w of perWagon) {
          const day = localDateKey(w.loadingCompletedAt!);
          if (inDay(day, range)) loads.push({ day, n: 1 });
        }
      } else if (a.loadingCompletedAt) {
        const day = localDateKey(a.loadingCompletedAt);
        if (inDay(day, range)) loads.push({ day, n: loadedWagonCountOf(a) });
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
  const [loading, setLoading] = useState(true);

  // Filtrlar havolada saqlanadi — ko‘rinishni havola orqali boshqa xodimga yuborish mumkin
  const list = (k: string) => (sp.get(k) || '').split('|').filter(Boolean);
  const tab = (TABS.some(t => t.id === sp.get('tab')) ? sp.get('tab') : 'overview') as Tab;
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
  const stationOptions = useMemo<StatsOption[]>(() => {
    const s = new Set<string>();
    for (const o of orders) for (const l of o.lines ?? []) {
      if (l.destinationStation?.trim()) s.add(l.destinationStation.trim());
      for (const sh of l.stationShipments ?? []) if (sh.station?.trim()) s.add(sh.station.trim());
    }
    for (const r of registries) for (const w of r.wagonRoutes ?? []) if (w.destinationStation?.trim()) s.add(w.destinationStation.trim());
    return Array.from(s).sort((a, b) => a.localeCompare(b)).map(v => ({ value: v, label: v }));
  }, [orders, registries]);

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
  const activePreset = presets.find(p => p.from === range.from && p.to === range.to)?.id;

  // ---- Yil + oylar (Shift bilan bosilsa — oraliq) ----
  const selYear = range.from ? Number(range.from.slice(0, 4)) : cy;
  const selMonths = (() => {
    const out = new Set<number>();
    if (!range.from || !range.to || range.from.slice(0, 4) !== range.to.slice(0, 4)) return out;
    const a = Number(range.from.slice(5, 7));
    const b = Number(range.to.slice(5, 7));
    if (range.from !== monthStart(selYear, a)) return out;
    if (range.to !== monthEnd(selYear, b) && range.to !== todayIso()) return out;
    for (let m = a; m <= b; m += 1) out.add(m);
    return out;
  })();
  const monthTo = (y: number, m: number) => (y === cy && m === cm ? todayIso() : monthEnd(y, m));
  const pickMonth = (m: number, extend: boolean) => {
    if (extend && selMonths.size) {
      const a = Math.min(...selMonths, m);
      const b = Math.max(...selMonths, m);
      setParam({ from: monthStart(selYear, a), to: monthTo(selYear, b) });
    } else {
      setParam({ from: monthStart(selYear, m), to: monthTo(selYear, m) });
    }
  };
  const pickYear = (y: number) => setParam({ from: monthStart(y, 1), to: y === cy ? todayIso() : monthEnd(y, 12) });

  // ---- Solishtirma davr ----
  const cmpRange: Range | null = compare === 'none' || !range.from || !range.to
    ? null
    : compare === 'yoy'
      ? { from: shiftYears(range.from, -1), to: shiftYears(range.to, -1) }
      : { from: shiftDays(range.from, -daysBetween(range.from, range.to)), to: shiftDays(range.from, -1) };

  const filterKey = JSON.stringify(filters);
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
    return Array.from(m.values()).map(r => ({ ...r, tonna: r1(r.tonna) })).sort((a, b) => b.tonna - a.tonna).slice(0, 12);
  }, [cur]);

  const daily = useMemo(() => {
    const end = range.to && range.to < todayIso() ? range.to : todayIso();
    let start = range.from || shiftDays(end, -29);
    if (daysBetween(start, end) > 120) start = shiftDays(end, -119);
    const rows = new Map<string, { day: string; label: string; kirdi: number; yuklandi: number; chiqdi: number; oldin?: number }>();
    for (let d = start; d <= end; d = shiftDays(d, 1)) rows.set(d, { day: d, label: `${d.slice(8, 10)}.${d.slice(5, 7)}`, kirdi: 0, yuklandi: 0, chiqdi: 0 });
    cur.entries.forEach(e => { const r = rows.get(e.day); if (r) r.kirdi += e.n; });
    cur.loads.forEach(e => { const r = rows.get(e.day); if (r) r.yuklandi += e.n; });
    cur.exits.forEach(e => { const r = rows.get(e.day); if (r) r.chiqdi += 1; });
    const out = Array.from(rows.values());
    if (prev && cmpRange && range.from) {
      const pmap = new Map<string, number>();
      prev.exits.forEach(e => pmap.set(e.day, (pmap.get(e.day) || 0) + 1));
      const offset = daysBetween(cmpRange.from, range.from) - 1;
      out.forEach(r => { r.oldin = pmap.get(compare === 'yoy' ? shiftYears(r.day, -1) : shiftDays(r.day, -offset)) || 0; });
    }
    return out;
  }, [cur, prev, cmpRange?.from, range.from, range.to, compare]);

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
    return { label: st.label, meyor: r1(st.norm / 60), haqiqiy: r1(median(v)), oldin: prev ? r1(median(pv)) : undefined };
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
    <ChartCard title="Oylar bo‘yicha reja va bajarilish" hint={compare === 'yoy' && prev ? 'Tonna · och ko‘k — o‘tgan yilning shu oyi' : 'Tasdiqlangan buyurtmalar, tonna'}>
      {monthly.length === 0 ? empty() : (
        <ResponsiveContainer width="100%" height={290}>
          <BarChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={6} barCategoryGap="28%">
            <CartesianGrid stroke={grid} vertical={false} />
            <XAxis dataKey="label" stroke={axis} fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke={axis} fontSize={12} tickLine={false} axisLine={false} tickFormatter={shortNum} width={44} />
            <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v: number) => tons(v)} />
            <Legend wrapperStyle={{ fontSize: 13 }} />
            <Bar dataKey="reja" name="Reja" fill={ghost} radius={[6, 6, 0, 0]} maxBarSize={56} />
            <Bar dataKey="bajarildi" name="Bajarildi" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={56} />
            {compare === 'yoy' && prev ? <Bar dataKey="oldin" name="O‘tgan yil" fill="#93c5fd" radius={[6, 6, 0, 0]} maxBarSize={56} /> : null}
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );

  const dailyTotals = daily.reduce((a, d) => ({ k: a.k + d.kirdi, y: a.y + d.yuklandi, c: a.c + d.chiqdi }), { k: 0, y: 0, c: 0 });
  const dailyChart = (
    <ChartCard
      title="Kunlar bo‘yicha vagonlar"
      hint={`Kirdi: ${dailyTotals.k} · Yuklandi: ${dailyTotals.y} · Chiqdi: ${dailyTotals.c} vagon (${daily.length} kun)${filters.contractors.length || filters.stations.length ? ' · kontragent/stansiya filtri faqat chiqishga qo‘llanadi' : ''}`}
    >
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={daily} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="label" stroke={axis} fontSize={12} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
          <YAxis stroke={axis} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v} vagon`} />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          <Line type="monotone" dataKey="kirdi" name="Kirdi" stroke="#f59e0b" strokeWidth={2.2} dot={false} />
          <Line type="monotone" dataKey="yuklandi" name="Yuklandi" stroke="#3b82f6" strokeWidth={2.2} dot={false} />
          <Line type="monotone" dataKey="chiqdi" name="Chiqdi" stroke="#10b981" strokeWidth={2.4} dot={false} />
          {prev ? <Line type="monotone" dataKey="oldin" name="Chiqdi (solishtirma davr)" stroke="#10b981" strokeOpacity={0.45} strokeDasharray="5 4" strokeWidth={2} dot={false} /> : null}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );

  const stageChartCard = (
    <ChartCard title="Bosqichlar bo‘yicha vaqt" hint={`${cur.stays.length} ta chiqqan vagon · mediana, soat · kulrang — reglament me’yori (jami 533 daqiqa)`}>
      {cur.stays.length === 0 ? empty() : (
        <ResponsiveContainer width="100%" height={290}>
          <BarChart data={stageChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4} barCategoryGap="22%">
            <CartesianGrid stroke={grid} vertical={false} />
            <XAxis dataKey="label" stroke={axis} fontSize={11.5} tickLine={false} axisLine={false} interval={0} />
            <YAxis stroke={axis} fontSize={12} tickLine={false} axisLine={false} width={36} />
            <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v: number) => `${v} soat`} />
            <Legend wrapperStyle={{ fontSize: 13 }} />
            <Bar dataKey="meyor" name="Me’yor" fill={ghost} radius={[6, 6, 0, 0]} maxBarSize={40} />
            <Bar dataKey="haqiqiy" name="Haqiqiy" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={40}>
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
            <XAxis type="number" stroke={axis} fontSize={12} tickLine={false} axisLine={false} tickFormatter={shortNum} />
            <YAxis type="category" dataKey="name" stroke={axis} fontSize={12} tickLine={false} axisLine={false} width={190} />
            <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v: number) => tons(v)} />
            <Bar dataKey="qoldiq" name="Qoldiq" fill="#f59e0b" radius={[0, 6, 6, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );

  const pieCard = (title: string, data: { name: string; value: number }[], hint: string) => (
    <ChartCard title={title} hint={hint}>
      {data.length === 0 ? empty() : (
        <ResponsiveContainer width="100%" height={290}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={62} outerRadius={100} paddingAngle={2} stroke="none">
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

  const hasFilters = Boolean(filters.products.length || filters.transport || filters.contractors.length || filters.stations.length || filters.ownership || range.from || range.to || compare !== 'none');
  const needRange = !range.from || !range.to;

  return (
    <div className="space-y-4">
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
            <div className="stats-presets" role="group" aria-label="Davr">
              {presets.map(p => (
                <button key={p.id} type="button" className={`stats-chip${activePreset === p.id ? ' is-active' : ''}`} onClick={() => setParam({ from: p.from, to: p.to })}>
                  {p.label}
                </button>
              ))}
            </div>
            <DateRangePicker from={range.from} to={range.to} onFromChange={v => setParam({ from: v })} onToChange={v => setParam({ to: v })} />
            <div className="stats-filters__spacer" />
            <button type="button" className="btn-secondary inline-flex items-center gap-1.5 whitespace-nowrap" onClick={exportAll} disabled={loading}>
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Excel</span>
            </button>
          </div>

          <div className="stats-filters__row">
            <select className="stats-year" value={selYear} onChange={e => pickYear(Number(e.target.value))} aria-label="Yil">
              {years.map(y => <option key={y} value={y}>{y}-yil</option>)}
            </select>
            <div className="stats-months" role="group" aria-label="Oylar">
              {MONTH_NAMES_UZ.map((name, i) => {
                const m = i + 1;
                return (
                  <button
                    key={name}
                    type="button"
                    disabled={selYear === cy && m > cm}
                    title={`${name} · Shift bilan bosilsa — oraliq tanlanadi`}
                    className={`stats-month${selMonths.has(m) ? ' is-active' : ''}`}
                    onClick={e => pickMonth(m, e.shiftKey)}
                  >
                    {name.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="stats-filters__row">
            <StatsMultiSelect label="Mahsulot" options={productOptions} value={filters.products} onChange={v => setParam({ p: v })} />
            <StatsMultiSelect
              label="Transport"
              single
              options={[{ value: 'Railway', label: 'Temir yo‘l' }, { value: 'Road', label: 'Avtotransport' }]}
              value={filters.transport ? [filters.transport] : []}
              onChange={v => setParam({ t: v[0] || null })}
            />
            <StatsMultiSelect label="Kontragent" options={contractorOptions} value={filters.contractors} onChange={v => setParam({ c: v })} />
            <StatsMultiSelect label="Stansiya" options={stationOptions} value={filters.stations} onChange={v => setParam({ s: v })} />
            <StatsMultiSelect
              label="Vagon"
              single
              options={[{ value: 'majmua', label: 'Majmua vagonlari' }, { value: 'tashqi', label: 'Tashqi (O‘TY)' }]}
              value={filters.ownership ? [filters.ownership] : []}
              onChange={v => setParam({ o: v[0] || null })}
            />
            <div className="stats-compare" role="group" aria-label="Solishtirish">
              <GitCompareArrows className="w-4 h-4" aria-hidden />
              {([['none', 'Solishtirmaslik'], ['prev', 'Oldingi davr'], ['yoy', 'O‘tgan yil']] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  disabled={id !== 'none' && needRange}
                  title={id !== 'none' && needRange ? 'Avval davrni tanlang' : undefined}
                  className={`stats-chip${compare === id ? ' is-active' : ''}`}
                  onClick={() => setParam({ cmp: id === 'none' ? null : id })}
                >
                  {label}
                </button>
              ))}
            </div>
            {hasFilters ? (
              <button type="button" className="stats-reset" onClick={() => setSp(new URLSearchParams(tab === 'overview' ? {} : { tab }), { replace: true })}>
                <X className="w-3.5 h-3.5" /> Tozalash
              </button>
            ) : null}
          </div>
          {prev && cmpRange ? (
            <p className="stats-compare-note">Solishtirma davr: {cmpRange.from} — {cmpRange.to}. Kartochkalardagi ▲▼ shu davrga nisbatan o‘zgarish.</p>
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
            {tab === 'overview' ? (
              <>
                <div className="stat-grid stat-grid--1-1">
                  {monthlyChart}
                  {stageChartCard}
                </div>
                {dailyChart}
                <div className="stat-grid stat-grid--1-1">
                  {topRemainingChart}
                  {pieCard('Mahsulotlar ulushi', byProduct, 'Yuklangan tonna bo‘yicha')}
                </div>
              </>
            ) : null}

            {tab === 'plan' ? (
              <>
                <div className="stat-grid stat-grid--2-1">
                  {monthlyChart}
                  {pieCard('Mahsulotlar ulushi', byProduct, 'Yuklangan tonna bo‘yicha')}
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
                          <Bar dataKey="foiz" name="Bajarilish" radius={[0, 6, 6, 0]} maxBarSize={20}>
                            {contractorPct.map((c, i) => <Cell key={i} fill={c.foiz >= 100 ? '#10b981' : c.foiz >= 75 ? '#3b82f6' : c.foiz >= 40 ? '#f59e0b' : '#ef4444'} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                </div>
                <ChartCard title="Stansiyalar bo‘yicha jo‘natish" hint="Yuk xatlari bo‘yicha chiqib ketgan tonna (top 12)">
                  {byStation.length === 0 ? empty() : (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={byStation} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke={grid} vertical={false} />
                        <XAxis dataKey="name" stroke={axis} fontSize={11.5} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={60} />
                        <YAxis stroke={axis} fontSize={12} tickLine={false} axisLine={false} tickFormatter={shortNum} width={44} />
                        <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v: number) => tons(v)} />
                        <Bar dataKey="tonna" name="Tonna" fill="#06b6d4" radius={[6, 6, 0, 0]} maxBarSize={44} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
              </>
            ) : null}

            {tab === 'loading' ? (
              <>
                {dailyChart}
                <div className="stat-grid stat-grid--1-1">
                  <ChartCard title="Hafta kunlari bo‘yicha jo‘natish" hint="Bir kunda o‘rtacha chiqqan vagonlar">
                    <ResponsiveContainer width="100%" height={270}>
                      <BarChart data={weekday} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke={grid} vertical={false} />
                        <XAxis dataKey="label" stroke={axis} fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke={axis} fontSize={12} tickLine={false} axisLine={false} width={32} />
                        <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v: number) => `${v} vagon`} />
                        <Bar dataKey="ortacha" name="O‘rtacha" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={44} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                  {pieCard('Jo‘natilgan mahsulotlar', exitByProduct, 'Yuk xatlari bo‘yicha chiqqan tonna')}
                </div>
              </>
            ) : null}

            {tab === 'idle' ? (
              <>
                <div className="stat-grid stat-grid--1-1">
                  {stageChartCard}
                  <ChartCard title="Zavodda turish vaqti (kunlar bo‘yicha)" hint={`Odatiy (mediana) ${r1(cur.stayMedian)} soat · me’yordan oshgan: ${cur.stayOver} / ${cur.stays.length} vagon`}>
                    {stayTrend.length === 0 ? empty() : (
                      <ResponsiveContainer width="100%" height={290}>
                        <LineChart data={stayTrend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                          <CartesianGrid stroke={grid} vertical={false} />
                          <XAxis dataKey="label" stroke={axis} fontSize={12} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
                          <YAxis stroke={axis} fontSize={12} tickLine={false} axisLine={false} width={36} />
                          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v} soat`} />
                          <ReferenceLine y={NORM_HOURS} stroke="#ef4444" strokeDasharray="5 4" label={{ value: 'Me’yor 8.9 soat', position: 'insideTopRight', fill: '#ef4444', fontSize: 12 }} />
                          <Line type="monotone" dataKey="soat" name="Mediana" stroke="#8b5cf6" strokeWidth={2.2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                </div>
                <div className="stat-grid stat-grid--1-1">
                  <ChartCard title="Vagon egaligi bo‘yicha" hint="Mediana turish vaqti, soat · qizil chiziq — me’yor">
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={ownershipStay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke={grid} vertical={false} />
                        <XAxis dataKey="name" stroke={axis} fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke={axis} fontSize={12} tickLine={false} axisLine={false} width={36} />
                        <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v: number) => `${v} soat`} />
                        <ReferenceLine y={NORM_HOURS} stroke="#ef4444" strokeDasharray="5 4" />
                        <Bar dataKey="soat" name="Mediana" fill="#8b5cf6" radius={[6, 6, 0, 0]} maxBarSize={64} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                  <ChartCard title="Kechikish qaysi xizmatda" hint="Me’yordan oshgan vaqt yig‘indisi, soat">
                    {culprits.length === 0 ? empty('Kechikish aniqlanmagan') : (
                      <ResponsiveContainer width="100%" height={Math.max(220, culprits.length * 32 + 30)}>
                        <BarChart data={culprits} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                          <CartesianGrid stroke={grid} horizontal={false} />
                          <XAxis type="number" stroke={axis} fontSize={12} tickLine={false} axisLine={false} tickFormatter={shortNum} />
                          <YAxis type="category" dataKey="name" stroke={axis} fontSize={12} tickLine={false} axisLine={false} width={190} />
                          <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v: number) => `${v} soat`} />
                          <Bar dataKey="soat" name="Soat" fill="#ef4444" radius={[0, 6, 6, 0]} maxBarSize={20} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                </div>
              </>
            ) : null}

            {tab === 'quality' ? (
              <>
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
                        <Bar dataKey="kam" name="Kam yuklash" stackId="w" fill="#f59e0b" maxBarSize={26} />
                        <Bar dataKey="meyorda" name="Me’yorda" stackId="w" fill="#10b981" maxBarSize={26} />
                        <Bar dataKey="ortiqcha" name="Ortiqcha yuklash" stackId="w" fill="#ef4444" radius={[0, 6, 6, 0]} maxBarSize={26} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
                <div className="stat-grid stat-grid--1-1">
                  <ChartCard title="O‘rtacha netto" hint="Bir vagonga to‘g‘ri kelgan o‘rtacha yuk, tonna">
                    {weightRows.length === 0 ? empty() : (
                      <ResponsiveContainer width="100%" height={270}>
                        <BarChart data={weightRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid stroke={grid} vertical={false} />
                          <XAxis dataKey="name" stroke={axis} fontSize={11.5} tickLine={false} axisLine={false} interval={0} />
                          <YAxis stroke={axis} fontSize={12} tickLine={false} axisLine={false} width={36} />
                          <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v: number) => `${v} t`} />
                          <Bar dataKey="ortacha" name="O‘rtacha netto" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={56} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                  <ChartCard title="Ortiqcha va kam yuklash ulushi (oylar)" hint="Tortilgan vagonlarga nisbatan, %">
                    {weightTrend.length === 0 ? empty() : (
                      <ResponsiveContainer width="100%" height={270}>
                        <LineChart data={weightTrend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                          <CartesianGrid stroke={grid} vertical={false} />
                          <XAxis dataKey="label" stroke={axis} fontSize={12} tickLine={false} axisLine={false} />
                          <YAxis stroke={axis} fontSize={12} tickLine={false} axisLine={false} width={40} tickFormatter={v => `${v}%`} />
                          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
                          <Legend wrapperStyle={{ fontSize: 13 }} />
                          <Line type="monotone" dataKey="ortiqcha" name="Ortiqcha yuklash" stroke="#ef4444" strokeWidth={2.2} />
                          <Line type="monotone" dataKey="kam" name="Kam yuklash" stroke="#f59e0b" strokeWidth={2.2} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                </div>
              </>
            ) : null}

            {tab === 'defects' ? (
              <>
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
                          <Bar dataKey="soni" name="Dalolatnoma" fill="#ef4444" radius={[0, 6, 6, 0]} maxBarSize={22} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                  <ChartCard title="Nosozlik turlari">
                    {defectCharts.byType.length === 0 ? empty('Dalolatnoma yo‘q') : (
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie data={defectCharts.byType} dataKey="soni" nameKey="name" innerRadius={50} outerRadius={84} paddingAngle={2} stroke="none">
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
                        <BarChart data={defectCharts.byMonth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid stroke={grid} vertical={false} />
                          <XAxis dataKey="label" stroke={axis} fontSize={12} tickLine={false} axisLine={false} />
                          <YAxis stroke={axis} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} width={30} />
                          <Tooltip contentStyle={tooltipStyle} cursor={cursor} formatter={(v: number) => `${v} ta`} />
                          <Bar dataKey="soni" name="Dalolatnoma" fill="#f97316" radius={[6, 6, 0, 0]} maxBarSize={44} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
