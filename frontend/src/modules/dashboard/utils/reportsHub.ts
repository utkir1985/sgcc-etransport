import type { EmptyWagonArrival, LoadingRegistry, MonthlyOrder } from '../../../shared/types';
import { normalizeWagonOwnership, WAGON_OWNERSHIP } from '../../../shared/constants/wagonOwnership';
import { isOneCArrival } from '../../../shared/utils/oneCSources';
import { isOrderFaol, isOrderTasdiqlanayotgan, isOrderYakunlangan } from '../../../shared/utils/dashboardOverview';
import { isWagonKind, type WagonKind, WAGON_KIND_LABEL } from '../../../shared/utils/wagonKinds';
import {
  arrivalUnits,
  computePeriodReport,
  loadedTonsOf,
  loadedUnitsOf,
  loadedWagonCountOf,
  localDateKey,
  monthKey,
  weekKey,
  weekStartOf,
  weekEndOf,
  ownershipSplit,
  productTitle,
  registryTonsOf,
  registryWagonCountOf,
  buildVisitUnitMap,
  visitUnitKey,
  unitNettoTon,
  wagonCountOf,
  type PeriodReport,
  type ReportMode,
} from './sharedPanels';
import { resolveWagonKind } from './transportHub';

export type ReportLane =
  | 'overview'
  | 'flow'
  | 'products'
  | 'destinations'
  | 'ownership'
  | 'kinds'
  | 'cycle'
  | 'exceptions'
  | 'orders'
  | 'trend';

export { computePeriodReport, localDateKey, monthKey, weekKey, weekStartOf, weekEndOf, productTitle, type PeriodReport, type ReportMode };

function skipArrival(a: EmptyWagonArrival): boolean {
  return !!a.arrivalNumber?.startsWith('1C-') || isOneCArrival(a);
}

function inPeriod(iso: string | null | undefined, mode: ReportMode, key: string): boolean {
  if (!iso) return false;
  if (mode === 'daily') return localDateKey(iso) === key;
  if (mode === 'weekly') return weekKey(iso) === key;
  return monthKey(iso) === key;
}

function arrivalTons(a: EmptyWagonArrival): number {
  return Math.round(arrivalUnits(a).reduce((sum, u) => sum + unitNettoTon(u), 0) * 10) / 10;
}

export type OwnershipReport = {
  majmua: { wagons: number; tons: number };
  tashqi: { wagons: number; tons: number };
};

/** Chiqish asosida egalik kesimi (davr). */
export function computeOwnershipReport(
  arrivals: EmptyWagonArrival[],
  registries: LoadingRegistry[],
  mode: ReportMode,
  periodKey: string,
): OwnershipReport {
  const unitByVisit = buildVisitUnitMap(arrivals);
  const out: OwnershipReport = {
    majmua: { wagons: 0, tons: 0 },
    tashqi: { wagons: 0, tons: 0 },
  };
  const byId = new Map(arrivals.map(a => [a.id, a]));

  for (const r of registries) {
    if (!inPeriod(r.exitedToKengsoyAt, mode, periodKey)) continue;
    if ((r.registryNumber || '').includes('-1C-')) continue;
    const a = byId.get(r.emptyWagonArrivalId);
    if (!a || skipArrival(a)) continue;
    const wanted = new Set(
      (r.wagonRoutes || []).map(x => x.wagonNumber.trim().toLowerCase()).filter(Boolean),
    );
    const units = (a.wagons ?? []).filter(u =>
      wanted.size === 0 || wanted.has(u.wagonNumber.trim().toLowerCase()),
    );
    if (units.length === 0) {
      const split = ownershipSplit(a);
      const total = split.majmua + split.tashqi || registryWagonCountOf(r);
      if (total <= 0) continue;
      const share = registryWagonCountOf(r) / total;
      const tons = registryTonsOf(r, a, unitByVisit);
      out.majmua.wagons += Math.round(split.majmua * share);
      out.tashqi.wagons += Math.round(split.tashqi * share);
      out.majmua.tons += Math.round(tons * (split.majmua / total) * 10) / 10;
      out.tashqi.tons += Math.round(tons * (split.tashqi / total) * 10) / 10;
      continue;
    }
    for (const u of units) {
      const isMajmua = normalizeWagonOwnership(u.ownership) === WAGON_OWNERSHIP.Majmua;
      const t = unitNettoTon(u);
      if (isMajmua) {
        out.majmua.wagons += 1;
        out.majmua.tons += t;
      } else {
        out.tashqi.wagons += 1;
        out.tashqi.tons += t;
      }
    }
  }

  out.majmua.tons = Math.round(out.majmua.tons * 10) / 10;
  out.tashqi.tons = Math.round(out.tashqi.tons * 10) / 10;
  return out;
}

