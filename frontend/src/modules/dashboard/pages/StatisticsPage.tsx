import { useEffect, useMemo, useState } from 'react';
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
import { Activity, CheckCircle2, FileSpreadsheet, Clock3, Hourglass, Scale, Target, Truck, Wrench } from 'lucide-react';
import { api } from '../../../shared/services/api';
import type { EmptyWagonArrival, LoadingRegistry, MonthlyOrder } from '../../../shared/types';
import { DateRangePicker } from '../../../shared/components/DateRangePicker';
import { ProductTypeFilter } from '../../../shared/components/ProductTypeFilter';
import { getProductLabel } from '../../../shared/constants/productTypes';
import { logisticsFromRoute } from '../../../shared/constants/logisticsTypes';
import { matchesPeriodRange, MONTH_NAMES_UZ, todayIso } from '../../../shared/utils/dates';
import { formatTons } from '../../../shared/utils/orderQuantity';
import { excludeOneCArrivals } from '../../../shared/utils/oneCSources';
import { exportSheets, todayStamp } from '../../../shared/utils/excelExport';
import { buildDefectsGu23Analysis, buildDemurrageAnalysis, buildWeightAnalysis } from '../utils/demurrageUtils';
import { DEFECT_ACT_TYPE_LABEL } from '../../../shared/constants/defectActTypes';
import { loadedWagonCountOf, localDateKey, registryWagonCountOf, wagonCountOf } from '../utils/sharedPanels';

const PRODUCT_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

const isPlanOrder = (o: MonthlyOrder) => o.status === 'Active' || o.status === 'Completed';

function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

function shiftIsoDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const shortTons = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `${Math.round(v)}`);

function ChartCard({ title, hint, children, className = '' }: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`stat-card ${className}`}>
      <header className="stat-card__head">
        <h3>{title}</h3>
        {hint ? <p>{hint}</p> : null}
      </header>
      <div className="stat-card__body">{children}</div>
    </section>
  );
}

