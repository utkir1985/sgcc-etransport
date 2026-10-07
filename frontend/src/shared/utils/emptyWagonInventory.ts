import type { EmptyWagonArrival, EmptyWagonUnit } from '../types';
import { normalizeWagonOwnership, WAGON_OWNERSHIP } from '../constants/wagonOwnership';

const ON_SITE_STAGES = new Set([
  'ReadyForEstakada',
  'TareWeighing',
  'EstakadaPlaced',
  'Loading',
]);

const READY_LOAD_STAGES = new Set(['EstakadaPlaced']);

export type EmptyWagonInventoryStats = {
  /** Zavodga kiritilgan, hali chiqmagan (estakada / yuklash). */
  onSiteTotal: number;
  onSiteMajmua: number;
  onSiteTashqi: number;
  onSiteContainers: number;
  /** Estakadaga qo‘yilgan — yuklash / taqsimot uchun tayyor. */
  readyTotal: number;
  readyMajmua: number;
  readyTashqi: number;
  readyContainers: number;
};

function parseContainers(raw?: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/\s*[|;·]\s*|\s*,\s*/)
    .map(v => v.trim())
    .filter(Boolean);
}

function unitsOf(arrival: EmptyWagonArrival): Array<Pick<EmptyWagonUnit, 'wagonNumber' | 'cisternNumber' | 'ownership' | 'wagonType'>> {
  if (arrival.wagons?.length) return arrival.wagons;
  const numbers = (arrival.wagonNumbers || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return numbers.map(wagonNumber => ({
    wagonNumber,
    cisternNumber: '',
    wagonType: '',
    ownership: WAGON_OWNERSHIP.Tashqi,
  }));
}

function accumulate(
  arrivals: EmptyWagonArrival[],
  stages: Set<string>,
): { total: number; majmua: number; tashqi: number; containers: number } {
  let total = 0;
  let majmua = 0;
  let tashqi = 0;
  let containers = 0;

  for (const a of arrivals) {
    if (a.arrivalNumber?.startsWith('1C-')) continue;
    const stage = a.stage || '';
    if (!stages.has(stage)) continue;

    const units = unitsOf(a);
    if (units.length === 0) {
      total += a.wagonCount || 0;
      continue;
    }
    for (const u of units) {
      total += 1;
      if (normalizeWagonOwnership(u.ownership) === WAGON_OWNERSHIP.Majmua) majmua += 1;
      else tashqi += 1;
      if (u.wagonType?.toLowerCase() === 'platform')
        containers += parseContainers(u.cisternNumber).length;
    }
  }

  return { total, majmua, tashqi, containers };
}

/** Zavod hududi va yuklashga tayyor vagonlar fondi. */
export function computeEmptyWagonInventory(arrivals: EmptyWagonArrival[]): EmptyWagonInventoryStats {
  const onSite = accumulate(arrivals, ON_SITE_STAGES);
  const ready = accumulate(arrivals, READY_LOAD_STAGES);
  return {
    onSiteTotal: onSite.total,
    onSiteMajmua: onSite.majmua,
    onSiteTashqi: onSite.tashqi,
    onSiteContainers: onSite.containers,
    readyTotal: ready.total,
    readyMajmua: ready.majmua,
    readyTashqi: ready.tashqi,
    readyContainers: ready.containers,
  };
}
