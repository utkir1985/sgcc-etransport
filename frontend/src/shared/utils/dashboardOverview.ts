import type { EmptyWagonArrival, EmptyWagonUnit, LoadingRegistry, MonthlyOrder } from '../types';
import { normalizeWagonOwnership, WAGON_OWNERSHIP } from '../constants/wagonOwnership';
import { computeOrderFulfillment } from '../components/OrderFulfillmentStatus';
import { isOneCArrival } from './oneCSources';

/** Zavod hududida — qo‘riqlashdan keyin, chiqishgacha. */
export const DASHBOARD_ON_SITE_STAGES = new Set([
  'RailwayInspected',
  'KengsoyInspection',
  'SecurityInspection',
  'ReadyForEstakada',
  'TareWeighing',
  'EstakadaPlaced',
  'Loading',
  'Loaded',
  'ToRailwayScale',
  'GrossWeighed',
  'SealInstallation',
  'SealPending',
  'Sealed',
  'RegistryPrepared',
  'DocumentsIssued',
  'PermitAndSecurityApproved',
]);

export function isDashboardOnSiteStage(stage?: string | null): boolean {
  return DASHBOARD_ON_SITE_STAGES.has(stage || '');
}

/** Buyurtmalar ro‘yxati filtri (OrdersPage) — jarayondagi (draft/yakunlanmagan). */
export function isActiveOrderStatus(status: string): boolean {
  return !['Draft', 'Completed', 'Rejected', 'ReturnedToMarketing'].includes(status);
}

const ORDER_FAOL = new Set(['Active']);
const ORDER_TASDIQLANAYOTGAN = new Set([
  'Draft',
  'ReturnedToMarketing',
  'PendingAccounting',
  'ReadyForDispatch',
  'PendingDeputyDirector',
  'PendingDispatching',
]);
const ORDER_YAKUNLANGAN = new Set(['Completed', 'Rejected']);

export function isOrderFaol(status: string): boolean {
  return ORDER_FAOL.has(status);
}

export function isOrderTasdiqlanayotgan(status: string): boolean {
  return ORDER_TASDIQLANAYOTGAN.has(status);
}

export function isOrderYakunlangan(status: string): boolean {
  return ORDER_YAKUNLANGAN.has(status);
}

export function isTodayInTashkent(iso?: string | null): boolean {
  if (!iso) return false;
  return localDateKey(iso) === localDateKey(new Date().toISOString());
}

export type DashboardOverview = {
  totalOrders: number;
  ordersFaol: number;
  ordersTasdiqlanayotgan: number;
  ordersYakunlangan: number;
  /** Buyurtmalar bo‘yicha qolgan vagon soni (yuk xati bilan kamayadi) */
  ordersWagons: number;
  /** Buyurtmalar bo‘yicha qolgan tonna */
  ordersTons: number;
  onSiteWagonsTotal: number;
  onSiteWagonsMajmua: number;
  onSiteWagonsTashqi: number;
  dailyWagons: number;
  dailyTons: number;
  /** Tarix: yakunlangan buyurtmalar */
  historyOrders: number;
  /** Tarix: yuklash yakunlangan (Exited partiyalar) */
  historyLoads: number;
  /** Tarix: chiqib ketgan vagonlar soni */
  historyWagonMoves: number;
  /** Faol yuklash jarayonlari (partiyalar) */
  activeLoadParties: number;
};

function unitsOf(arrival: EmptyWagonArrival): Array<Pick<EmptyWagonUnit, 'wagonNumber' | 'wagonType' | 'cisternNumber' | 'ownership' | 'nettoWeight' | 'tareWeight' | 'grossWeight'>> {
  if (arrival.wagons?.length) return arrival.wagons;
  const numbers = (arrival.wagonNumbers || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return numbers.map(wagonNumber => ({
    wagonNumber,
    wagonType: '',
    cisternNumber: '',
    ownership: WAGON_OWNERSHIP.Tashqi,
    nettoWeight: null,
    tareWeight: '',
    grossWeight: '',
  }));
}

function accumulateOnSite(arrivals: EmptyWagonArrival[]) {
  let total = 0;
  let majmua = 0;
  let tashqi = 0;

  for (const a of arrivals) {
    if (a.arrivalNumber?.startsWith('1C-')) continue;
    const stage = a.stage || '';
    if (!DASHBOARD_ON_SITE_STAGES.has(stage)) continue;

    const units = unitsOf(a);
    if (units.length === 0) {
      total += a.wagonCount || 0;
      continue;
    }

    for (const u of units) {
      total += 1;
      const isMajmua = normalizeWagonOwnership(u.ownership) === WAGON_OWNERSHIP.Majmua;
      if (isMajmua) majmua += 1;
      else tashqi += 1;
    }
  }

  return { total, majmua, tashqi };
}

function localDateKey(iso: string, timeZone = 'Asia/Tashkent'): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone });
}

