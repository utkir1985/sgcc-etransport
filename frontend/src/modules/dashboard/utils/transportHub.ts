import { buildWagonWorkCards, type WagonWorkTab } from '../../../shared/utils/wagonWorkState';
import { isReadyForWaybill } from '../../../shared/utils/wagonQueueState';
import type { CatalogContainer, CatalogFleetWagon, EmptyWagonArrival, EmptyWagonUnit, LoadingRegistry } from '../../../shared/types';
import { normalizeWagonOwnership, WAGON_OWNERSHIP } from '../../../shared/constants/wagonOwnership';
import { isWagonKind, type WagonKind, WAGON_KIND_LABEL } from '../../../shared/utils/wagonKinds';
import { isOneCArrival } from '../../../shared/utils/oneCSources';
import { isDashboardOnSiteStage } from '../../../shared/utils/dashboardOverview';
import {
  latestSecurityIssueNote,
  parseArrivalIssueNotes,
} from '../../../shared/utils/arrivalIssueNotes';
import { arrivalUnits, productTitle, STAGE_LABEL_UZ, wagonCountOf } from './sharedPanels';

export const INCOMING_STAGES = new Set([
  'RailwayInspected',
  'KengsoyInspection',
  'SecurityInspection',
]);

export const LOADING_STAGES = new Set([
  'ReadyForEstakada',
  'TareWeighing',
  'EstakadaPlaced',
  'Loading',
  'Loaded',
]);

export const READY_TO_EXIT_STAGES = new Set([
  'ToRailwayScale',
  'GrossWeighed',
  'SealInstallation',
  'SealPending',
  'Sealed',
  'RegistryPrepared',
  'DocumentsIssued',
  'PermitAndSecurityApproved',
]);

export type TransportLane =
  | 'overview'
  | 'park'
  | 'containers'
  | 'onsite'
  | 'incoming'
  | 'outgoing'
  | 'attention';

export type KamchilikWagonRow = {
  id: string;
  wagonNumber: string;
  arrivalNumber: string;
  product: string;
  wagonKind?: string;
  ownership?: string;
  stage: string;
  issue: string;
  at: string;
  source: 'security' | 'loading' | 'tare';
};

/** Majmuadagi vagonlar — joriy hudud holati (SHGKM) vagon qatori. */
export type OnSiteWagonRow = {
  id: string;
  wagonNumber: string;
  wagonKind: string;
  ownership: string;
  holat: string;
  source: 'fleet' | 'process';
  daysUntilNextDepotRepair?: number | null;
  serviceability?: string | null;
};

/** Majmuadagi vagonlar — joriy bosqich bo‘yicha vagon qatori. */
export type TransportFlowRow = {
  id: string;
  arrivalId?: string;
  wagonNumber: string;
  cisternNumber?: string;
  arrivalNumber: string;
  product: string;
  wagonKind: string;
  ownership: string;
  stage: string;
  at: string;
  issue?: string;
  isDefective?: boolean;
  isSealed?: boolean;
  sealNumber?: string;
  nettoWeight?: string | null;
  tareWeight?: string;
  grossWeight?: string;
};

function unitsForFlow(arrival: EmptyWagonArrival) {
  return arrival.wagons?.length ? arrival.wagons : arrivalUnits(arrival);
}

function flowStamp(...values: Array<string | null | undefined>): string {
  return values.find(value => Boolean(value && String(value).trim())) || '';
}

