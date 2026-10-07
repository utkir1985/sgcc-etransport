import type { EmptyWagonArrival, EmptyWagonUnit, LoadingRegistry } from '../types';

type Evidence = Pick<EmptyWagonUnit, 'status' | 'tareWeight' | 'grossWeight' | 'sealNumber' | 'sealConfirmedByScaleAt' | 'sealConfirmedBySecurityAt'> & {
  defectActNumber?: string | null;
};
/** Backenddagi TryParseWeight bilan bir xil tozalash: «70 tn», «70,5» kabi yozuvlar ham o‘qiladi. */
function parseWeight(value: string | number | null | undefined): number {
  if (value == null) return NaN;
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  const cleaned = String(value).replace(/ tn/gi, '').replace(',', '.').replace(/[^0-9.-]/g, '').trim();
  if (!cleaned) return NaN;
  return Number(cleaned);
}
export function hasMeasuredNet(unit: Pick<Evidence, 'tareWeight' | 'grossWeight'>): boolean {
  const tare = parseWeight(unit.tareWeight);
  const gross = parseWeight(unit.grossWeight);
  return Number.isFinite(tare) && Number.isFinite(gross) && tare > 0 && gross > tare;
}
export function isReadyForWaybill(unit: Evidence): boolean {
  if (unit.status === 'Returned' || unit.status === 'ToRailwayScale') return false;
  // Backend yuk xatini saqlashda musbat netto talab qiladi. Ekranda ham aynan shu mezon
  // ishlatiladi: matn kiritilgani (masalan tara 70, brutto 20) tayyorlik belgisi emas.
  const hasNet = hasMeasuredNet(unit);
  const hasSealOrDefectAct = Boolean(unit.sealNumber != null && String(unit.sealNumber).trim())
    || (unit.status === 'Returned' && Boolean(unit.defectActNumber != null && String(unit.defectActNumber).trim()));
  return Boolean(hasNet && hasSealOrDefectAct);
}
export function needsGrossReview(unit: Evidence): boolean {
  if (unit.status === 'SealPending' || unit.status === 'Sealed') return false;
  return unit.status === 'ToRailwayScale'
    || unit.status === 'Loaded'
    || (unit.status === 'GrossWeighed' && !hasMeasuredNet(unit));
}
export function needsSealWork(unit: Evidence): boolean {
  return unit.status !== 'Returned'
    && unit.status !== 'ToRailwayScale'
    && hasMeasuredNet(unit)
    && !isReadyForWaybill(unit)
    && (['GrossWeighed', 'SealPending', 'Sealed'].includes(unit.status)
      || (unit.status === 'ToRailwayScale' && hasMeasuredNet(unit)));
}
export const wagonVisitKey = (arrivalId: string, number: string) => `${arrivalId.trim()}:${number.trim()}`.toLowerCase();
export function registeredVisitKeys(registries: LoadingRegistry[], arrivals: Pick<EmptyWagonArrival, 'id' | 'wagons'>[]): Set<string> {
  const keys = new Set<string>();
  for (const registry of registries) {
    if (registry.wagonRoutes?.length) {
      for (const route of registry.wagonRoutes) {
        const source = route.sourceArrivalId || registry.emptyWagonArrivalId;
        if (source && route.wagonNumber) keys.add(wagonVisitKey(source, route.wagonNumber));
      }
    } else {
      for (const unit of arrivals.find(a => a.id === registry.emptyWagonArrivalId)?.wagons ?? []) {
        keys.add(wagonVisitKey(registry.emptyWagonArrivalId, unit.wagonNumber));
      }
    }
  }
  return keys;
}
export function unregisteredArrivals(arrivals: EmptyWagonArrival[], registries: LoadingRegistry[]): EmptyWagonArrival[] {
  const keys = registeredVisitKeys(registries, arrivals);
  return arrivals.map(a => ({ ...a, wagons: (a.wagons ?? []).filter(u => !u.scaleExitedAt && !keys.has(wagonVisitKey(a.id, u.wagonNumber))) }));
}