export default function StatisticsPage() {
  const dark = useIsDark();
  const [orders, setOrders] = useState<MonthlyOrder[]>([]);
  const [arrivals, setArrivals] = useState<EmptyWagonArrival[]>([]);
  const [registries, setRegistries] = useState<LoadingRegistry[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [product, setProduct] = useState('');

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

  const axis = dark ? '#94a3b8' : '#64748b';
  const grid = dark ? '#1e293b' : '#e8eef5';
  const tooltipStyle = {
    background: dark ? '#0f172a' : '#ffffff',
    border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`,
    borderRadius: 10,
    fontSize: 13,
    color: dark ? '#e2e8f0' : '#0f172a',
  };

  const productOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of orders) {
      if (o.productType && !map.has(o.productType)) map.set(o.productType, getProductLabel(o.productType, logisticsFromRoute(o.logisticsType)));
    }
    return Array.from(map, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [orders]);

  const scopedOrders = useMemo(() => orders.filter(o =>
    isPlanOrder(o)
    && matchesPeriodRange(o.year, o.month, periodFrom, periodTo)
    && (!product || o.productType === product),
  ), [orders, periodFrom, periodTo, product]);

  // ---- Reja ijrosi ----
  const totals = useMemo(() => {
    let plan = 0; let done = 0; let remain = 0;
    for (const o of scopedOrders) {
      for (const l of o.lines ?? []) {
        const p = Number(l.tonCount || 0);
        const d = Number(l.fulfilledNetWeight ?? 0);
        plan += p; done += d;
        if (o.status !== 'Completed') remain += Math.max(0, p - d);
      }
    }
    return { plan, done, remain, pct: plan > 0 ? Math.round((done / plan) * 100) : 0 };
  }, [scopedOrders]);

  const monthly = useMemo(() => {
    const map = new Map<string, { key: string; label: string; reja: number; bajarildi: number }>();
    for (const o of scopedOrders) {
      const key = `${o.year}-${String(o.month).padStart(2, '0')}`;
      let row = map.get(key);
      if (!row) {
        row = { key, label: `${(MONTH_NAMES_UZ[o.month - 1] || '').slice(0, 3)} ${String(o.year).slice(2)}`, reja: 0, bajarildi: 0 };
        map.set(key, row);
      }
      for (const l of o.lines ?? []) {
        row.reja += Number(l.tonCount || 0);
        row.bajarildi += Number(l.fulfilledNetWeight ?? 0);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key)).slice(-12)
      .map(r => ({ ...r, reja: Math.round(r.reja), bajarildi: Math.round(r.bajarildi) }));
  }, [scopedOrders]);

  const byProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of scopedOrders) {
      const label = getProductLabel(o.productType, logisticsFromRoute(o.logisticsType));
      const done = (o.lines ?? []).reduce((s, l) => s + Number(l.fulfilledNetWeight ?? 0), 0);
      map.set(label, (map.get(label) || 0) + done);
    }
    return Array.from(map, ([name, value]) => ({ name, value: Math.round(value) }))
      .filter(r => r.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [scopedOrders]);

  const topRemaining = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of scopedOrders) {
      if (o.status === 'Completed') continue;
      for (const l of o.lines ?? []) {
        const rem = Math.max(0, Number(l.tonCount || 0) - Number(l.fulfilledNetWeight ?? 0));
        if (rem <= 0) continue;
        const name = (l.contractor || 'Ko‘rsatilmagan').replace(/gaz ta['‘’]minoti filiali/i, '').replace(/[«»"]/g, '').trim();
        map.set(name, (map.get(name) || 0) + rem);
      }
    }
    return Array.from(map, ([name, qoldiq]) => ({ name, qoldiq: Math.round(qoldiq * 10) / 10 }))
      .sort((a, b) => b.qoldiq - a.qoldiq)
      .slice(0, 10);
  }, [scopedOrders]);

  // ---- Yuklash dinamikasi (kunlik vagonlar) ----
  const daily = useMemo(() => {
    const end = periodTo || todayIso();
    const startDefault = shiftIsoDays(end, -29);
    const start = periodFrom && periodFrom > shiftIsoDays(end, -120) ? periodFrom : (periodFrom ? shiftIsoDays(end, -120) : startDefault);
    const days: string[] = [];
    for (let d = start; d <= end; d = shiftIsoDays(d, 1)) days.push(d);
    const rows = new Map(days.map(d => [d, { day: d, kirdi: 0, yuklandi: 0, chiqdi: 0 }]));
    const clean = excludeOneCArrivals(arrivals);
    for (const a of clean) {
      const stamp = a.arrivalDate || a.createdAt;
      if (stamp) {
        const row = rows.get(localDateKey(stamp));
        if (row) row.kirdi += wagonCountOf(a);
      }
      // Vagon bo‘yicha yuklash vaqti bo‘lsa — o‘sha kun; bo‘lmasa partiya yakunlangan kun (Boshqaruv paneli bilan bir xil)
      const perWagon = (a.wagons ?? []).filter(w => w.loadingCompletedAt);
      if (perWagon.length > 0) {
        for (const w of perWagon) {
          const row = rows.get(localDateKey(w.loadingCompletedAt!));
          if (row) row.yuklandi += 1;
        }
      } else if (a.loadingCompletedAt) {
        const row = rows.get(localDateKey(a.loadingCompletedAt));
        if (row) row.yuklandi += loadedWagonCountOf(a);
      }
    }
    for (const r of registries) {
      if (!r.exitedToKengsoyAt) continue;
      const row = rows.get(localDateKey(r.exitedToKengsoyAt));
      if (row) row.chiqdi += registryWagonCountOf(r);
    }
    return Array.from(rows.values()).map(r => ({ ...r, label: `${r.day.slice(8, 10)}.${r.day.slice(5, 7)}` }));
  }, [arrivals, registries, periodFrom, periodTo]);

  const dailyTotals = useMemo(() => {
    const sum = daily.reduce((acc, r) => ({ kirdi: acc.kirdi + r.kirdi, yuklandi: acc.yuklandi + r.yuklandi, chiqdi: acc.chiqdi + r.chiqdi }), { kirdi: 0, yuklandi: 0, chiqdi: 0 });
    const n = Math.max(1, daily.length);
    return { ...sum, avgOut: Math.round((sum.chiqdi / n) * 10) / 10, days: daily.length };
  }, [daily]);

  // Davr filtri (kun darajasida) — tanlanmagan bo‘lsa barcha ma’lumot
  const inPeriod = (iso?: string | null) => {
    if (!iso) return !periodFrom && !periodTo;
    const day = localDateKey(iso);
    if (periodFrom && day < periodFrom) return false;
    if (periodTo && day > periodTo) return false;
    return true;
  };

  // ---- Bekor turish vaqti ----
  const demurrage = useMemo(() => (arrivals.length ? buildDemurrageAnalysis(arrivals, registries) : null), [arrivals, registries]);

  const stageChart = useMemo(() => {
    const STAGES = [
      { key: 'toTare', label: 'Kirish va tara', norm: 98 },
      { key: 'loading', label: 'Estakada va yuklash', norm: 225 },
      { key: 'toGross', label: 'Brutto tortish', norm: 80 },
      { key: 'sealing', label: 'Ko‘rik va hujjat', norm: 100 },
      { key: 'dispatch', label: 'Stansiyaga chiqarish', norm: 30 },
    ] as const;
    const items = (demurrage?.items ?? []).filter(i => i.isExited && inPeriod(i.exitedAt));
    return STAGES.map(st => {
      const vals = items.map(i => i.stepHours[st.key]).filter(v => v > 0);
      return { label: st.label, haqiqiy: Math.round(median(vals) * 10) / 10, meyor: Math.round((st.norm / 60) * 10) / 10 };
    });
  }, [demurrage, periodFrom, periodTo]);

  const stayTrend = useMemo(() => {
    const map = new Map<string, { vals: number[]; n: number; over: number }>();
    for (const i of demurrage?.items ?? []) {
      if (!i.isExited || !i.exitedAt || !inPeriod(i.exitedAt)) continue;
      const day = localDateKey(i.exitedAt);
      const row = map.get(day) ?? { vals: [], n: 0, over: 0 };
      row.vals.push(i.hoursInPlant);
      row.n += 1;
      if (i.hoursInPlant > 8.9) row.over += 1;
      map.set(day, row);
    }
    return Array.from(map, ([day, r]) => ({
      day,
      label: `${day.slice(8, 10)}.${day.slice(5, 7)}`,
      soat: Math.round(median(r.vals) * 10) / 10,
      oshgan: r.over,
      jami: r.n,
    })).sort((a, b) => a.day.localeCompare(b.day)).slice(-45);
  }, [demurrage, periodFrom, periodTo]);

  const stayTotals = useMemo(() => {
    const exited = stayTrend.reduce((s, r) => s + r.jami, 0);
    const over = stayTrend.reduce((s, r) => s + r.oshgan, 0);
    const all = (demurrage?.items ?? []).filter(i => i.isExited && i.exitedAt && inPeriod(i.exitedAt)).map(i => i.hoursInPlant);
    return { exited, over, avg: Math.round(median(all) * 10) / 10, inPlant: demurrage?.summary.totalActive ?? 0, red: demurrage?.summary.redCount ?? 0 };
  }, [stayTrend, demurrage]);

  // ---- Yuklash sifati (og‘irlik) ----
  const weight = useMemo(() => {
    const res = arrivals.length ? buildWeightAnalysis(arrivals, registries) : null;
    const items = (res?.items ?? []).filter(i => inPeriod(i.date) && (!product || i.productType === product || i.productType?.toLowerCase().includes(product.toLowerCase())));
    const map = new Map<string, { name: string; ortiqcha: number; meyorda: number; kam: number; netto: number; n: number }>();
    for (const i of items) {
      const name = i.productType || 'Boshqa';
      const row = map.get(name) ?? { name, ortiqcha: 0, meyorda: 0, kam: 0, netto: 0, n: 0 };
      if (i.status === 'overload') row.ortiqcha += 1;
      else if (i.status === 'underload') row.kam += 1;
      else row.meyorda += 1;
      row.netto += i.nettoWeight;
      row.n += 1;
      map.set(name, row);
    }
    const rows = Array.from(map.values()).map(r => ({ ...r, ortacha: Math.round((r.netto / Math.max(1, r.n)) * 10) / 10 })).sort((a, b) => b.n - a.n);
    const total = items.length;
    const over = items.filter(i => i.status === 'overload').length;
    const under = items.filter(i => i.status === 'underload').length;
    return { rows, total, over, under };
  }, [arrivals, registries, periodFrom, periodTo, product]);

  // ---- Nosozliklar (GU-23) ----
  const defects = useMemo(() => {
    const res = arrivals.length ? buildDefectsGu23Analysis(arrivals, registries) : null;
    const items = (res?.items ?? []).filter(i => inPeriod(i.arrivalDate));
    const station = new Map<string, number>();
    const type = new Map<string, number>();
    const month = new Map<string, number>();
    for (const i of items) {
      station.set(i.station || 'Noma’lum', (station.get(i.station || 'Noma’lum') || 0) + 1);
      const t = (DEFECT_ACT_TYPE_LABEL as Record<string, string>)[i.actType] || i.actType || 'Boshqa';
      type.set(t, (type.get(t) || 0) + 1);
      const m = (i.arrivalDate || '').slice(0, 7);
      if (m) month.set(m, (month.get(m) || 0) + 1);
    }
    const toRows = (m: Map<string, number>) => Array.from(m, ([name, soni]) => ({ name, soni })).sort((a, b) => b.soni - a.soni);
    return {
      total: items.length,
      byStation: toRows(station).slice(0, 8),
      byType: toRows(type),
      byMonth: Array.from(month, ([k, soni]) => ({ k, label: `${(MONTH_NAMES_UZ[Number(k.slice(5, 7)) - 1] || '').slice(0, 3)} ${k.slice(2, 4)}`, soni })).sort((a, b) => a.k.localeCompare(b.k)).slice(-12),
    };
  }, [arrivals, registries, periodFrom, periodTo]);

  const exportAll = () => {
    const r1 = (v: number) => Math.round(v * 10) / 10;
    exportSheets(`Statistika_${todayStamp()}`, [
      { name: 'Reja ijrosi (oylar)', rows: [['Oy', 'Reja (t)', 'Bajarildi (t)', 'Bajarilish (%)'], ...monthly.map(m => [m.label, m.reja, m.bajarildi, m.reja > 0 ? `${Math.round((m.bajarildi / m.reja) * 100)}%` : '—'])] },
      { name: 'Mahsulotlar', rows: [['Mahsulot', 'Yuklandi (t)'], ...byProduct.map(p => [p.name, p.value])] },
      { name: 'Kontragent qoldig‘i', rows: [['Kontragent', 'Qoldiq (t)'], ...topRemaining.map(c => [c.name, c.qoldiq])] },
      { name: 'Kunlik vagonlar', rows: [['Sana', 'Kirdi', 'Yuklandi', 'Chiqdi'], ...daily.map(d => [d.day, d.kirdi, d.yuklandi, d.chiqdi])] },
      { name: 'Bekor turish (bosqich)', rows: [['Bosqich', 'Me’yor (soat)', 'Haqiqiy, mediana (soat)'], ...stageChart.map(st => [st.label, st.meyor, st.haqiqiy])] },
      { name: 'Turish vaqti (kunlik)', rows: [['Sana', 'Mediana (soat)', 'Chiqqan vagon', 'Me’yordan oshgan'], ...stayTrend.map(t => [t.day, t.soat, t.jami, t.oshgan])] },
      { name: 'Yuklash sifati', rows: [['Mahsulot', 'Tortilgan', 'Kam yuklash', 'Me’yorda', 'Ortiqcha yuklash', 'O‘rtacha netto (t)'], ...weight.rows.map(w => [w.name, w.n, w.kam, w.meyorda, w.ortiqcha, r1(w.ortacha)])] },
      { name: 'Nosozliklar', rows: [['Stansiya', 'Dalolatnoma'], ...defects.byStation.map(d => [d.name, d.soni])] },
    ]);
  };

  const empty = (text: string) => <div className="stat-empty">{text}</div>;

  return (
    <div className="space-y-4">
      <div className="order-status-cards order-status-cards--four plan-kpis">
        <div className="order-status-card order-status-card--blue">
          <span className="order-status-card__icon"><Target strokeWidth={1.9} aria-hidden /></span>
          <span className="order-status-card__text"><strong>Reja</strong><small>{scopedOrders.length} ta tasdiqlangan buyurtma</small></span>
          <span className="order-status-card__count">{formatTons(Math.round(totals.plan))} t</span>
        </div>
        <div className="order-status-card order-status-card--green">
          <span className="order-status-card__icon"><CheckCircle2 strokeWidth={1.9} aria-hidden /></span>
          <span className="order-status-card__text"><strong>Bajarildi</strong><small>{formatTons(Math.round(totals.done))} t yuklandi</small></span>
          <span className="order-status-card__count">{totals.pct}%</span>
        </div>
        <div className="order-status-card order-status-card--amber">
          <span className="order-status-card__icon"><Hourglass strokeWidth={1.9} aria-hidden /></span>
          <span className="order-status-card__text"><strong>Qoldiq</strong><small>ijrodagi buyurtmalar bo‘yicha</small></span>
          <span className="order-status-card__count">{formatTons(Math.round(totals.remain))} t</span>
        </div>
        <div className="order-status-card order-status-card--violet">
          <span className="order-status-card__icon"><Truck strokeWidth={1.9} aria-hidden /></span>
          <span className="order-status-card__text"><strong>Chiqish sur’ati</strong><small>oxirgi {dailyTotals.days} kunda {dailyTotals.chiqdi} vagon</small></span>
          <span className="order-status-card__count">{dailyTotals.avgOut}/kun</span>
        </div>
      </div>

      <div className="docs-panel">
        <div className="marketing-orders-toolbar docs-panel__toolbar">
          <div className="marketing-orders-toolbar__filters">
            <ProductTypeFilter value={product} options={productOptions} onChange={setProduct} allowEmpty fieldLabel="" emptyLabel="Barcha mahsulotlar" />
            <div className="marketing-orders-toolbar__field marketing-orders-toolbar__field--period">
              <DateRangePicker from={periodFrom} to={periodTo} onFromChange={setPeriodFrom} onToChange={setPeriodTo} />
            </div>
          </div>
          <div className="marketing-orders-toolbar__right">
            <div className="flex flex-nowrap items-center gap-2">
              <button type="button" className="btn-secondary inline-flex items-center gap-1.5 whitespace-nowrap" onClick={exportAll} disabled={loading}>
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Excel</span>
              </button>
            </div>
          </div>
        </div>

        {loading ? <div className="stat-empty">Ma’lumotlar yuklanmoqda…</div> : (
          <>
            <h2 className="stat-section"><Target className="w-4 h-4" /> Reja ijrosi</h2>
            <div className="stat-grid stat-grid--2-1">
              <ChartCard title="Oylar bo‘yicha reja va bajarilish" hint="Tasdiqlangan buyurtmalar, tonna">
                {monthly.length === 0 ? empty('Tanlangan davrda buyurtma yo‘q') : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={6} barCategoryGap="28%">
                      <CartesianGrid stroke={grid} vertical={false} />
                      <XAxis dataKey="label" stroke={axis} fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke={axis} fontSize={12} tickLine={false} axisLine={false} tickFormatter={shortTons} width={44} />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: dark ? 'rgb(148 163 184 / 0.08)' : 'rgb(148 163 184 / 0.12)' }} formatter={(v: number) => `${formatTons(v)} t`} />
                      <Legend wrapperStyle={{ fontSize: 13 }} />
                      <Bar dataKey="reja" name="Reja" fill={dark ? '#334155' : '#cbd5e1'} radius={[6, 6, 0, 0]} maxBarSize={56} />
                      <Bar dataKey="bajarildi" name="Bajarildi" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={56} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
              <ChartCard title="Mahsulotlar ulushi" hint="Yuklangan tonna bo‘yicha">
                {byProduct.length === 0 ? empty('Yuklash yo‘q') : (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={byProduct} dataKey="value" nameKey="name" innerRadius={62} outerRadius={100} paddingAngle={2} stroke="none">
                        {byProduct.map((_, i) => <Cell key={i} fill={PRODUCT_COLORS[i % PRODUCT_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${formatTons(v)} t`} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>

            <ChartCard title="Qoldig‘i eng ko‘p kontragentlar" hint="Ijrodagi buyurtmalar bo‘yicha yetkazilmagan tonna (top 10)">
              {topRemaining.length === 0 ? empty('Qoldiq yo‘q — barcha buyurtmalar bajarilgan') : (
                <ResponsiveContainer width="100%" height={Math.max(160, topRemaining.length * 34 + 30)}>
                  <BarChart data={topRemaining} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                    <CartesianGrid stroke={grid} horizontal={false} />
                    <XAxis type="number" stroke={axis} fontSize={12} tickLine={false} axisLine={false} tickFormatter={shortTons} />
                    <YAxis type="category" dataKey="name" stroke={axis} fontSize={12} tickLine={false} axisLine={false} width={200} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: dark ? 'rgb(148 163 184 / 0.08)' : 'rgb(148 163 184 / 0.12)' }} formatter={(v: number) => `${formatTons(v)} t`} />
                    <Bar dataKey="qoldiq" name="Qoldiq" fill="#f59e0b" radius={[0, 6, 6, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <h2 className="stat-section"><Activity className="w-4 h-4" /> Yuklash dinamikasi</h2>
            <ChartCard
              title="Kunlar bo‘yicha vagonlar"
              hint={`Kirdi: ${dailyTotals.kirdi} · Yuklandi: ${dailyTotals.yuklandi} · Chiqdi: ${dailyTotals.chiqdi} vagon (${dailyTotals.days} kun)`}
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
                  <Line type="monotone" dataKey="chiqdi" name="Chiqdi" stroke="#10b981" strokeWidth={2.2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <h2 className="stat-section"><Clock3 className="w-4 h-4" /> Bekor turish vaqti</h2>
            <div className="stat-grid stat-grid--1-1">
              <ChartCard
                title="Bosqichlar bo‘yicha o‘rtacha vaqt"
                hint="Chiqib ketgan vagonlar, soat (mediana — vagonlarning yarmi shundan tez) · kulrang — reglament me’yori, jami 533 daqiqa"
              >
                {stayTotals.exited === 0 ? empty('Tanlangan davrda chiqib ketgan vagon yo‘q') : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={stageChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4} barCategoryGap="24%">
                      <CartesianGrid stroke={grid} vertical={false} />
                      <XAxis dataKey="label" stroke={axis} fontSize={11.5} tickLine={false} axisLine={false} interval={0} />
                      <YAxis stroke={axis} fontSize={12} tickLine={false} axisLine={false} width={36} />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: dark ? 'rgb(148 163 184 / 0.08)' : 'rgb(148 163 184 / 0.12)' }} formatter={(v: number) => `${v} soat`} />
                      <Legend wrapperStyle={{ fontSize: 13 }} />
                      <Bar dataKey="meyor" name="Me’yor" fill={dark ? '#334155' : '#cbd5e1'} radius={[6, 6, 0, 0]} maxBarSize={40} />
                      <Bar dataKey="haqiqiy" name="Haqiqiy" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={40}>
                        {stageChart.map((r, i) => <Cell key={i} fill={r.haqiqiy > r.meyor ? '#ef4444' : '#10b981'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
              <ChartCard
                title="Vagonning zavodda turgan vaqti (kunlar bo‘yicha)"
                hint={`Odatiy (mediana) ${stayTotals.avg} soat · me’yordan oshgan: ${stayTotals.over} / ${stayTotals.exited} vagon · hozir hududda: ${stayTotals.inPlant} (me’yordan oshgani: ${stayTotals.red})`}
              >
                {stayTrend.length === 0 ? empty('Ma’lumot yo‘q') : (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={stayTrend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={grid} vertical={false} />
                      <XAxis dataKey="label" stroke={axis} fontSize={12} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
                      <YAxis stroke={axis} fontSize={12} tickLine={false} axisLine={false} width={36} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => (n === 'soat' ? `${v} soat` : v)} />
                      <ReferenceLine y={8.9} stroke="#ef4444" strokeDasharray="5 4" label={{ value: 'Me’yor 8.9 soat', position: 'insideTopRight', fill: '#ef4444', fontSize: 12 }} />
                      <Line type="monotone" dataKey="soat" name="soat" stroke="#8b5cf6" strokeWidth={2.2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>

            <h2 className="stat-section"><Scale className="w-4 h-4" /> Yuklash sifati</h2>
            <ChartCard
              title="Mahsulotlar bo‘yicha yuklash natijasi"
              hint={`Tortilgan: ${weight.total} vagon · ortiqcha yuklash: ${weight.over} · kam yuklash: ${weight.under} · ≈ vagon sig‘imi mahsulot turi bo‘yicha taxminiy olingan`}
            >
              {weight.rows.length === 0 ? empty('Tortilgan vagon yo‘q') : (
                <ResponsiveContainer width="100%" height={Math.max(200, weight.rows.length * 46 + 50)}>
                  <BarChart data={weight.rows} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                    <CartesianGrid stroke={grid} horizontal={false} />
                    <XAxis type="number" stroke={axis} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" stroke={axis} fontSize={12} tickLine={false} axisLine={false} width={200} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      cursor={{ fill: dark ? 'rgb(148 163 184 / 0.08)' : 'rgb(148 163 184 / 0.12)' }}
                      formatter={(v: number, n: string) => [`${v} vagon`, n]}
                      labelFormatter={(label: string) => {
                        const r = weight.rows.find(x => x.name === label);
                        return r ? `${label} · o‘rtacha netto ${r.ortacha} t` : label;
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 13 }} />
                    <Bar dataKey="kam" name="Kam yuklash" stackId="w" fill="#f59e0b" maxBarSize={26} />
                    <Bar dataKey="meyorda" name="Me’yorda" stackId="w" fill="#10b981" maxBarSize={26} />
                    <Bar dataKey="ortiqcha" name="Ortiqcha yuklash" stackId="w" fill="#ef4444" radius={[0, 6, 6, 0]} maxBarSize={26} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <h2 className="stat-section"><Wrench className="w-4 h-4" /> Nosozliklar (GU-23)</h2>
            <div className="stat-grid stat-grid--3">
              <ChartCard title="Stansiyalar bo‘yicha" hint={`Jami ${defects.total} ta dalolatnoma`}>
                {defects.byStation.length === 0 ? empty('Dalolatnoma yo‘q') : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={defects.byStation} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                      <CartesianGrid stroke={grid} horizontal={false} />
                      <XAxis type="number" stroke={axis} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" stroke={axis} fontSize={12} tickLine={false} axisLine={false} width={110} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v} ta`} />
                      <Bar dataKey="soni" name="Dalolatnoma" fill="#ef4444" radius={[0, 6, 6, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
              <ChartCard title="Nosozlik turlari">
                {defects.byType.length === 0 ? empty('Dalolatnoma yo‘q') : (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={defects.byType} dataKey="soni" nameKey="name" innerRadius={50} outerRadius={82} paddingAngle={2} stroke="none">
                        {defects.byType.map((_, i) => <Cell key={i} fill={['#ef4444', '#f59e0b', '#8b5cf6', '#06b6d4'][i % 4]} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v} ta`} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
              <ChartCard title="Oylar bo‘yicha">
                {defects.byMonth.length === 0 ? empty('Dalolatnoma yo‘q') : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={defects.byMonth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={grid} vertical={false} />
                      <XAxis dataKey="label" stroke={axis} fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke={axis} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} width={30} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v} ta`} />
                      <Bar dataKey="soni" name="Dalolatnoma" fill="#f97316" radius={[6, 6, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
