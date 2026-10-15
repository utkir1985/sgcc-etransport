import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Building2,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  Hourglass,
  LayoutList,
  Package,
  Search,
  Target,
  Users,
  X,
} from 'lucide-react';
import { api } from '../../../shared/services/api';
import type { MonthlyOrder } from '../../../shared/types';
import { ReportsHistoryTabs } from '../components/ReportsHistoryTabs';
import { DateRangePicker } from '../../../shared/components/DateRangePicker';
import { ProductTypeFilter } from '../../../shared/components/ProductTypeFilter';
import { TablePagination } from '../../../shared/components/TablePagination';
import { getProductLabel } from '../../../shared/constants/productTypes';
import { logisticsFromRoute } from '../../../shared/constants/logisticsTypes';
import { formatOrderPeriod, matchesPeriodRange } from '../../../shared/utils/dates';
import { formatTons } from '../../../shared/utils/orderQuantity';
import { exportSheet, todayStamp } from '../../../shared/utils/excelExport';
import { subscribeOrdersChanged } from '../../../shared/utils/realtimeSync';

type PlanView = 'orders' | 'contractors' | 'products';

/** Faqat tasdiqlangan (ijrodagi va yakunlangan) buyurtmalar reja hisobiga kiradi. */
const isPlanOrder = (o: MonthlyOrder) => o.status === 'Active' || o.status === 'Completed';

interface Totals {
  plan: number;
  done: number;
  remain: number;
}

function lineTotals(order: MonthlyOrder): Totals {
  let plan = 0;
  let done = 0;
  for (const line of order.lines ?? []) {
    plan += Number(line.tonCount || 0);
    done += Number(line.fulfilledNetWeight ?? 0);
  }
  if (plan === 0 && order.totalTons > 0) plan = order.totalTons;
  // Yakunlangan buyurtmada qoldiq yo‘q (to‘liq bajarilgan yoki qo‘lda yopilgan)
  const remain = order.status === 'Completed' ? 0 : Math.max(0, plan - done);
  return { plan, done, remain };
}

const pctOf = (done: number, plan: number) => (plan > 0 ? Math.min(999, Math.round((done / plan) * 100)) : 0);

interface ContractorRow {
  key: string;
  contractor: string;
  productType: string;
  logisticsType: string;
  contracts: Set<string>;
  orders: Set<string>;
  plan: number;
  done: number;
  remain: number;
  open: boolean;
}

interface ProductRow {
  productType: string;
  logisticsType: string;
  orders: number;
  plan: number;
  done: number;
  remain: number;
}

function Progress({ done, plan, closed }: { done: number; plan: number; closed?: boolean }) {
  const pct = closed ? Math.max(100, pctOf(done, plan)) : pctOf(done, plan);
  const shown = Math.min(pct, 100);
  return (
    <div className={`order-progress${pct >= 100 ? ' order-progress--done' : pct >= 75 ? ' order-progress--high' : ''}`}>
      <div className="order-progress__top">
        <span className="order-progress__pct">{pct}%</span>
        <span className="order-progress__tons">{formatTons(done)} t</span>
      </div>
      <div className="order-progress__bar"><i style={{ width: `${shown}%` }} /></div>
    </div>
  );
}

function Remain({ value, closed }: { value: number; closed?: boolean }) {
  if (closed || value <= 0) {
    return (
      <span className="order-remain order-remain--done">
        <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
        Yopildi
      </span>
    );
  }
  return <span className="order-remain">{formatTons(value)}<small>t</small></span>;
}