function toFlowRow(
  arrival: EmptyWagonArrival,
  unit: ReturnType<typeof unitsForFlow>[number] | null,
  at: string,
  stage: string,
  issue?: string,
  extra?: { isDefective?: boolean; isSealed?: boolean },
): TransportFlowRow {
  const wagonNumber = unit?.wagonNumber?.trim() || '—';
  const u = unit as Partial<EmptyWagonUnit> | undefined;
  return {
    id: `${arrival.id}-${wagonNumber}-${stage}`,
    arrivalId: arrival.id,
    wagonNumber,
    cisternNumber: u?.cisternNumber,
    arrivalNumber: arrival.arrivalNumber,
    product: productTitle(u?.productType || arrival.productType),
    wagonKind: unit?.wagonType || 'sisterna',
    ownership: unit?.ownership || WAGON_OWNERSHIP.Tashqi,
    stage,
    at,
    issue,
    isDefective: extra?.isDefective,
    isSealed: extra?.isSealed,
    sealNumber: u?.sealNumber,
    nettoWeight: u?.nettoWeight,
    tareWeight: u?.tareWeight,
    grossWeight: u?.grossWeight,
  };
}

function sortFlowRows(rows: TransportFlowRow[]): TransportFlowRow[] {
  return rows.sort((a, b) => {
    const byDate = (b.at || '').localeCompare(a.at || '');
    if (byDate !== 0) return byDate;
    return a.wagonNumber.localeCompare(b.wagonNumber, 'uz');
  });
}

export function transportOwnershipLabel(value?: string | null): string {
  return normalizeWagonOwnership(value) === WAGON_OWNERSHIP.Majmua
    ? 'Majmuaga tegishli'
    : 'Tashqi vagon';
}

export function buildOnSiteWagonRows(
  fleet: CatalogFleetWagon[],
  arrivals: EmptyWagonArrival[],
): OnSiteWagonRow[] {
  const byNumber = new Map<string, OnSiteWagonRow>();

  for (const w of fleet) {
    if (w.isActive === false || !isShgkmStation(w.destinationStation)) continue;
    const num = w.wagonNumber.trim();

    const holat =
      w.serviceability === 'eslatma'
        ? 'Eslatma'
        : w.serviceability === 'yaroqsiz'
          ? 'Yaroqsiz'
          : 'Yaroqli';
    byNumber.set(num, {
      id: `fleet-${w.id}`,
      wagonNumber: num,
      wagonKind: w.wagonKind || 'sisterna',
      ownership: w.ownership || WAGON_OWNERSHIP.Tashqi,
      holat,
      source: 'fleet',
      daysUntilNextDepotRepair: w.daysUntilNextDepotRepair,
      serviceability: w.serviceability,
    });
  }

  for (const a of filterOnSite(arrivals)) {
    const units = a.wagons?.length ? a.wagons : arrivalUnits(a);
    const stageLabel = STAGE_LABEL_UZ[a.stage || ''] || a.stage || 'Jarayonda';
    for (const raw of units) {
      const u = raw as EmptyWagonUnit;
      if (!u.wagonNumber?.trim() || u.status === 'Returned') continue;
      byNumber.set(u.wagonNumber.trim(), {
        id: `proc-${a.id}-${u.wagonNumber}`,
        wagonNumber: u.wagonNumber.trim(),
        wagonKind: u.wagonType || 'sisterna',
        ownership: u.ownership || WAGON_OWNERSHIP.Tashqi,
        holat: stageLabel,
        source: 'process',
      });
    }
  }

  return [...byNumber.values()].sort((a, b) => a.wagonNumber.localeCompare(b.wagonNumber));
}

export function resolveWagonKind(value?: string | null): WagonKind {
  return isWagonKind(value) ? value : 'sisterna';
}

export function kindLabel(value?: string | null): string {
  return WAGON_KIND_LABEL[resolveWagonKind(value)];
}

export function isShgkmStation(station?: string | null): boolean {
  return (station || '').toLowerCase().includes('shgkm');
}

export function liveArrivals(arrivals: EmptyWagonArrival[]): EmptyWagonArrival[] {
  return arrivals.filter(a =>
    !a.arrivalNumber?.startsWith('1C-')
    && !isOneCArrival(a)
    && ((a.stage || '') !== 'Exited' || unitsForFlow(a).some(u => !(u as any).scaleExitedAt))
    && (a.stage || '') !== 'Cancelled',
  );
}

export function filterIncoming(arrivals: EmptyWagonArrival[]): EmptyWagonArrival[] {
  return liveArrivals(arrivals).filter(a => INCOMING_STAGES.has(a.stage || ''));
}