export type KindReportRow = {
  kind: WagonKind;
  label: string;
  kirish: number;
  yuklash: number;
  chiqish: number;
};

export function computeKindReport(
  arrivals: EmptyWagonArrival[],
  registries: LoadingRegistry[],
  mode: ReportMode,
  periodKey: string,
): KindReportRow[] {
  const map = new Map<WagonKind, KindReportRow>();
  const ensure = (k: WagonKind) => {
    let row = map.get(k);
    if (!row) {
      row = { kind: k, label: WAGON_KIND_LABEL[k], kirish: 0, yuklash: 0, chiqish: 0 };
      map.set(k, row);
    }
    return row;
  };

  const countKinds = (a: EmptyWagonArrival): Record<WagonKind, number> => {
    const counts: Record<WagonKind, number> = { sisterna: 0, closed: 0, platform: 0 };
    const units = a.wagons?.length ? a.wagons : [];
    if (units.length === 0) {
      counts.sisterna = wagonCountOf(a);
      return counts;
    }
    for (const u of units) {
      const k = isWagonKind(u.wagonType) ? u.wagonType : resolveWagonKind(u.wagonType);
      counts[k] += 1;
    }
    return counts;
  };

  for (const a of arrivals) {
    if (skipArrival(a)) continue;
    const all = countKinds(a);
    if (inPeriod(a.arrivalDate || a.createdAt, mode, periodKey)) {
      (Object.keys(all) as WagonKind[]).forEach(k => { ensure(k).kirish += all[k]; });
    }
    if (inPeriod(a.loadingCompletedAt, mode, periodKey)) {
      const loaded = loadedUnitsOf(a);
      if (loaded.length > 0) {
        for (const u of loaded) {
          const k = isWagonKind(u.wagonType) ? u.wagonType : resolveWagonKind(u.wagonType);
          ensure(k).yuklash += 1;
        }
      } else {
        const w = loadedWagonCountOf(a);
        ensure('sisterna').yuklash += w;
      }
    }
  }

  const byId = new Map(arrivals.map(a => [a.id, a]));
  for (const r of registries) {
    if (!inPeriod(r.exitedToKengsoyAt, mode, periodKey)) continue;
    if ((r.registryNumber || '').includes('-1C-')) continue;
    const a = byId.get(r.emptyWagonArrivalId);
    if (a && skipArrival(a)) continue;
    const wanted = new Set(
      (r.wagonRoutes || []).map(x => x.wagonNumber.trim().toLowerCase()).filter(Boolean),
    );
    const units = (a?.wagons ?? []).filter(u =>
      wanted.size === 0 || wanted.has(u.wagonNumber.trim().toLowerCase()),
    );
    if (units.length > 0) {
      for (const u of units) {
        const k = isWagonKind(u.wagonType) ? u.wagonType : resolveWagonKind(u.wagonType);
        ensure(k).chiqish += 1;
      }
    } else {
      ensure('sisterna').chiqish += registryWagonCountOf(r);
    }
  }

  return (['sisterna', 'closed', 'platform'] as WagonKind[]).map(k => ensure(k));
}

export type OrdersPeriodStats = {
  total: number;
  faol: number;
  tasdiq: number;
  yakun: number;
  wagons: number;
  tons: number;
};