function isToday(iso?: string | null): boolean {
  if (!iso) return false;
  return localDateKey(iso) === localDateKey(new Date().toISOString());
}

function parseTon(value?: string | null): number {
  if (!value?.trim()) return 0;
  const normalized = value.replace(',', '.').replace(/\s/g, '');
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return 0;
  const n = Number.parseFloat(match[0]);
  if (!Number.isFinite(n)) return 0;
  // kg bo‘lsa tonnaga
  return n > 500 ? n / 1000 : n;
}

function unitNettoTon(u: Pick<EmptyWagonUnit, 'nettoWeight' | 'tareWeight' | 'grossWeight'>): number {
  const fromNetto = parseTon(u.nettoWeight);
  if (fromNetto > 0) return fromNetto;
  const tare = parseTon(u.tareWeight);
  const gross = parseTon(u.grossWeight);
  if (tare > 0 && gross > tare) return gross - tare;
  return 0;
}

function computeDailyDeparted(
  arrivals: EmptyWagonArrival[],
  registries: LoadingRegistry[],
): { wagons: number; tons: number } {
  let wagons = 0;
  let tons = 0;
  const seen = new Set<string>();

  for (const r of registries) {
    if (!isToday(r.exitedToKengsoyAt)) continue;
    // Hozircha 1C dan kelgan partiya/reyestrlar «Bugun chiqqan» ga kirmaydi.
    if ((r.registryNumber || '').includes('-1C-')) continue;
    if (seen.has(r.emptyWagonArrivalId)) continue;
    seen.add(r.emptyWagonArrivalId);

    const arrival = arrivals.find(a => a.id === r.emptyWagonArrivalId);
    if (!arrival) {
      wagons += r.wagonCount || 0;
      continue;
    }
    if (isOneCArrival(arrival)) continue;

    const units = unitsOf(arrival);
    if (units.length === 0) {
      wagons += arrival.wagonCount || r.wagonCount || 0;
      continue;
    }

    wagons += units.length;
    for (const u of units) {
      tons += unitNettoTon(u);
    }
  }

  return { wagons, tons: Math.round(tons * 10) / 10 };
}

export function computeDashboardOverview(
  orders: MonthlyOrder[],
  arrivals: EmptyWagonArrival[],
  registries: LoadingRegistry[],
): DashboardOverview {
  const onSite = accumulateOnSite(arrivals);
  const daily = computeDailyDeparted(arrivals, registries);

  let ordersFaol = 0;
  let ordersTasdiqlanayotgan = 0;
  let ordersYakunlangan = 0;
  let ordersWagons = 0;
  let ordersTons = 0;
  for (const o of orders) {
    if (isOrderFaol(o.status)) ordersFaol += 1;
    else if (isOrderTasdiqlanayotgan(o.status)) ordersTasdiqlanayotgan += 1;
    else if (isOrderYakunlangan(o.status)) ordersYakunlangan += 1;
    if (o.status === 'Active' || o.status === 'Completed') {
      const fulfillment = computeOrderFulfillment(o);
      ordersWagons += fulfillment.remainingWagons;
      ordersTons += fulfillment.remainingTons;
    }
  }
  ordersTons = Math.round(ordersTons * 10) / 10;

  let historyLoads = 0;
  let historyWagonMoves = 0;
  let activeLoadParties = 0;
  for (const a of arrivals) {
    if (a.arrivalNumber?.startsWith('1C-')) continue;
    if (isOneCArrival(a)) continue;
    const stage = a.stage || '';
    if (stage === 'Exited') {
      historyLoads += 1;
      const units = unitsOf(a);
      historyWagonMoves += units.length > 0 ? units.length : (a.wagonCount || 0);
      continue;
    }
    if (stage !== 'Cancelled' && isDashboardOnSiteStage(stage)) {
      activeLoadParties += 1;
    }
  }

  return {
    totalOrders: orders.filter(o => o.status === 'Active' || o.status === 'Completed').length,
    ordersFaol,
    ordersTasdiqlanayotgan,
    ordersYakunlangan,
    ordersWagons,
    ordersTons,
    onSiteWagonsTotal: onSite.total,
    onSiteWagonsMajmua: onSite.majmua,
    onSiteWagonsTashqi: onSite.tashqi,
    dailyWagons: daily.wagons,
    dailyTons: daily.tons,
    historyOrders: ordersYakunlangan,
    historyLoads,
    historyWagonMoves,
    activeLoadParties,
  };
}

export function formatDashboardTon(tons: number): string {
  if (tons <= 0) return '0';
  return tons.toLocaleString('uz-UZ', { maximumFractionDigits: 1 });
}
