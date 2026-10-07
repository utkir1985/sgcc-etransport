import type { EmptyWagonArrival, EmptyWagonUnit, LoadingRegistry } from '../types';
import { isOneCArrival } from './oneCSources';
import { isReadyForWaybill, registeredVisitKeys, wagonVisitKey } from './wagonQueueState';

export type WagonWorkTab = 'ready' | 'loading' | 'done' | 'exit';
type WorkArrival = Pick<EmptyWagonArrival, 'id' | 'arrivalNumber' | 'stage' | 'wagons' | 'wagonNumbers'>;
const statuses = new Set(['Estakada','Tared','AwaitingTare','Loading','ToRailwayScale','Loaded','GrossWeighed','SealPending','Sealed','Returned']);
export function wagonWorkTab(unit: EmptyWagonUnit, registered = false): WagonWorkTab {
  if (registered || Boolean(unit.defectActNumber != null && String(unit.defectActNumber).trim()) || (unit.status === 'Returned' && unit.defectActUploadedAt)) return 'exit';
  if (unit.status === 'Returned') return unit.loadingCompletedAt ? 'done' : unit.loadingStartedAt ? 'loading' : 'ready';
  if (isReadyForWaybill(unit)) return 'exit';
  if (['Loaded','GrossWeighed','SealPending','Sealed','ToRailwayScale'].includes(unit.status) || unit.loadingCompletedAt || Boolean(unit.grossWeight != null && String(unit.grossWeight).trim())) return 'done';
  if (unit.status === 'Loading' || (unit.loadingStartedAt && !unit.loadingCompletedAt)) return 'loading';
  return 'ready';
}
export function workUnits(arrival: WorkArrival): EmptyWagonUnit[] {
  if (arrival.wagons?.length) return arrival.wagons;
  if (['Exited','ExitedToKengsoy','Cancelled'].includes(arrival.stage || '')) return [];
  return (arrival.wagonNumbers || '').split(',').map(n => n.trim()).filter(Boolean).map((wagonNumber, sortOrder) => ({
    id: `${arrival.id}-${wagonNumber}`, wagonNumber, sortOrder, cisternNumber:'',
    status: arrival.stage === 'EstakadaPlaced' ? 'Estakada' : arrival.stage === 'Loading' ? 'Loading' : 'Loaded',
    tareWeight:'',grossWeight:'',nettoWeight:null,loadingComment:'',
  }));
}
export function activeRegistryMap(arrivals: WorkArrival[], registries: LoadingRegistry[]): Map<string,string> {
  const result = new Map<string,string>();
  const expanded = arrivals.map(a => ({...a, wagons:workUnits(a)}));
  for (const registry of registries.filter(r => !r.exitedToKengsoyAt))
    for (const key of registeredVisitKeys([registry], expanded)) result.set(key, registry.registryNumber || '—');
  return result;
}
export function buildWagonWorkCards<T extends WorkArrival>(arrivals: T[], registries: LoadingRegistry[]) {
  const expanded = arrivals.map(a => ({...a, wagons:workUnits(a)}));
  const exited = registeredVisitKeys(registries.filter(r => Boolean(r.exitedToKengsoyAt)), expanded);
  const registered = activeRegistryMap(arrivals, registries);
  const seen = new Set<string>();
  const cards: {arrival:T; unit:EmptyWagonUnit; tab:WagonWorkTab; registryNumber?:string}[] = [];
  for (const arrival of arrivals) {
    if (arrival.stage === 'Cancelled' || isOneCArrival(arrival)) continue;
    for (const unit of workUnits(arrival)) {
      const key = wagonVisitKey(arrival.id,unit.wagonNumber);
      if (!String(unit.wagonNumber || '').trim() || unit.scaleExitedAt || exited.has(key) || seen.has(key) || !statuses.has(unit.status)) continue;
      seen.add(key);
      const registryNumber = registered.get(key);
      cards.push({arrival,unit,tab:wagonWorkTab(unit,Boolean(registryNumber)),registryNumber});
    }
  }
  return cards;
}