export function computeOrdersPeriodStats(
  orders: MonthlyOrder[],
  mode: ReportMode,
  periodKey: string,
): OrdersPeriodStats {
  const stats: OrdersPeriodStats = {
    total: 0, faol: 0, tasdiq: 0, yakun: 0, wagons: 0, tons: 0,
  };

  for (const o of orders) {
    const stamp = o.createdAt || o.submittedAt || '';
    const inCreated = inPeriod(stamp, mode, periodKey);
    const inMonth = mode === 'monthly'
      ? `${o.year}-${String(o.month).padStart(2, '0')}` === periodKey
      : false;
    // Haftalik kesimda buyurtma oyi bilan moslik yo‘q — faqat yaratilgan sana.
    // Kunlik: yaratilgan sana; oylik: buyurtma oyiga yoki yaratilgan oyiga
    if (!(inCreated || inMonth)) continue;

    stats.total += 1;
    if (isOrderFaol(o.status)) stats.faol += 1;
    else if (isOrderTasdiqlanayotgan(o.status)) stats.tasdiq += 1;
    else if (isOrderYakunlangan(o.status)) stats.yakun += 1;
    stats.wagons += o.totalWagons || 0;
    stats.tons += o.totalTons || 0;
  }

  stats.tons = Math.round(stats.tons * 10) / 10;
  return stats;
}

export type TrendPoint = {
  key: string;
  label: string;
  kirish: number;
  yuklash: number;
  chiqish: number;
  /** Yuklangan tonna — tendensiyaning tonna ko'rinishi uchun. */
  tonsLoad: number;
  tonsOut: number;
};