export function filterLoadingStage(arrivals: EmptyWagonArrival[]): EmptyWagonArrival[] {
  return liveArrivals(arrivals).filter(a => LOADING_STAGES.has(a.stage || ''));
}

export function buildLoadingStageWagonRows(arrivals: EmptyWagonArrival[]): OnSiteWagonRow[] {
  const rows: OnSiteWagonRow[] = [];
  for (const a of filterLoadingStage(arrivals)) {
    const units = a.wagons?.length ? a.wagons : arrivalUnits(a);
    const stageLabel = STAGE_LABEL_UZ[a.stage || ''] || a.stage || 'Jarayonda';
    for (const raw of units) {
      const u = raw as EmptyWagonUnit;
      if (!u.wagonNumber?.trim() || u.status === 'Returned') continue;
      rows.push({
        id: `load-${a.id}-${u.wagonNumber}`,
        wagonNumber: u.wagonNumber.trim(),
        wagonKind: u.wagonType || 'sisterna',
        ownership: u.ownership || WAGON_OWNERSHIP.Tashqi,
        holat: stageLabel,
        source: 'process',
      });
    }
  }
  return rows.sort((a, b) => a.wagonNumber.localeCompare(b.wagonNumber));
}

export function filterOnSite(arrivals: EmptyWagonArrival[]): EmptyWagonArrival[] {
  return liveArrivals(arrivals).filter(a => isDashboardOnSiteStage(a.stage));
}

export function filterOutgoing(arrivals: EmptyWagonArrival[]): EmptyWagonArrival[] {
  return arrivals.filter(a =>
    !a.arrivalNumber?.startsWith('1C-')
    && !isOneCArrival(a)
    && (a.stage || '') !== 'Cancelled'
    && READY_TO_EXIT_STAGES.has(a.stage || ''),
  );
}

export function filterSecurityIssues(arrivals: EmptyWagonArrival[]): EmptyWagonArrival[] {
  return liveArrivals(arrivals).filter(a => !!latestSecurityIssueNote(a.notes));
}

function isWagonDefectResolved(u?: Partial<EmptyWagonUnit> | null): boolean {
  if (!u) return false;
  const st = (u.status || '').toLowerCase();
  if (
    st === 'sealed'
    || st === 'sealpending'
    || st === 'grossweighed'
    || st === 'loaded'
    || st === 'dispatched'
    || st === 'exited'
  ) {
    return true;
  }
  if (u.grossWeight && parseFloat(String(u.grossWeight)) > 0) {
    return true;
  }
  if (u.sealNumber && u.sealNumber.trim().length > 0) {
    return true;
  }
  return false;
}

