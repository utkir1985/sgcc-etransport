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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, CheckCircle2, Hourglass, Target, TrendingUp, Truck } from 'lucide-react';
import { api } from '../../../shared/services/api';
import type { EmptyWagonArrival, LoadingRegistry, MonthlyOrder } from '../../../shared/types';
import { ReportsHistoryTabs } from '../components/ReportsHistoryTabs';
import { DateRangePicker } from '../../../shared/components/DateRangePicker';
import { ProductTypeFilter } from '../../../shared/components/ProductTypeFilter';
import { getProductLabel } from '../../../shared/constants/productTypes';
import { logisticsFromRoute } from '../../../shared/constants/logisticsTypes';
import { matchesPeriodRange, MONTH_NAMES_UZ, todayIso } from '../../../shared/utils/dates';
import { formatTons } from '../../../shared/utils/orderQuantity';
import { excludeOneCArrivals } from '../../../shared/utils/oneCSources';
import { localDateKey, registryWagonCountOf, wagonCountOf } from '../utils/sharedPanels';

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
      for (const w of a.wagons ?? []) {
        if (!w.loadingCompletedAt) continue;
        const row = rows.get(localDateKey(w.loadingCompletedAt));
        if (row) row.yuklandi += 1;
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

  const empty = (text: string) => <div className="stat-empty">{text}</div>;

  return (
    <div className="space-y-4">
      <ReportsHistoryTabs active="charts" />
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
        </div>

        {loading ? <div className="stat-empty">Ma’lumotlar yuklanmoqda…</div> : (
          <>
            <h2 className="stat-section"><Target className="w-4 h-4" /> Reja ijrosi</h2>
            <div className="stat-grid stat-grid--2-1">
              <ChartCard title="Oylar bo‘yicha reja va bajarilish" hint="Tasdiqlangan buyurtmalar, tonna">
                {monthly.length === 0 ? empty('Tanlangan davrda buyurtma yo‘q') : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4}>
                      <CartesianGrid stroke={grid} vertical={false} />
                      <XAxis dataKey="label" stroke={axis} fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke={axis} fontSize={12} tickLine={false} axisLine={false} tickFormatter={shortTons} width={44} />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: dark ? 'rgb(148 163 184 / 0.08)' : 'rgb(148 163 184 / 0.12)' }} formatter={(v: number) => `${formatTons(v)} t`} />
                      <Legend wrapperStyle={{ fontSize: 13 }} />
                      <Bar dataKey="reja" name="Reja" fill={dark ? '#334155' : '#cbd5e1'} radius={[6, 6, 0, 0]} maxBarSize={36} />
                      <Bar dataKey="bajarildi" name="Bajarildi" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={36} />
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

            <p className="stat-note"><TrendingUp className="w-3.5 h-3.5" /> Bekor turish vaqti, yuklash sifati (ortiqcha va kam yuklash) va nosozliklar bo‘limlari keyingi bosqichda qo‘shiladi.</p>
          </>
        )}
      </div>
    </div>
  );
}