function shiftDay(isoDate: string, delta: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return localDateKey(d.toISOString());
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function buildTrendSeries(
  arrivals: EmptyWagonArrival[],
  registries: LoadingRegistry[],
  mode: ReportMode,
  periodKey: string,
): TrendPoint[] {
  const points: TrendPoint[] = [];
  const count = mode === 'daily' ? 7 : mode === 'weekly' ? 8 : 6;

  for (let i = count - 1; i >= 0; i--) {
    const key = mode === 'daily'
      ? shiftDay(periodKey, -i)
      : mode === 'weekly'
        ? weekStartOf(shiftDay(periodKey, -i * 7))
        : shiftMonth(periodKey, -i);
    const rep = computePeriodReport(arrivals, registries, mode, key);
    points.push({
      key,
      label: mode === 'monthly' ? key : key.slice(5),
      kirish: rep.kirish.wagons,
      yuklash: rep.yuklash.wagons,
      chiqish: rep.chiqish.wagons,
      tonsLoad: rep.yuklash.tons,
      tonsOut: rep.chiqish.tons,
    });
  }
  return points;
}

export type FlowPartyRow = {
  id: string;
  kind: 'kirish' | 'yuklash' | 'chiqish';
  number: string;
  product: string;
  wagons: number;
  tons: number;
  at: string;
  ownership: string;
};

export function listFlowParties(
  arrivals: EmptyWagonArrival[],
  registries: LoadingRegistry[],
  mode: ReportMode,
  periodKey: string,
  kind: 'kirish' | 'yuklash' | 'chiqish' | 'all',
): FlowPartyRow[] {
  const rows: FlowPartyRow[] = [];
  const byId = new Map(arrivals.map(a => [a.id, a]));
  const unitByVisit = buildVisitUnitMap(arrivals);

  if (kind === 'kirish' || kind === 'all') {
    for (const a of arrivals) {
      if (skipArrival(a)) continue;
      const at = a.arrivalDate || a.createdAt;
      if (!inPeriod(at, mode, periodKey)) continue;
      const split = ownershipSplit(a);
      rows.push({
        id: `in-${a.id}`,
        kind: 'kirish',
        number: a.arrivalNumber,
        product: productTitle(a.productType),
        wagons: wagonCountOf(a),
        tons: arrivalTons(a),
        at,
        ownership: split.majmua && split.tashqi
          ? `M${split.majmua}/T${split.tashqi}`
          : split.majmua
            ? 'Majmua'
            : 'Tashqi',
      });
    }
  }

  if (kind === 'yuklash' || kind === 'all') {
    for (const a of arrivals) {
      if (skipArrival(a) || !a.loadingCompletedAt) continue;
      if (!inPeriod(a.loadingCompletedAt, mode, periodKey)) continue;
      const wagons = loadedWagonCountOf(a);
      if (wagons <= 0) continue;
      const split = ownershipSplit(a);
      rows.push({
        id: `load-${a.id}`,
        kind: 'yuklash',
        number: a.arrivalNumber,
        product: productTitle(a.productType),
        wagons,
        tons: loadedTonsOf(a),
        at: a.loadingCompletedAt,
        ownership: split.majmua ? 'Majmua' : 'Tashqi',
      });
    }
  }

  if (kind === 'chiqish' || kind === 'all') {
    for (const r of registries) {
      if (!inPeriod(r.exitedToKengsoyAt, mode, periodKey)) continue;
      if ((r.registryNumber || '').includes('-1C-')) continue;
      const a = byId.get(r.emptyWagonArrivalId);
      if (a && skipArrival(a)) continue;
      const wagons = registryWagonCountOf(r);
      if (wagons <= 0) continue;
      const split = a ? ownershipSplit(a) : { majmua: 0, tashqi: wagons };
      rows.push({
        id: `out-${r.id}`,
        kind: 'chiqish',
        number: r.registryNumber || r.arrivalNumber,
        product: productTitle(a?.productType || r.productType),
        wagons,
        tons: registryTonsOf(r, a, unitByVisit),
        at: r.exitedToKengsoyAt || '',
        ownership: split.majmua ? 'Majmua' : 'Tashqi',
      });
    }
  }

  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

export function fmtTon(n: number): string {
  if (n <= 0) return '0';
  return n.toLocaleString('uz-UZ', { maximumFractionDigits: 1 });
}

// ============================================================================
// Kontragent va jo'natish stansiyasi kesimi (chiqish bo'yicha)
// ============================================================================

export type DestinationRow = {
  id: string;
  contractor: string;
  station: string;
  wagons: number;
  tons: number;
  registries: number;
};

function visitKeyOf(route: { wagonNumber: string; sourceArrivalId?: string | null }, registryArrivalId: string): string {
  return visitUnitKey(route.sourceArrivalId || registryArrivalId, route.wagonNumber);
}

/**
 * Davrda chiqib ketgan vagonlarni kontragent va jo'natish stansiyasi bo'yicha guruhlaydi.
 * Yuk xatida vagon yozuvlari bo'lsa — har bir vagon o'z yo'nalishiga qo'shiladi;
 * eski hujjatlarda esa butun yuk xati bitta yo'nalishga yoziladi.
 */
export function computeDestinationReport(
  arrivals: EmptyWagonArrival[],
  registries: LoadingRegistry[],
  mode: ReportMode,
  periodKey: string,
): DestinationRow[] {
  const map = new Map<string, DestinationRow>();
  const arrivalById = new Map(arrivals.map(a => [a.id, a]));
  const unitByVisit = buildVisitUnitMap(arrivals);
  const seenRegistry = new Map<string, Set<string>>();

  const bump = (contractor: string, station: string, wagons: number, tons: number, registryId: string) => {
    const c = (contractor || '').trim() || '—';
    const st = (station || '').trim() || '—';
    const id = `${c}__${st}`;
    let row = map.get(id);
    if (!row) {
      row = { id, contractor: c, station: st, wagons: 0, tons: 0, registries: 0 };
      map.set(id, row);
      seenRegistry.set(id, new Set());
    }
    row.wagons += wagons;
    row.tons += tons;
    const seen = seenRegistry.get(id)!;
    if (!seen.has(registryId)) {
      seen.add(registryId);
      row.registries += 1;
    }
  };

  for (const r of registries) {
    if (!inPeriod(r.exitedToKengsoyAt, mode, periodKey)) continue;
    if ((r.registryNumber || '').includes('-1C-')) continue;
    const arrival = arrivalById.get(r.emptyWagonArrivalId);
    if (arrival && skipArrival(arrival)) continue;

    const routes = r.wagonRoutes ?? [];
    if (routes.length === 0) {
      bump(r.contractorName, r.destinationStation, registryWagonCountOf(r), registryTonsOf(r, arrival, unitByVisit), r.id);
      continue;
    }
    for (const route of routes) {
      if (route.isDefective) continue; // nomuvofiq vagon mahsulot hisobiga kirmaydi
      // Og'irlik yuk xati yozuvida saqlanmaydi — aynan shu tashrifdagi vagondan olinadi.
      const unit = unitByVisit.get(visitKeyOf(route, r.emptyWagonArrivalId));
      bump(
        route.contractorName || r.contractorName,
        route.destinationStation || r.destinationStation,
        1,
        unit ? unitNettoTon(unit) : 0,
        r.id,
      );
    }
  }

  return [...map.values()]
    .map(row => ({ ...row, tons: Math.round(row.tons * 10) / 10 }))
    .sort((a, b) => b.tons - a.tons || b.wagons - a.wagons);
}

// ============================================================================
// Aylanma vaqti: kirishdan chiqishgacha
// ============================================================================

export type CycleReport = {
  measured: number;
  avgHours: number;
  minHours: number;
  maxHours: number;
  avgToLoadHours: number;
  avgLoadToExitHours: number;
  buckets: Array<{ id: string; label: string; count: number }>;
};

function hoursBetween(fromIso?: string | null, toIso?: string | null): number | null {
  if (!fromIso || !toIso) return null;
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return null;
  return (to - from) / 3_600_000;
}

/**
 * Davrda chiqib ketgan vagonlar bo'yicha aylanma vaqti.
 * Har bir vagon o'z tashrifining kirish sanasidan hisoblanadi — vagon qayta kelgan
 * bo'lsa, boshqa tashrifning sanasi olinmaydi.
 */
export function computeCycleReport(
  arrivals: EmptyWagonArrival[],
  registries: LoadingRegistry[],
  mode: ReportMode,
  periodKey: string,
): CycleReport {
  const arrivalById = new Map(arrivals.map(a => [a.id, a]));
  const totals: number[] = [];
  const toLoad: number[] = [];
  const loadToExit: number[] = [];

  for (const r of registries) {
    if (!inPeriod(r.exitedToKengsoyAt, mode, periodKey)) continue;
    if ((r.registryNumber || '').includes('-1C-')) continue;

    const routes = r.wagonRoutes ?? [];
    const visitIds = routes.length > 0
      ? routes.map(route => route.sourceArrivalId || r.emptyWagonArrivalId)
      : [r.emptyWagonArrivalId];

    for (const arrivalId of visitIds) {
      const arrival = arrivalById.get(arrivalId);
      if (!arrival || skipArrival(arrival)) continue;
      const enterAt = arrival.arrivalDate || arrival.createdAt;

      const total = hoursBetween(enterAt, r.exitedToKengsoyAt);
      if (total !== null) totals.push(total);

      const untilLoad = hoursBetween(enterAt, arrival.loadingCompletedAt);
      if (untilLoad !== null) toLoad.push(untilLoad);

      const afterLoad = hoursBetween(arrival.loadingCompletedAt, r.exitedToKengsoyAt);
      if (afterLoad !== null) loadToExit.push(afterLoad);
    }
  }

  const avg = (xs: number[]) => (xs.length === 0 ? 0 : Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10);
  const buckets = [
    { id: 'd1', label: '24 soatgacha', count: totals.filter(h => h <= 24).length },
    { id: 'd2', label: '1–2 kun', count: totals.filter(h => h > 24 && h <= 48).length },
    { id: 'd3', label: '2–3 kun', count: totals.filter(h => h > 48 && h <= 72).length },
    { id: 'd4', label: '3 kundan ortiq', count: totals.filter(h => h > 72).length },
  ];

  return {
    measured: totals.length,
    avgHours: avg(totals),
    minHours: totals.length === 0 ? 0 : Math.round(Math.min(...totals) * 10) / 10,
    maxHours: totals.length === 0 ? 0 : Math.round(Math.max(...totals) * 10) / 10,
    avgToLoadHours: avg(toLoad),
    avgLoadToExitHours: avg(loadToExit),
    buckets,
  };
}

// ============================================================================
// Istisnolar: dalolatnoma, raqamsiz plomba, takror kelgan vagon
// ============================================================================

export type ExceptionReport = {
  exitedWagons: number;
  /** Plomba holati aniqlangan vagonlar (vagon yozuvi topilganlar). */
  sealChecked: number;
  defective: number;
  sealTextOnly: number;
  noSeal: number;
  repeatVisits: number;
  rows: Array<{ id: string; wagon: string; registry: string; kind: string; note: string }>;
};

function hasDigit(value: string): boolean {
  return /\d/.test(value);
}

/**
 * Davrdagi chiqishlar bo'yicha istisnolar: dalolatnomali vagonlar, raqamsiz plomba
 * yozuvlari (PLOMBASIZ, tashkilot plombasi va h.k.) va takror kelgan vagonlar.
 */
export function computeExceptionReport(
  arrivals: EmptyWagonArrival[],
  registries: LoadingRegistry[],
  mode: ReportMode,
  periodKey: string,
): ExceptionReport {
  const arrivalById = new Map(arrivals.map(a => [a.id, a]));
  const unitByVisit = buildVisitUnitMap(arrivals);
  const visitsByWagon = new Map<string, number>();
  for (const a of arrivals) {
    if (skipArrival(a)) continue;
    for (const u of arrivalUnits(a)) {
      const key = (u.wagonNumber || '').trim().toLowerCase();
      if (!key) continue;
      visitsByWagon.set(key, (visitsByWagon.get(key) ?? 0) + 1);
    }
  }

  const report: ExceptionReport = {
    exitedWagons: 0, sealChecked: 0, defective: 0, sealTextOnly: 0, noSeal: 0, repeatVisits: 0, rows: [],
  };
  const countedRepeat = new Set<string>();

  for (const r of registries) {
    if (!inPeriod(r.exitedToKengsoyAt, mode, periodKey)) continue;
    if ((r.registryNumber || '').includes('-1C-')) continue;
    const arrival = arrivalById.get(r.emptyWagonArrivalId);
    if (arrival && skipArrival(arrival)) continue;

    for (const route of r.wagonRoutes ?? []) {
      report.exitedWagons += 1;
      const wagon = (route.wagonNumber || '').trim();
      const key = wagon.toLowerCase();
      // Plomba yuk xati yozuvida saqlanmaydi — aynan shu tashrifdagi vagondan o'qiladi.
      const unit = unitByVisit.get(visitKeyOf(route, r.emptyWagonArrivalId));
      const seal = (unit?.sealNumber || '').trim();

      if (route.isDefective) {
        report.defective += 1;
        report.rows.push({
          id: `${r.id}-${wagon}-def`, wagon, registry: r.registryNumber,
          kind: 'Dalolatnoma', note: route.defectReason || route.defectActFileName || 'Nomuvofiqlik',
        });
      }
      if (unit) {
        report.sealChecked += 1;
        if (!seal) {
          report.noSeal += 1;
          report.rows.push({
            id: `${r.id}-${wagon}-nos`, wagon, registry: r.registryNumber,
            kind: 'Plombasiz', note: 'Plomba maydoni bo‘sh',
          });
        } else if (!hasDigit(seal)) {
          report.sealTextOnly += 1;
          report.rows.push({
            id: `${r.id}-${wagon}-txt`, wagon, registry: r.registryNumber,
            kind: 'Raqamsiz plomba', note: seal,
          });
        }
      }
      if (key && (visitsByWagon.get(key) ?? 0) > 1 && !countedRepeat.has(`${r.id}-${key}`)) {
        countedRepeat.add(`${r.id}-${key}`);
        report.repeatVisits += 1;
        report.rows.push({
          id: `${r.id}-${wagon}-rep`, wagon, registry: r.registryNumber,
          kind: 'Takror tashrif', note: `${visitsByWagon.get(key)} marta kelgan`,
        });
      }
    }
  }

  return report;
}