/** Qo‘riqlash (kiruvchi) + tara + yuklash nuqsonlari — vagon qatorlari. */
export function buildKamchilikWagonRows(arrivals: EmptyWagonArrival[]): KamchilikWagonRow[] {
  const rows: KamchilikWagonRow[] = [];
  const seen = new Set<string>();

  for (const a of liveArrivals(arrivals)) {
    const units = a.wagons?.length
      ? a.wagons
      : arrivalUnits(a).map(u => ({ ...u, status: '', loadingComment: '', productType: a.productType }));
    const issues = parseArrivalIssueNotes(a.notes);

    if (INCOMING_STAGES.has(a.stage || '')) {
      const security = [...issues].reverse().find(i => i.kind === 'security');
      if (security) {
        if (units.length === 0) {
          const id = `${a.id}-sec`;
          if (!seen.has(id)) {
            seen.add(id);
            rows.push({
              id,
              wagonNumber: '—',
              arrivalNumber: a.arrivalNumber,
              product: productTitle(a.productType),
              stage: STAGE_LABEL_UZ[a.stage || ''] || a.stage || '—',
              issue: security.reason,
              at: a.createdAt || a.arrivalDate || '',
              source: 'security',
            });
          }
        } else {
          for (const u of units) {
            if (isWagonDefectResolved(u)) continue;
            const id = `${a.id}-sec-${u.wagonNumber}`;
            if (seen.has(id)) continue;
            seen.add(id);
            rows.push({
              id,
              wagonNumber: u.wagonNumber,
              arrivalNumber: a.arrivalNumber,
              product: productTitle(u.productType || a.productType),
              stage: STAGE_LABEL_UZ[a.stage || ''] || a.stage || '—',
              issue: security.reason,
              at: a.createdAt || a.arrivalDate || '',
              source: 'security',
            });
          }
        }
      }

      const tareParty = [...issues].reverse().find(i => i.kind === 'tare' && !i.wagonNumber);
      if (tareParty && !issues.some(i => i.kind === 'tare' && i.wagonNumber)) {
        const id = `${a.id}-tare-party`;
        if (!seen.has(id)) {
          seen.add(id);
          rows.push({
            id,
            wagonNumber: '—',
            arrivalNumber: a.arrivalNumber,
            product: productTitle(a.productType),
            stage: 'Tara · qaytarilgan',
            issue: tareParty.reason,
            at: a.createdAt || a.arrivalDate || '',
            source: 'tare',
          });
        }
      }
    }

    const tareByWagon = new Map<string, string>();
    for (const issue of issues) {
      if (issue.kind !== 'tare') continue;
      const w = issue.wagonNumber || '';
      if (w) {
        const u = units.find(item => item.wagonNumber === w);
        if (isWagonDefectResolved(u)) continue;
        tareByWagon.set(w, issue.reason);
      }
    }
    for (const u of units) {
      if (isWagonDefectResolved(u)) continue;
      if (u.status === 'Returned' && tareByWagon.has(u.wagonNumber)) {
        const id = `${a.id}-tare-${u.wagonNumber}`;
        if (seen.has(id)) continue;
        seen.add(id);
        rows.push({
          id,
          wagonNumber: u.wagonNumber,
          arrivalNumber: a.arrivalNumber,
          product: productTitle(u.productType || a.productType),
          stage: 'Tara · qaytarilgan',
          issue: tareByWagon.get(u.wagonNumber) || u.loadingComment || 'Nuqson',
          at: a.createdAt || a.arrivalDate || '',
          source: 'tare',
        });
      } else if (u.status === 'Returned' && !tareByWagon.has(u.wagonNumber)) {
        // Yuklash qaytarishi pastda; tara Returned bo‘lsa lekin note yo‘q
        const hasLoadingNote = issues.some(
          i => i.kind === 'loading' && (i.wagonNumber === u.wagonNumber || !i.wagonNumber),
        );
        if (!hasLoadingNote && (a.stage === 'ReadyForEstakada' || a.stage === 'TareWeighing' || a.stage === 'KengsoyInspection')) {
          const id = `${a.id}-tare-${u.wagonNumber}`;
          if (!seen.has(id)) {
            seen.add(id);
            rows.push({
              id,
              wagonNumber: u.wagonNumber,
              arrivalNumber: a.arrivalNumber,
              product: productTitle(u.productType || a.productType),
              stage: 'Tara · qaytarilgan',
              issue: u.loadingComment || 'Tara nuqsoni',
              at: a.createdAt || a.arrivalDate || '',
              source: 'tare',
            });
          }
        }
      }
    }
    for (const [wagonNumber, reason] of tareByWagon) {
      const u = units.find(item => item.wagonNumber === wagonNumber);
      if (isWagonDefectResolved(u)) continue;
      const id = `${a.id}-tare-${wagonNumber}`;
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push({
        id,
        wagonNumber,
        arrivalNumber: a.arrivalNumber,
        product: productTitle(u?.productType || a.productType),
        stage: 'Tara · qaytarilgan',
        issue: reason,
        at: a.createdAt || a.arrivalDate || '',
        source: 'tare',
      });
    }

    const loadingByWagon = new Map<string, string>();
    for (const issue of issues) {
      if (issue.kind !== 'loading') continue;
      const w = issue.wagonNumber || '';
      if (w) {
        const u = units.find(item => item.wagonNumber === w);
        if (isWagonDefectResolved(u)) continue;
        loadingByWagon.set(w, issue.reason);
      }
    }
    for (const u of units) {
      if (isWagonDefectResolved(u)) continue;
      if (u.status === 'Returned' || loadingByWagon.has(u.wagonNumber)) {
        if (tareByWagon.has(u.wagonNumber)) continue;
        const id = `${a.id}-load-${u.wagonNumber}`;
        if (seen.has(id)) continue;
        seen.add(id);
        rows.push({
          id,
          wagonNumber: u.wagonNumber,
          arrivalNumber: a.arrivalNumber,
          product: productTitle(u.productType || a.productType),
          stage: 'Yuklash · qaytarilgan',
          issue: loadingByWagon.get(u.wagonNumber) || u.loadingComment || 'Nuqson',
          at: a.createdAt || a.arrivalDate || '',
          source: 'loading',
        });
      }
    }
    for (const [wagonNumber, reason] of loadingByWagon) {
      const u = units.find(item => item.wagonNumber === wagonNumber);
      if (isWagonDefectResolved(u)) continue;
      const id = `${a.id}-load-${wagonNumber}`;
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push({
        id,
        wagonNumber,
        arrivalNumber: a.arrivalNumber,
        product: productTitle(u?.productType || a.productType),
        stage: 'Yuklash · qaytarilgan',
        issue: reason,
        at: a.createdAt || a.arrivalDate || '',
        source: 'loading',
      });
    }
  }

  return rows;
}