export default function PlanExecutionPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get('view');
  const view: PlanView = viewParam === 'contractors' || viewParam === 'products' ? viewParam : 'orders';

  const [orders, setOrders] = useState<MonthlyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [product, setProduct] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    let alive = true;
    const load = async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await api.getOrders();
        if (alive) setOrders(res?.data ?? []);
      } catch {
        if (alive && !silent) setOrders([]);
      } finally {
        if (alive && !silent) setLoading(false);
      }
    };
    void load();
    const unsubscribe = subscribeOrdersChanged(() => { void load(true); });
    return () => { alive = false; unsubscribe(); };
  }, []);

  useEffect(() => { setPage(1); }, [view, search, periodFrom, periodTo, product]);

  const setView = (next: PlanView) => {
    const sp = new URLSearchParams(searchParams);
    if (next === 'orders') sp.delete('view'); else sp.set('view', next);
    setSearchParams(sp, { replace: true });
  };

  const productOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of orders) {
      if (!o.productType || map.has(o.productType)) continue;
      map.set(o.productType, getProductLabel(o.productType, logisticsFromRoute(o.logisticsType)));
    }
    return Array.from(map, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [orders]);

  // Davr va mahsulot bo‘yicha tasdiqlangan buyurtmalar
  const scoped = useMemo(() => orders.filter(o =>
    isPlanOrder(o)
    && matchesPeriodRange(o.year, o.month, periodFrom, periodTo)
    && (!product || o.productType === product),
  ), [orders, periodFrom, periodTo, product]);

  const q = search.trim().toLowerCase();

  const orderRows = useMemo(() => {
    const rows = scoped.map(o => ({ order: o, t: lineTotals(o) }));
    const filtered = q
      ? rows.filter(({ order }) => [
        order.orderNumber,
        order.contractNumber,
        order.productType,
        ...(order.lines ?? []).map(l => `${l.contractor} ${l.contractNumber ?? ''} ${l.customerOrderNumber ?? ''}`),
      ].join(' ').toLowerCase().includes(q))
      : rows;
    return filtered.sort((a, b) =>
      b.order.year - a.order.year || b.order.month - a.order.month || b.order.createdAt.localeCompare(a.order.createdAt));
  }, [scoped, q]);

  const contractorRows = useMemo(() => {
    const map = new Map<string, ContractorRow>();
    for (const o of scoped) {
      for (const line of o.lines ?? []) {
        const name = (line.contractor || 'Kontragent ko‘rsatilmagan').trim();
        const key = `${name}__${o.productType}`;
        let row = map.get(key);
        if (!row) {
          row = {
            key, contractor: name, productType: o.productType, logisticsType: o.logisticsType,
            contracts: new Set(), orders: new Set(), plan: 0, done: 0, remain: 0, open: false,
          };
          map.set(key, row);
        }
        const plan = Number(line.tonCount || 0);
        const done = Number(line.fulfilledNetWeight ?? 0);
        row.plan += plan;
        row.done += done;
        if (o.status !== 'Completed') {
          row.remain += Math.max(0, plan - done);
          row.open = true;
        }
        const contract = (line.contractNumber || o.contractNumber || '').trim();
        if (contract) row.contracts.add(contract);
        row.orders.add(o.orderNumber);
      }
    }
    const list = Array.from(map.values());
    const filtered = q
      ? list.filter(r => `${r.contractor} ${[...r.contracts].join(' ')} ${r.productType}`.toLowerCase().includes(q))
      : list;
    return filtered.sort((a, b) => b.remain - a.remain || b.plan - a.plan);
  }, [scoped, q]);

  const productRows = useMemo(() => {
    const map = new Map<string, ProductRow>();
    for (const o of scoped) {
      const t = lineTotals(o);
      let row = map.get(o.productType);
      if (!row) {
        row = { productType: o.productType, logisticsType: o.logisticsType, orders: 0, plan: 0, done: 0, remain: 0 };
        map.set(o.productType, row);
      }
      row.orders += 1;
      row.plan += t.plan;
      row.done += t.done;
      row.remain += t.remain;
    }
    const list = Array.from(map.values());
    const filtered = q
      ? list.filter(r => getProductLabel(r.productType, logisticsFromRoute(r.logisticsType)).toLowerCase().includes(q))
      : list;
    return filtered.sort((a, b) => b.plan - a.plan);
  }, [scoped, q]);

  const kpi = useMemo(() => {
    let plan = 0;
    let done = 0;
    let remain = 0;
    let active = 0;
    let completed = 0;
    for (const o of scoped) {
      const t = lineTotals(o);
      plan += t.plan;
      done += t.done;
      remain += t.remain;
      if (o.status === 'Completed') completed += 1; else active += 1;
    }
    const openContractors = contractorRows.filter(r => r.open && r.remain > 0).length;
    return { plan, done, remain, active, completed, openContractors, contractors: contractorRows.length };
  }, [scoped, contractorRows]);

  const currentList = view === 'orders' ? orderRows : view === 'contractors' ? contractorRows : productRows;
  const totalPages = Math.max(1, Math.ceil(currentList.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;

  const productLabel = (pt: string, lt: string) => getProductLabel(pt, logisticsFromRoute(lt));

  const exportExcel = () => {
    if (view === 'orders') {
      exportSheet(`Reja_ijro_buyurtmalar_${todayStamp()}`, 'Buyurtmalar', [
        ['№', 'Hujjat raqami', 'Mahsulot', 'Davr', 'Reja (t)', 'Bajarildi (t)', 'Bajarilish (%)', 'Qoldiq (t)', 'Holat'],
        ...orderRows.map(({ order, t }, i) => [
          i + 1, order.orderNumber, productLabel(order.productType, order.logisticsType), formatOrderPeriod(order.year, order.month),
          t.plan, Math.round(t.done * 1000) / 1000, `${pctOf(t.done, t.plan)}%`, Math.round(t.remain * 1000) / 1000,
          order.status === 'Completed' ? 'Yakunlangan' : 'Ijroda',
        ]),
      ]);
    } else if (view === 'contractors') {
      exportSheet(`Reja_ijro_kontragentlar_${todayStamp()}`, 'Kontragentlar', [
        ['№', 'Kontragent', 'Mahsulot', 'Shartnoma', 'Buyurtmalar', 'Reja (t)', 'Yuklandi (t)', 'Bajarilish (%)', 'Qoldiq (t)'],
        ...contractorRows.map((r, i) => [
          i + 1, r.contractor, productLabel(r.productType, r.logisticsType), [...r.contracts].join(', ') || '—',
          [...r.orders].join(', '), Math.round(r.plan * 1000) / 1000, Math.round(r.done * 1000) / 1000,
          `${pctOf(r.done, r.plan)}%`, Math.round(r.remain * 1000) / 1000,
        ]),
      ]);
    } else {
      exportSheet(`Reja_ijro_mahsulotlar_${todayStamp()}`, 'Mahsulotlar', [
        ['№', 'Mahsulot', 'Buyurtmalar', 'Reja (t)', 'Bajarildi (t)', 'Bajarilish (%)', 'Qoldiq (t)'],
        ...productRows.map((r, i) => [
          i + 1, productLabel(r.productType, r.logisticsType), r.orders, Math.round(r.plan * 1000) / 1000,
          Math.round(r.done * 1000) / 1000, `${pctOf(r.done, r.plan)}%`, Math.round(r.remain * 1000) / 1000,
        ]),
      ]);
    }
  };

  const openOrder = (o: MonthlyOrder) => {
    navigate(`/orders/${o.logisticsType === 'Road' ? 'road' : 'railway'}?view=${o.status === 'Completed' ? 'yakun' : 'faol'}&open=${o.id}`);
  };

  const views: { id: PlanView; label: string; icon: typeof LayoutList; count: number }[] = [
    { id: 'orders', label: 'Buyurtmalar', icon: LayoutList, count: orderRows.length },
    { id: 'contractors', label: 'Kontragentlar', icon: Users, count: contractorRows.length },
    { id: 'products', label: 'Mahsulotlar', icon: Package, count: productRows.length },
  ];

  return (
    <div className="space-y-4">
      <ReportsHistoryTabs active="plans" />

      <div className="order-status-cards order-status-cards--four plan-kpis">
        <div className="order-status-card order-status-card--blue">
          <span className="order-status-card__icon"><Target strokeWidth={1.9} aria-hidden /></span>
          <span className="order-status-card__text">
            <strong>Reja</strong>
            <small>{scoped.length} ta tasdiqlangan buyurtma</small>
          </span>
          <span className="order-status-card__count">{formatTons(kpi.plan)} t</span>
        </div>
        <div className="order-status-card order-status-card--green">
          <span className="order-status-card__icon"><CheckCircle2 strokeWidth={1.9} aria-hidden /></span>
          <span className="order-status-card__text">
            <strong>Bajarildi</strong>
            <small>{formatTons(kpi.done)} t yuklandi</small>
          </span>
          <span className="order-status-card__count">{pctOf(kpi.done, kpi.plan)}%</span>
        </div>
        <div className="order-status-card order-status-card--amber">
          <span className="order-status-card__icon"><Hourglass strokeWidth={1.9} aria-hidden /></span>
          <span className="order-status-card__text">
            <strong>Qoldiq</strong>
            <small>{kpi.active} ta ijrodagi buyurtma bo‘yicha</small>
          </span>
          <span className="order-status-card__count">{formatTons(kpi.remain)} t</span>
        </div>
        <div className="order-status-card order-status-card--violet">
          <span className="order-status-card__icon"><Building2 strokeWidth={1.9} aria-hidden /></span>
          <span className="order-status-card__text">
            <strong>Kontragentlar</strong>
            <small>{kpi.openContractors} tasida qoldiq bor · {kpi.completed} ta buyurtma yopilgan</small>
          </span>
          <span className="order-status-card__count">{kpi.contractors} ta</span>
        </div>
      </div>

      <div className="docs-panel">
        <div className="marketing-orders-toolbar docs-panel__toolbar">
          <div className="marketing-orders-toolbar__filters">
            <label className="thub-search marketing-orders-search">
              <Search className="thub-search__ico" strokeWidth={1.75} aria-hidden />
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={view === 'contractors' ? 'Kontragent yoki shartnoma…' : view === 'products' ? 'Mahsulot…' : 'Buyurtma, shartnoma yoki korxona…'}
                autoComplete="off"
              />
              {search ? (
                <button type="button" className="thub-search__x" onClick={() => setSearch('')} aria-label="Tozalash">
                  <X className="w-3.5 h-3.5" strokeWidth={2} />
                </button>
              ) : null}
            </label>
            <ProductTypeFilter
              value={product}
              options={productOptions}
              onChange={setProduct}
              allowEmpty
              fieldLabel=""
              emptyLabel="Barcha mahsulotlar"
            />
            <div className="marketing-orders-toolbar__field marketing-orders-toolbar__field--period">
              <DateRangePicker from={periodFrom} to={periodTo} onFromChange={setPeriodFrom} onToChange={setPeriodTo} />
            </div>
          </div>
          <div className="marketing-orders-toolbar__right">
            <div className="flex flex-nowrap items-center gap-2">
              <button
                type="button"
                className="btn-secondary inline-flex items-center gap-1.5 whitespace-nowrap"
                onClick={exportExcel}
                disabled={currentList.length === 0}
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Excel</span>
              </button>
            </div>
          </div>
        </div>

        <div className="order-kind-toggle plan-view-toggle" role="tablist" aria-label="Ko‘rinish">
          {views.map(v => {
            const Icon = v.icon;
            return (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={view === v.id}
                className={`order-kind-toggle__btn${view === v.id ? ' is-active' : ''}`}
                onClick={() => setView(v.id)}
              >
                <Icon className="order-kind-toggle__icon" aria-hidden />
                {v.label}
                <span className="plan-view-toggle__count">{v.count}</span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="thub-empty">
            <p className="thub-empty__title">Yuklanmoqda…</p>
          </div>
        ) : currentList.length === 0 ? (
          <div className="thub-empty">
            <ClipboardList className="mx-auto mb-2 h-8 w-8 text-slate-400" />
            <p className="thub-empty__title">Ma’lumot topilmadi</p>
            <p className="thub-empty__text">Tanlangan davr va filtr bo‘yicha tasdiqlangan buyurtma yo‘q.</p>
          </div>
        ) : (
          <>
            <div className="thub-table-wrap reestr-table-wrap">
              {view === 'orders' ? (
                <table className="thub-table reestr-table plan-table w-full">
                  <thead>
                    <tr>
                      <th className="plan-c">№</th>
                      <th className="plan-l">Hujjat raqami</th>
                      <th className="plan-l plan-wide">Mahsulot</th>
                      <th className="plan-c">Davr</th>
                      <th className="plan-r">Reja (t)</th>
                      <th className="plan-l plan-progress-col">Bajarilish</th>
                      <th className="plan-c">Qoldiq</th>
                      <th className="plan-c">Holat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderRows.slice(start, start + pageSize).map(({ order, t }, i) => (
                      <tr key={order.id} className="plan-row--link" onClick={() => openOrder(order)} title="Buyurtmani ochish">
                        <td className="plan-c text-slate-500 tabular-nums">{start + i + 1}</td>
                        <td className="plan-l font-semibold">{order.orderNumber}</td>
                        <td className="plan-l plan-wide">{productLabel(order.productType, order.logisticsType)}</td>
                        <td className="plan-c tabular-nums">{formatOrderPeriod(order.year, order.month)}</td>
                        <td className="plan-r tabular-nums font-semibold">{formatTons(t.plan)}</td>
                        <td className="plan-l plan-progress-col"><Progress done={t.done} plan={t.plan} closed={order.status === 'Completed'} /></td>
                        <td className="plan-c"><Remain value={t.remain} closed={order.status === 'Completed'} /></td>
                        <td className="plan-c">
                          <span className={`plan-status ${order.status === 'Completed' ? 'plan-status--done' : 'plan-status--active'}`}>
                            {order.status === 'Completed' ? (order.manuallyCompleted ? 'Qo‘lda yopilgan' : 'Yakunlangan') : 'Ijroda'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : view === 'contractors' ? (
                <table className="thub-table reestr-table plan-table w-full">
                  <thead>
                    <tr>
                      <th className="plan-c">№</th>
                      <th className="plan-l plan-wide">Kontragent</th>
                      <th className="plan-l">Mahsulot</th>
                      <th className="plan-l">Shartnoma</th>
                      <th className="plan-r">Reja (t)</th>
                      <th className="plan-l plan-progress-col">Yuklandi</th>
                      <th className="plan-c">Qoldiq</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contractorRows.slice(start, start + pageSize).map((r, i) => (
                      <tr key={r.key}>
                        <td className="plan-c text-slate-500 tabular-nums">{start + i + 1}</td>
                        <td className="plan-l plan-wide">
                          <div className="font-semibold">{r.contractor}</div>
                          <div className="plan-sub">{r.orders.size} ta buyurtma: {[...r.orders].slice(0, 3).join(', ')}{r.orders.size > 3 ? ` +${r.orders.size - 3}` : ''}</div>
                        </td>
                        <td className="plan-l">{productLabel(r.productType, r.logisticsType)}</td>
                        <td className="plan-l plan-sub-strong" title={[...r.contracts].join(', ')}>
                          {r.contracts.size ? [...r.contracts].slice(0, 2).join(', ') + (r.contracts.size > 2 ? ` +${r.contracts.size - 2}` : '') : '—'}
                        </td>
                        <td className="plan-r tabular-nums font-semibold">{formatTons(r.plan)}</td>
                        <td className="plan-l plan-progress-col"><Progress done={r.done} plan={r.plan} closed={!r.open} /></td>
                        <td className="plan-c"><Remain value={r.remain} closed={!r.open} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="thub-table reestr-table plan-table w-full">
                  <thead>
                    <tr>
                      <th className="plan-c">№</th>
                      <th className="plan-l plan-wide">Mahsulot</th>
                      <th className="plan-c">Buyurtmalar</th>
                      <th className="plan-r">Reja (t)</th>
                      <th className="plan-l plan-progress-col">Bajarilish</th>
                      <th className="plan-c">Qoldiq</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productRows.slice(start, start + pageSize).map((r, i) => (
                      <tr key={r.productType}>
                        <td className="plan-c text-slate-500 tabular-nums">{start + i + 1}</td>
                        <td className="plan-l plan-wide font-semibold">{productLabel(r.productType, r.logisticsType)}</td>
                        <td className="plan-c tabular-nums">{r.orders} ta</td>
                        <td className="plan-r tabular-nums font-semibold">{formatTons(r.plan)}</td>
                        <td className="plan-l plan-progress-col"><Progress done={r.done} plan={r.plan} closed={r.remain <= 0} /></td>
                        <td className="plan-c"><Remain value={r.remain} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <TablePagination
              total={currentList.length}
              page={currentPage}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              unitLabel={view === 'orders' ? 'buyurtma' : view === 'contractors' ? 'kontragent' : 'mahsulot'}
            />
          </>
        )}
      </div>
    </div>
  );
}