export function overdueFleet(fleet: CatalogFleetWagon[]): CatalogFleetWagon[] {
  return fleet.filter(w => typeof w.daysUntilNextDepotRepair === 'number' && w.daysUntilNextDepotRepair <= 30);
}

export function overdueContainers(containers: CatalogContainer[]): CatalogContainer[] {
  return containers.filter(c =>
    typeof c.daysUntilNextInspection === 'number' && c.daysUntilNextInspection <= 30,
  );
}

export function countByKind(fleet: CatalogFleetWagon[]): Record<WagonKind, number> {
  const out: Record<WagonKind, number> = { sisterna: 0, closed: 0, platform: 0 };
  for (const w of fleet) out[resolveWagonKind(w.wagonKind)] += 1;
  return out;
}

export function countOnSiteByKind(rows: OnSiteWagonRow[]): Record<WagonKind, number> {
  const out: Record<WagonKind, number> = { sisterna: 0, closed: 0, platform: 0 };
  for (const w of rows) out[resolveWagonKind(w.wagonKind)] += 1;
  return out;
}

export function countContainersOnSite(containers: CatalogContainer[]): number {
  return containers.filter(c => isShgkmStation(c.destinationStation)).length;
}

export function partyKindSummary(arrival: EmptyWagonArrival): string {
  const units = arrival.wagons?.length
    ? arrival.wagons
    : [];
  if (units.length === 0) return '—';
  const counts: Partial<Record<WagonKind, number>> = {};
  for (const u of units) {
    const k = resolveWagonKind(u.wagonType);
    counts[k] = (counts[k] || 0) + 1;
  }
  return (Object.entries(counts) as [WagonKind, number][])
    .map(([k, n]) => `${n} ${WAGON_KIND_LABEL[k].replace('Vagon-', '').replace(' turdagi vagon', '')}`)
    .join(' · ');
}

export function partyContainerCount(arrival: EmptyWagonArrival): number {
  const units = arrivalUnits(arrival);
  let n = 0;
  for (const u of units) {
    if (resolveWagonKind(u.wagonType) !== 'platform') continue;
    const raw = u.cisternNumber || '';
    if (!raw.trim()) continue;
    n += raw.split(/[|;]/).map(s => s.trim()).filter(Boolean).length;
  }
  return n;
}

function workFlowRows(arrivals: EmptyWagonArrival[], registries: LoadingRegistry[], tab: WagonWorkTab): TransportFlowRow[] {
  return sortFlowRows(buildWagonWorkCards(arrivals, registries).filter(c => c.tab === tab).map(({arrival,unit,registryNumber}) => {
    const defective = Boolean(unit.defectActNumber?.trim() || (unit.status === 'Returned' && unit.defectActUploadedAt));
    const stage = tab === 'ready' ? 'Yuklashga tayyor' : tab === 'loading' ? 'Yuklanmoqda' : tab === 'done' ? 'Yuklangan'
      : registryNumber ? `Yuk xatida (${registryNumber})` : defective ? 'Dalolatnoma asosida chiqishga tayyor' : 'Yuk xatiga tayyor';
    return toFlowRow(arrival, unit, flowStamp(arrival.arrivalDate, arrival.createdAt), stage, undefined,
      {isDefective:defective, isSealed:tab === 'exit' && !defective});
  }));
}

export function buildTaredFlowRows(arrivals: EmptyWagonArrival[], registries: LoadingRegistry[] = []): TransportFlowRow[] {
  return workFlowRows(arrivals, registries, 'ready');
}

export function buildLoadingFlowRows(arrivals: EmptyWagonArrival[], registries: LoadingRegistry[] = []): TransportFlowRow[] {
  return workFlowRows(arrivals, registries, 'loading');
}

/**
 * Chiqib ketmagan yuk xatlariga kiritilgan vagonlar: "arrivalId:vagon" / "arrivalNumber:vagon" → reyestr raqami.
 * Yuk xatiga kiritilgan vagon erkin fonddan chiqadi (yuk xati moduli nazoratida).
 */
export function buildRegisteredWagonMap(
  arrivals: EmptyWagonArrival[],
  registries: LoadingRegistry[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of registries) {
    if (r.exitedToKengsoyAt) continue;
    const number = r.registryNumber || '—';
    const routes = r.wagonRoutes ?? [];
    if (routes.length > 0) {
      routes.forEach(w => {
        const wNum = (w.wagonNumber || '').trim().toLowerCase();
        if (!wNum) return;
        if (w.sourceArrivalId) map.set(`${w.sourceArrivalId.toLowerCase()}:${wNum}`, number);
        if (w.sourceArrivalNumber) map.set(`${w.sourceArrivalNumber.toLowerCase()}:${wNum}`, number);
        if (r.emptyWagonArrivalId) map.set(`${r.emptyWagonArrivalId.toLowerCase()}:${wNum}`, number);
      });
    } else if (r.emptyWagonArrivalId) {
      const arr = arrivals.find(item => item.id.toLowerCase() === r.emptyWagonArrivalId.toLowerCase());
      if (arr) {
        unitsForFlow(arr).forEach(u => {
          const wNum = ((u as EmptyWagonUnit).wagonNumber || '').trim().toLowerCase();
          if (!wNum) return;
          map.set(`${arr.id.toLowerCase()}:${wNum}`, number);
          if (arr.arrivalNumber) map.set(`${arr.arrivalNumber.toLowerCase()}:${wNum}`, number);
        });
      }
    }
  }
  return map;
}

/** Plomba to‘liq tasdiqlangan (yuklangan + brutto/netto + plomba) — chiqishga tayyor. */
export function isUnitSealed(unit: EmptyWagonUnit): boolean {
  return isReadyForWaybill(unit);
}

/** Yuklangan: yuklash tugagan, brutto/netto va plomba hali jarayonda. */
export function buildLoadedFlowRows(arrivals: EmptyWagonArrival[], registries: LoadingRegistry[] = []): TransportFlowRow[] {
  return workFlowRows(arrivals, registries, 'done');
}

export function buildReadyToExitFlowRows(arrivals: EmptyWagonArrival[], registries: LoadingRegistry[] = []): TransportFlowRow[] {
  return sortFlowRows(
    buildWagonWorkCards(arrivals, registries)
      .filter(c => c.tab === 'exit')
      .map(({ arrival, unit, registryNumber }) => {
        const defective = Boolean(unit.defectActNumber?.trim() || (unit.status === 'Returned' && unit.defectActUploadedAt));
        const stage = registryNumber ? `Yuk xatida (${registryNumber})` : defective ? 'Dalolatnoma asosida chiqishga tayyor' : 'Tarkibga tayyor';
        return toFlowRow(arrival, unit, flowStamp(arrival.arrivalDate, arrival.createdAt), stage, undefined, {
          isDefective: defective,
          isSealed: !defective,
        });
      }),
  );
}

export function buildEnteredFlowRows(arrivals: EmptyWagonArrival[], registries: LoadingRegistry[] = []): TransportFlowRow[] {
  return buildTaredFlowRows(arrivals, registries);
}

export function buildDefectiveFlowRows(arrivals: EmptyWagonArrival[]): TransportFlowRow[] {
  return sortFlowRows(
    buildKamchilikWagonRows(arrivals).map(row => ({
      id: row.id,
      wagonNumber: row.wagonNumber,
      arrivalNumber: row.arrivalNumber,
      product: row.product,
      wagonKind: row.wagonKind || 'sisterna',
      ownership: row.ownership || WAGON_OWNERSHIP.Tashqi,
      stage: row.stage,
      at: row.at,
      issue: row.issue,
      isDefective: true,
    })),
  );
}

export type TransportFlowMetrics = {
  tared: { total: number; majmua: number };
  loading: { total: number; majmua: number };
  loaded: { total: number; majmua: number };
  ready: { total: number; majmua: number; sealed: number; defective: number };
  entered: { total: number; majmua: number };
  defective: { total: number; majmua: number };
  onSite: { total: number; majmua: number };
};

export function computeTransportFlowMetrics(
  arrivals: EmptyWagonArrival[],
  registries: LoadingRegistry[] = [],
): TransportFlowMetrics {
  const taredRows = buildTaredFlowRows(arrivals, registries);
  const loadingRows = buildLoadingFlowRows(arrivals, registries);
  const loadedRows = buildLoadedFlowRows(arrivals, registries);
  const readyRows = buildReadyToExitFlowRows(arrivals, registries);
  const defectiveRows = buildDefectiveFlowRows(arrivals);

  const isMajmua = (r: { ownership?: string }) =>
    normalizeWagonOwnership(r.ownership) === WAGON_OWNERSHIP.Majmua;

  const taredTotal = taredRows.length;
  const taredMajmua = taredRows.filter(isMajmua).length;

  const loadingTotal = loadingRows.length;
  const loadingMajmua = loadingRows.filter(isMajmua).length;

  const loadedTotal = loadedRows.length;
  const loadedMajmua = loadedRows.filter(isMajmua).length;

  const readyTotal = readyRows.length;
  const readyMajmua = readyRows.filter(isMajmua).length;
  const readySealed = readyRows.filter(r => r.isSealed).length;
  const readyDefective = readyRows.filter(r => r.isDefective).length;

  const defectiveTotal = defectiveRows.length;
  const defectiveMajmua = defectiveRows.filter(isMajmua).length;

  const onSiteTotal = taredTotal + loadingTotal + loadedTotal + readyTotal;
  const onSiteMajmua = taredMajmua + loadingMajmua + loadedMajmua + readyMajmua;

  return {
    tared: { total: taredTotal, majmua: taredMajmua },
    loading: { total: loadingTotal, majmua: loadingMajmua },
    loaded: { total: loadedTotal, majmua: loadedMajmua },
    ready: { total: readyTotal, majmua: readyMajmua, sealed: readySealed, defective: readyDefective },
    entered: { total: taredTotal, majmua: taredMajmua },
    defective: { total: defectiveTotal, majmua: defectiveMajmua },
    onSite: { total: onSiteTotal, majmua: onSiteMajmua },
  };
}

export { productTitle, STAGE_LABEL_UZ, wagonCountOf, latestSecurityIssueNote };
