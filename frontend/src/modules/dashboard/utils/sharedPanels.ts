import type { EmptyWagonArrival, EmptyWagonUnit, LoadingRegistry } from '../../../shared/types';
import { normalizeWagonOwnership, WAGON_OWNERSHIP } from '../../../shared/constants/wagonOwnership';
import { isOneCArrival } from '../../../shared/utils/oneCSources';
import { isDashboardOnSiteStage } from '../../../shared/utils/dashboardOverview';
import { getProductLabel } from '../../../shared/constants/productTypes';
import { LOGISTICS_TYPES } from '../../../shared/constants/logisticsTypes';
import { issueStampToSortable, parseArrivalIssueNotes } from '../../../shared/utils/arrivalIssueNotes';

export function arrivalUnits(
  arrival: EmptyWagonArrival,
): Array<Pick<EmptyWagonUnit, 'wagonNumber' | 'wagonType' | 'cisternNumber' | 'ownership' | 'nettoWeight' | 'tareWeight' | 'grossWeight'>> {
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

export function localDateKey(iso: string, timeZone = 'Asia/Tashkent'): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone });
}

export function monthKey(iso: string, timeZone = 'Asia/Tashkent'): string {
  return localDateKey(iso, timeZone).slice(0, 7);
}

/**
 * Hafta kaliti — shu sanani o‘z ichiga olgan haftaning dushanbasi (YYYY-MM-DD).
 * Hafta dushanbadan yakshanbagacha hisoblanadi.
 */
export function weekKey(iso: string, timeZone = 'Asia/Tashkent'): string {
  return weekStartOf(localDateKey(iso, timeZone));
}

/** Berilgan kun kalitidan (YYYY-MM-DD) shu hafta dushanbasini qaytaradi. */
export function weekStartOf(dayKey: string): string {
  const d = new Date(`${dayKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dayKey;
  const dow = (d.getDay() + 6) % 7; // dushanba = 0
  d.setDate(d.getDate() - dow);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Hafta kalitidan oxirgi kunini (yakshanba) qaytaradi. */
export function weekEndOf(weekStart: string): string {
  const d = new Date(`${weekStart}T12:00:00`);
  if (Number.isNaN(d.getTime())) return weekStart;
  d.setDate(d.getDate() + 6);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseTonValue(value?: string | null): number {
  if (!value?.trim()) return 0;
  const normalized = value.replace(',', '.').replace(/\s/g, '');
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return 0;
  const n = Number.parseFloat(match[0]);
  if (!Number.isFinite(n)) return 0;
  return n > 500 ? n / 1000 : n;
}

export function unitNettoTon(
  u: Pick<EmptyWagonUnit, 'nettoWeight' | 'tareWeight' | 'grossWeight'>,
): number {
  const fromNetto = parseTonValue(u.nettoWeight);
  if (fromNetto > 0) return fromNetto;
  const tare = parseTonValue(u.tareWeight);
  const gross = parseTonValue(u.grossWeight);
  if (tare > 0 && gross > tare) return gross - tare;
  return 0;
}

export function wagonCountOf(arrival: EmptyWagonArrival): number {
  const units = arrivalUnits(arrival);
  return units.length > 0 ? units.length : (arrival.wagonCount || 0);
}

/** Yuklangan vagonlar — kirgan partiya emas, haqiqiy yuklanganlar. */
const LOADED_UNIT_STATUSES = new Set([
  'Loaded',
  'ToRailwayScale',
  'GrossWeighed',
  'SealInstallation',
  'SealPending',
  'Sealed',
  'RegistryPrepared',
  'DocumentsIssued',
  'PermitAndSecurityApproved',
  'Exited',
]);

export function isUnitLoaded(unit: Pick<EmptyWagonUnit, 'status' | 'loadingCompletedAt'>): boolean {
  if (unit.loadingCompletedAt) return true;
  return LOADED_UNIT_STATUSES.has(unit.status || '');
}

export function loadedUnitsOf(arrival: EmptyWagonArrival): EmptyWagonUnit[] {
  const units = arrival.wagons ?? [];
  if (units.length === 0) return [];
  return units.filter(isUnitLoaded);
}

export function loadedWagonCountOf(arrival: EmptyWagonArrival): number {
  const loaded = loadedUnitsOf(arrival);
  if (loaded.length > 0) return loaded.length;
  // Unit holatlari bo‘lmasa, partiya yuklash yakunini faqat non-returned vagonlar bilan taxminlaymiz.
  if (!arrival.loadingCompletedAt) return 0;
  const units = arrival.wagons ?? [];
  if (units.length === 0) return arrival.wagonCount || 0;
  const eligible = units.filter(u => u.status !== 'Returned');
  return eligible.length > 0 ? eligible.length : 0;
}

export function loadedTonsOf(arrival: EmptyWagonArrival): number {
  const loaded = loadedUnitsOf(arrival);
  if (loaded.length > 0) {
    return Math.round(loaded.reduce((sum, u) => sum + unitNettoTon(u), 0) * 10) / 10;
  }
  if (!arrival.loadingCompletedAt) return 0;
  return Math.round(addTons(arrival) * 10) / 10;
}

/** Yuk xati / chiqish — reyestrdagi vagonlar. */
export function registryWagonCountOf(registry: LoadingRegistry): number {
  const routes = registry.wagonRoutes?.length ?? 0;
  if (routes > 0) return routes;
  return registry.wagonCount || registry.orderDeductedWagons || 0;
}

export type VisitUnit = NonNullable<EmptyWagonArrival['wagons']>[number];

/** (tashrif + vagon raqami) kaliti — qayta kelgan vagon yozuvlari chalkashmasligi uchun. */
export function visitUnitKey(arrivalId: string | null | undefined, wagonNumber: string): string {
  return `${arrivalId ?? ''}:${(wagonNumber || '').trim().toLowerCase()}`;
}

/** Barcha partiyalardagi vagon yozuvlarini (tashrif + vagon) bo'yicha indekslaydi. */
export function buildVisitUnitMap(arrivals: EmptyWagonArrival[]): Map<string, VisitUnit> {
  const map = new Map<string, VisitUnit>();
  for (const a of arrivals) {
    for (const u of a.wagons ?? []) {
      if (!u.wagonNumber?.trim()) continue;
      map.set(visitUnitKey(a.id, u.wagonNumber), u);
    }
  }
  return map;
}

/**
 * Yuk xatidagi vagonlarning umumiy nettosi.
 * Yuk xatiga boshqa partiyadan biriktirilgan vagon ham hisobga olinadi: har bir yozuv
 * o'z tashrifidagi vagondan o'qiladi (unitByVisit berilganda).
 */
export function registryTonsOf(
  registry: LoadingRegistry,
  arrival?: EmptyWagonArrival | null,
  unitByVisit?: Map<string, VisitUnit>,
): number {
  const routes = registry.wagonRoutes || [];

  if (unitByVisit && routes.length > 0) {
    let tons = 0;
    let resolved = 0;
    for (const route of routes) {
      const unit = unitByVisit.get(visitUnitKey(route.sourceArrivalId || registry.emptyWagonArrivalId, route.wagonNumber));
      if (!unit) continue;
      resolved += 1;
      tons += unitNettoTon(unit);
    }
    if (resolved > 0) return Math.round(tons * 10) / 10;
  }

  if (!arrival?.wagons?.length) {
    return Number(registry.orderDeductedNetWeight || 0);
  }
  const wanted = new Set(
    routes.map(r => r.wagonNumber.trim().toLowerCase()).filter(Boolean),
  );
  if (wanted.size === 0) {
    return Math.round(addTons(arrival) * 10) / 10;
  }
  let tons = 0;
  for (const u of arrival.wagons) {
    if (wanted.has(u.wagonNumber.trim().toLowerCase())) tons += unitNettoTon(u);
  }
  return Math.round(tons * 10) / 10;
}

export function ownershipSplit(arrival: EmptyWagonArrival): { majmua: number; tashqi: number } {
  const units = arrivalUnits(arrival);
  if (units.length === 0) {
    return { majmua: 0, tashqi: arrival.wagonCount || 0 };
  }
  let majmua = 0;
  let tashqi = 0;
  for (const u of units) {
    if (normalizeWagonOwnership(u.ownership) === WAGON_OWNERSHIP.Majmua) majmua += 1;
    else tashqi += 1;
  }
  return { majmua, tashqi };
}

export function productTitle(productType: string): string {
  return getProductLabel(productType, LOGISTICS_TYPES.Railway) || productType || '—';
}

export type ReportMode = 'daily' | 'weekly' | 'monthly';

export type ReportBucket = {
  wagons: number;
  tons: number;
};

export type ProductReportRow = {
  productType: string;
  label: string;
  kirish: ReportBucket;
  yuklash: ReportBucket;
  chiqish: ReportBucket;
};

export type PeriodReport = {
  kirish: ReportBucket;
  yuklash: ReportBucket;
  chiqish: ReportBucket;
  byProduct: ProductReportRow[];
};

function emptyBucket(): ReportBucket {
  return { wagons: 0, tons: 0 };
}

function inPeriod(iso: string | null | undefined, mode: ReportMode, key: string): boolean {
  if (!iso) return false;
  if (mode === 'daily') return localDateKey(iso) === key;
  if (mode === 'weekly') return weekKey(iso) === key;
  return monthKey(iso) === key;
}

function addTons(arrival: EmptyWagonArrival): number {
  const units = arrivalUnits(arrival);
  if (units.length === 0) return 0;
  return units.reduce((sum, u) => sum + unitNettoTon(u), 0);
}

function ensureProduct(
  map: Map<string, ProductReportRow>,
  productType: string,
): ProductReportRow {
  const key = productType || '—';
  let row = map.get(key);
  if (!row) {
    row = {
      productType: key,
      label: productTitle(key),
      kirish: emptyBucket(),
      yuklash: emptyBucket(),
      chiqish: emptyBucket(),
    };
    map.set(key, row);
  }
  return row;
}

export function computePeriodReport(
  arrivals: EmptyWagonArrival[],
  registries: LoadingRegistry[],
  mode: ReportMode,
  periodKey: string,
): PeriodReport {
  const kirish = emptyBucket();
  const yuklash = emptyBucket();
  const chiqish = emptyBucket();
  const byProduct = new Map<string, ProductReportRow>();
  const arrivalById = new Map(arrivals.map(a => [a.id, a]));
  const unitByVisit = buildVisitUnitMap(arrivals);

  for (const a of arrivals) {
    if (isOneCArrival(a) || a.arrivalNumber?.startsWith('1C-')) continue;
    const units = a.wagons ?? [];
    const enterAt = a.arrivalDate || a.createdAt;

    if (inPeriod(enterAt, mode, periodKey)) {
      // Kirish faqat vagon soni bilan o‘lchanadi. Vagon korxonaga bo‘sh kiradi va
      // bazada bitta tara / bitta brutto saqlanadi — ular yuklashdan keyingi o‘lchov.
      // Shu sababli «kirish tonnasi» degan ko‘rsatkichni hisoblab bo‘lmaydi.
      const w = wagonCountOf(a);
      kirish.wagons += w;
      const row = ensureProduct(byProduct, a.productType);
      row.kirish.wagons += w;
    }

    // Yuklash har bir vagonning o‘z sanasi bo‘yicha hisoblanadi. Partiyaga «yuklash tugadi»
    // belgisi qo‘yilmagan bo‘lsa ham, brutto tortilgan vagon hisobga tushadi.
    if (units.length > 0) {
      for (const u of units) {
        if (u.status === 'Returned') continue;
        const loadedAt = u.loadingCompletedAt || u.grossWeighedAt;
        if (!inPeriod(loadedAt, mode, periodKey)) continue;
        if (!isUnitLoaded(u) && !u.grossWeighedAt) continue;
        const t = unitNettoTon(u);
        yuklash.wagons += 1;
        yuklash.tons += t;
        const row = ensureProduct(byProduct, u.productType || a.productType);
        row.yuklash.wagons += 1;
        row.yuklash.tons += t;
      }
    } else if (inPeriod(a.loadingCompletedAt, mode, periodKey)) {
      // Eski yozuvlar: vagonlar ro‘yxati yo‘q, faqat partiya darajasidagi belgi bor.
      const w = loadedWagonCountOf(a);
      const t = loadedTonsOf(a);
      if (w > 0) {
        yuklash.wagons += w;
        yuklash.tons += t;
        const row = ensureProduct(byProduct, a.productType);
        row.yuklash.wagons += w;
        row.yuklash.tons += t;
      }
    }
  }

  for (const r of registries) {
    if (!inPeriod(r.exitedToKengsoyAt, mode, periodKey)) continue;
    if ((r.registryNumber || '').includes('-1C-')) continue;

    const arrival = arrivalById.get(r.emptyWagonArrivalId);
    if (arrival && (isOneCArrival(arrival) || arrival.arrivalNumber?.startsWith('1C-'))) continue;

    const w = registryWagonCountOf(r);
    const t = registryTonsOf(r, arrival, unitByVisit);
    chiqish.wagons += w;
    chiqish.tons += t;

    // Mahsulot kesimi har bir vagonning o‘z yozuvidan olinadi: bitta partiyada
    // turli mahsulot bo‘lishi mumkin, partiya turi butun yuk xatiga yozilmaydi.
    const routes = r.wagonRoutes ?? [];
    if (routes.length > 0) {
      for (const route of routes) {
        const unit = unitByVisit.get(visitUnitKey(route.sourceArrivalId || r.emptyWagonArrivalId, route.wagonNumber));
        const product = unit?.productType || route.productType || r.productType || arrival?.productType || '—';
        const row = ensureProduct(byProduct, product);
        row.chiqish.wagons += 1;
        row.chiqish.tons += unit ? unitNettoTon(unit) : 0;
      }
    } else {
      const row = ensureProduct(byProduct, r.productType || arrival?.productType || '—');
      row.chiqish.wagons += w;
      row.chiqish.tons += t;
    }
  }

  kirish.tons = Math.round(kirish.tons * 10) / 10;
  yuklash.tons = Math.round(yuklash.tons * 10) / 10;
  chiqish.tons = Math.round(chiqish.tons * 10) / 10;

  const rows = [...byProduct.values()].sort((a, b) =>
    (b.kirish.wagons + b.yuklash.wagons + b.chiqish.wagons)
    - (a.kirish.wagons + a.yuklash.wagons + a.chiqish.wagons),
  );

  return { kirish, yuklash, chiqish, byProduct: rows };
}

export type OnSiteWagonRow = {
  id: string;
  arrivalId: string;
  arrivalNumber: string;
  wagonNumber: string;
  productType: string;
  productLabel: string;
  ownership: string;
  stage: string;
  trackNumber: string;
  createdAt: string;
};

export function listOnSiteWagons(arrivals: EmptyWagonArrival[]): OnSiteWagonRow[] {
  const rows: OnSiteWagonRow[] = [];
  for (const a of arrivals) {
    if (a.arrivalNumber?.startsWith('1C-') || isOneCArrival(a)) continue;
    if (!isDashboardOnSiteStage(a.stage)) continue;
    const units = arrivalUnits(a);
    if (units.length === 0) {
      rows.push({
        id: `${a.id}-party`,
        arrivalId: a.id,
        arrivalNumber: a.arrivalNumber,
        wagonNumber: '—',
        productType: a.productType,
        productLabel: productTitle(a.productType),
        ownership: WAGON_OWNERSHIP.Tashqi,
        stage: a.stage || '',
        trackNumber: a.trackNumber || '—',
        createdAt: a.createdAt,
      });
      continue;
    }
    for (const u of units) {
      rows.push({
        id: `${a.id}-${u.wagonNumber}`,
        arrivalId: a.id,
        arrivalNumber: a.arrivalNumber,
        wagonNumber: u.wagonNumber,
        productType: a.productType,
        productLabel: productTitle(a.productType),
        ownership: normalizeWagonOwnership(u.ownership),
        stage: a.stage || '',
        trackNumber: a.trackNumber || '—',
        createdAt: a.createdAt,
      });
    }
  }
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export type HistoryTimelineKind = 'entry' | 'order' | 'load' | 'exit' | 'defect';

export type HistoryTimelineSubEvent = {
  id: string;
  at: string;
  stage: string;
  tone: 'defect' | 'act' | 'return';
  title?: string;
  detail?: string;
  summary: string;
  actor: string;
  documentNumber?: string;
  documentFileName?: string;
  issueArea?: string;
  reason?: string;
};

export type HistoryTimelineItem = {
  id: string;
  at: string;
  title: string;
  detail: string;
  actor: string;
  kind: HistoryTimelineKind;
  productLabel: string;
  wagonNumbers: string[];
  wagonCount: number;
  summary: string;
  stageName?: string;
  department?: string;
  statusBadge?: string;
  extraInfo?: string;
  mainTitle?: string;
  subNote?: string;
  issueArea?: string;
  reason?: string;
  documentNumber?: string;
  documentFileName?: string;
  subEvents?: HistoryTimelineSubEvent[];
};

export function buildHistoryTimeline(
  arrivals: EmptyWagonArrival[],
  registries: LoadingRegistry[],
): HistoryTimelineItem[] {
  const items: HistoryTimelineItem[] = [];
  const arrivalById = new Map(arrivals.map(a => [a.id, a]));

  for (const a of arrivals) {
    if (a.arrivalNumber?.startsWith('1C-') || isOneCArrival(a)) continue;

    const partyWagons = arrivalUnits(a).map(unit => unit.wagonNumber).filter(Boolean);
    const productLabel = productTitle(a.productType);
    const enteredAt = a.arrivalDate || a.createdAt;

    // 1. KIRISH: Partiya qabuli (Temir yo'l sexi)
    if (enteredAt) {
      const count = wagonCountOf(a);
      items.push({
        id: `entry-${a.id}`,
        at: enteredAt,
        title: a.arrivalNumber,
        detail: `Kirish partiyasi qabul qilindi · ${productLabel} · ${count} vagon`,
        actor: a.createdByName || 'Temir yo‘l dispetcheri',
        department: 'Temir yo‘l sexi',
        stageName: 'Partiya qabuli',
        statusBadge: 'Qabul qilindi',
        kind: 'entry',
        productLabel,
        wagonNumbers: partyWagons,
        wagonCount: count,
        summary: productLabel,
        mainTitle: `Kirish · ${productLabel}`,
        subNote: `${count} vagon qabul qilindi`,
        extraInfo: a.trackNumber ? `${a.trackNumber}` : undefined,
      });
    }

    // 2. KIRISH: ICHDX smena boshlig'i kelishuvi
    if (a.entryPermitShiftApprovedAt) {
      items.push({
        id: `permit-shift-${a.id}`,
        at: a.entryPermitShiftApprovedAt,
        title: a.entryPermitNumber || a.arrivalNumber,
        detail: `ICHDX ko‘rigi kelishildi · ${partyWagons.length} vagon`,
        actor: a.entryPermitShiftApprovedByName || 'Smena boshlig‘i',
        department: 'ICHDX',
        stageName: 'ICHDX ko‘rigi (Kirish)',
        statusBadge: 'Kelishildi',
        kind: 'entry',
        productLabel,
        wagonNumbers: partyWagons,
        wagonCount: partyWagons.length,
        summary: 'ICHDX smena boshlig‘i kelishuvi',
        mainTitle: 'ICHDX ko‘rigi',
        subNote: a.entryPermitNumber ? `Ruxsatnoma № ${a.entryPermitNumber}` : '',
        documentNumber: a.entryPermitNumber,
      });
    }

    // 3. KIRISH: Ruxsatnoma byurosi kelishuvi
    if (a.entryPermitPermitApprovedAt) {
      items.push({
        id: `permit-prm-${a.id}`,
        at: a.entryPermitPermitApprovedAt,
        title: a.entryPermitNumber || a.arrivalNumber,
        detail: `Ruxsatnoma byurosi tasdiqladi · ${partyWagons.length} vagon`,
        actor: a.entryPermitPermitApprovedByName || 'Ruxsatnoma byurosi',
        department: 'Ruxsatnoma byurosi',
        stageName: 'Ruxsatnoma byurosi',
        statusBadge: 'Ruxsat berildi',
        kind: 'entry',
        productLabel,
        wagonNumbers: partyWagons,
        wagonCount: partyWagons.length,
        summary: 'Ruxsatnoma byurosi tasdig‘i',
        mainTitle: 'Ruxsatnoma tasdig‘i',
        documentNumber: a.entryPermitNumber,
      });
    }

    // 4. KIRISH: Qo'riqlash xizmati (XA sexi) ruxsati
    if (a.entryPermitSecurityApprovedAt) {
      items.push({
        id: `permit-sec-${a.id}`,
        at: a.entryPermitSecurityApprovedAt,
        title: a.entryPermitNumber || a.arrivalNumber,
        detail: `Qo‘riqlash (XA) ko‘rigidan o‘tkazildi va kirishga ruxsat berildi`,
        actor: a.entryPermitSecurityApprovedByName || 'Qo‘riqlash xizmati',
        department: 'Qo‘riqlash xizmati (XA)',
        stageName: 'Qo‘riqlash (XA) ruxsati',
        statusBadge: 'XA tasdiqladi',
        kind: 'entry',
        productLabel,
        wagonNumbers: partyWagons,
        wagonCount: partyWagons.length,
        summary: 'Qo‘riqlash xizmati (XA) ko‘rigi va ruxsati',
        mainTitle: 'Qo‘riqlash ruxsati',
        documentNumber: a.entryPermitNumber,
      });
    }

    // 5. KIRISH: Tara tekshiruvi (Har bir vagon bo'yicha)
    for (const u of a.wagons ?? []) {
      const tareStamp = u.tareCheckedAt || u.tareWeighedAt;
      if (tareStamp) {
        items.push({
          id: `tare-${a.id}-${u.wagonNumber}`,
          at: tareStamp,
          title: a.arrivalNumber,
          detail: `Tara tekshiruvi bajarildi · vagon ${u.wagonNumber}${u.tareWeight ? ' · Tara: ' + u.tareWeight + ' t' : ''}`,
          actor: u.sealConfirmedByScaleName || a.createdByName || 'Tarozibon',
          department: 'Temir yo‘l sexi (Tarozi)',
          stageName: 'Tara tekshiruvi',
          statusBadge: 'Tara o‘tdi',
          kind: 'entry',
          productLabel: productTitle(u.productType || a.productType),
          wagonNumbers: [u.wagonNumber],
          wagonCount: 1,
          summary: `Tara tekshiruvi: ${u.tareWeight || '—'} t`,
          mainTitle: `Tara tekshiruvi · vagon ${u.wagonNumber}`,
          subNote: u.tareWeight ? `Tara: ${u.tareWeight} t` : undefined,
          extraInfo: u.tareWeight ? `Tara: ${u.tareWeight} t` : undefined,
        });
      }
    }

    // 6. YUKLASH: Mahsulot quyish (TM va XA sexi)
    for (const u of a.wagons ?? []) {
      const loadStamp = u.loadingCompletedAt || u.loadingStartedAt;
      if (loadStamp) {
        items.push({
          id: `load-unit-${a.id}-${u.wagonNumber}`,
          at: loadStamp,
          title: a.arrivalNumber,
          detail: `Mahsulot quyildi · vagon ${u.wagonNumber} · ${u.productType || a.productType}`,
          actor: u.loadingCompletedByName || a.loadingCompletedByName || 'TM va XA smena muhandisi',
          department: 'TM va XA sexi',
          stageName: 'Mahsulot quyish',
          statusBadge: 'Quyildi',
          kind: 'load',
          productLabel: productTitle(u.productType || a.productType),
          wagonNumbers: [u.wagonNumber],
          wagonCount: 1,
          summary: `${u.productType || a.productType} quyildi`,
          mainTitle: `Mahsulot quyish · vagon ${u.wagonNumber}`,
          subNote: u.nettoWeight ? `Netto: ${u.nettoWeight} t` : undefined,
          extraInfo: u.nettoWeight ? `Netto: ${u.nettoWeight} t` : undefined,
        });
      }
    }

    // Partiya darajasida yuklash yakunlangani
    if (a.loadingCompletedAt && (!a.wagons || a.wagons.length === 0)) {
      const loaded = loadedWagonCountOf(a);
      const explicitlyLoaded = loadedUnitsOf(a).map(unit => unit.wagonNumber).filter(Boolean);
      const loadedWagons = explicitlyLoaded.length > 0
        ? explicitlyLoaded
        : (a.wagons ?? []).filter(unit => unit.status !== 'Returned').map(unit => unit.wagonNumber).filter(Boolean);
      items.push({
        id: `load-${a.id}`,
        at: a.loadingCompletedAt,
        title: a.arrivalNumber,
        detail: `Yuklash yakunlandi · ${productLabel} · ${loaded} vagon`,
        actor: a.loadingCompletedByName || 'TM va XA smena muhandisi',
        department: 'TM va XA sexi',
        stageName: 'Yuklash yakunlandi',
        statusBadge: 'Yuklandi',
        kind: 'load',
        productLabel,
        wagonNumbers: loadedWagons,
        wagonCount: loaded,
        summary: `${productLabel} · Yuklash yakunlandi`,
        mainTitle: `Yuklash yakunlandi · ${productLabel}`,
        subNote: `${loaded} vagon yuklandi`,
      });
    }

    // 7. YUKLASH: Brutto tortish / Netto hisobi
    for (const u of a.wagons ?? []) {
      if (u.grossWeighedAt) {
        items.push({
          id: `gross-${a.id}-${u.wagonNumber}`,
          at: u.grossWeighedAt,
          title: a.arrivalNumber,
          detail: `Brutto tortildi · vagon ${u.wagonNumber} · Brutto: ${u.grossWeight || '—'} t`,
          actor: u.sealConfirmedByScaleName || 'Tarozibon',
          department: 'Temir yo‘l sexi (Tarozi)',
          stageName: 'Brutto tortish',
          statusBadge: 'Tortildi',
          kind: 'load',
          productLabel: productTitle(u.productType || a.productType),
          wagonNumbers: [u.wagonNumber],
          wagonCount: 1,
          summary: `Brutto: ${u.grossWeight || '—'} t, Netto: ${u.nettoWeight || '—'} t`,
          mainTitle: `Brutto tortish · vagon ${u.wagonNumber}`,
          subNote: `Brutto: ${u.grossWeight || '—'} t`,
          extraInfo: `Brutto: ${u.grossWeight || '—'} t · Netto: ${u.nettoWeight || '—'} t`,
        });
      }
    }

    // 8. YUKLASH: Plombalash va Muhrlash (SHGKM)
    for (const u of a.wagons ?? []) {
      const sealStamp = u.sealedAt || u.sealEnteredToUngAt || (u.sealNumber ? u.grossWeighedAt : null);
      if (sealStamp && u.sealNumber) {
        items.push({
          id: `seal-${a.id}-${u.wagonNumber}`,
          at: sealStamp,
          title: a.arrivalNumber,
          detail: `Muhrlandi (Plomba) · vagon ${u.wagonNumber} · ${u.sealNumber}`,
          actor: u.sealConfirmedBySecurityName || 'Qo‘riqlash (XA) xodimi',
          department: 'Qo‘riqlash xizmati (XA)',
          stageName: 'Plombalash va Muhrlash',
          statusBadge: 'Muhrlangan',
          kind: 'load',
          productLabel: productTitle(u.productType || a.productType),
          wagonNumbers: [u.wagonNumber],
          wagonCount: 1,
          summary: `Plomba №: ${u.sealNumber}`,
          mainTitle: `Muhrlash · vagon ${u.wagonNumber}`,
          subNote: `Plomba: ${u.sealNumber}`,
          extraInfo: `Plomba №: ${u.sealNumber}`,
        });
      }
    }

    // 9. NOSOZLIKLAR VA DALOLATNOMALAR (GU-23)
    const wagonDefectMap = new Map<string, {
      wagonNumber: string;
      events: HistoryTimelineSubEvent[];
    }>();
    const partyDefects: HistoryTimelineSubEvent[] = [];

    const issues = parseArrivalIssueNotes(a.notes);
    for (let i = 0; i < issues.length; i++) {
      const issue = issues[i];
      const at = issueStampToSortable(issue.stampRaw, a.createdAt || a.arrivalDate);
      if (!at) continue;
      const where = issue.kind === 'security'
        ? 'Qo‘riqlash'
        : issue.kind === 'tare'
          ? 'Tara'
          : issue.kind === 'gross-return'
            ? 'Brutto qaytarish'
            : 'Yuklash';
      const actor = issue.kind === 'security'
        ? (a.entryPermitSecurityApprovedByName || 'Qo‘riqlash xizmati')
        : issue.kind === 'loading'
          ? (a.entryPermitShiftApprovedByName || a.loadingCompletedByName || a.createdByName || 'TM va XA smena muxandisi')
          : (a.createdByName || 'Tarozibon');
      const isReturn = issue.kind === 'gross-return' || /qaytar/i.test(issue.reason);
      const action = issue.kind === 'gross-return' ? where : `${where} kamchilik`;
      const wagon = issue.wagonNumber ? ` · vagon ${issue.wagonNumber}` : '';
      const evt: HistoryTimelineSubEvent = {
        id: `defect-${a.id}-${i}`,
        at,
        stage: isReturn ? 'Qaytarish' : 'Nomuvofiqlik',
        tone: isReturn ? 'return' : 'defect',
        title: a.arrivalNumber,
        detail: `${action}${wagon} · ${issue.reason}`,
        summary: issue.reason,
        actor,
        issueArea: action,
        reason: issue.reason,
      };

      if (issue.wagonNumber) {
        const key = issue.wagonNumber.trim();
        if (!wagonDefectMap.has(key)) {
          wagonDefectMap.set(key, { wagonNumber: key, events: [] });
        }
        wagonDefectMap.get(key)!.events.push(evt);
      } else {
        partyDefects.push(evt);
      }
    }

    for (const unit of a.wagons ?? []) {
      if (!unit.defectActUploadedAt) continue;
      const act = unit.defectActNumber || unit.defectActFileName || 'Dalolatnoma';
      const evt: HistoryTimelineSubEvent = {
        id: `defect-act-${a.id}-${unit.id}`,
        at: unit.defectActUploadedAt,
        stage: 'Dalolatnoma',
        tone: 'act',
        title: a.arrivalNumber,
        detail: `Dalolatnoma rasmiylashtirildi · vagon ${unit.wagonNumber} · ${act}`,
        summary: `${act} rasmiylashtirildi`,
        actor: unit.defectActUploadedByName || '—',
        documentNumber: unit.defectActNumber || act,
        documentFileName: unit.defectActFileName,
      };

      if (unit.wagonNumber) {
        const key = unit.wagonNumber.trim();
        if (!wagonDefectMap.has(key)) {
          wagonDefectMap.set(key, { wagonNumber: key, events: [] });
        }
        wagonDefectMap.get(key)!.events.push(evt);
      } else {
        partyDefects.push(evt);
      }
    }

    for (const [wagonNumber, group] of wagonDefectMap) {
      if (group.events.length === 0) continue;
      group.events.sort((x, y) => y.at.localeCompare(x.at));
      const latest = group.events[0];
      const actEvt = group.events.find(e => e.stage === 'Dalolatnoma');
      const issueEvt = group.events.find(e => e.stage !== 'Dalolatnoma');

      let mainTitle = latest.summary;
      let subNote = '';
      if (actEvt && issueEvt) {
        mainTitle = `${actEvt.documentNumber || 'Dalolatnoma'} rasmiylashtirildi`;
        subNote = issueEvt.summary || issueEvt.reason || '';
      } else if (actEvt) {
        mainTitle = `${actEvt.documentNumber || 'Dalolatnoma'} rasmiylashtirildi`;
        subNote = actEvt.detail || '';
      } else if (issueEvt) {
        mainTitle = issueEvt.summary || issueEvt.reason || 'Nomuvofiqlik aniqlandi';
        subNote = issueEvt.detail || '';
      }

      items.push({
        id: `defect-group-${a.id}-${wagonNumber}`,
        at: latest.at,
        title: a.arrivalNumber,
        detail: latest.detail || `${productLabel} · vagon ${wagonNumber}`,
        actor: latest.actor,
        department: 'Nazorat',
        stageName: latest.stage || 'Nomuvofiqlik',
        statusBadge: 'Nosozlik',
        kind: 'defect',
        productLabel,
        wagonNumbers: [wagonNumber],
        wagonCount: 1,
        summary: mainTitle + (subNote ? ` · ${subNote}` : ''),
        mainTitle,
        subNote,
        issueArea: issueEvt?.issueArea || latest.issueArea,
        reason: issueEvt?.reason || latest.reason,
        documentNumber: actEvt?.documentNumber || latest.documentNumber,
        documentFileName: actEvt?.documentFileName || latest.documentFileName,
        subEvents: group.events,
      });
    }

    for (const pEvt of partyDefects) {
      items.push({
        id: pEvt.id,
        at: pEvt.at,
        title: a.arrivalNumber,
        detail: pEvt.detail || pEvt.summary,
        actor: pEvt.actor,
        department: 'Nazorat',
        stageName: pEvt.stage || 'Nomuvofiqlik',
        statusBadge: 'Nosozlik',
        kind: 'defect',
        productLabel,
        wagonNumbers: [],
        wagonCount: 0,
        summary: pEvt.summary,
        mainTitle: pEvt.stage || 'Nomuvofiqlik',
        subNote: pEvt.summary,
        issueArea: pEvt.issueArea,
        reason: pEvt.reason,
        documentNumber: pEvt.documentNumber,
        documentFileName: pEvt.documentFileName,
        subEvents: [pEvt],
      });
    }
  }

  // 10. BUYURTMA VA CHIQISH REYESTRLARI (LoadingRegistries)
  for (const r of registries) {
    if ((r.registryNumber || '').includes('-1C-')) continue;
    const arrival = arrivalById.get(r.emptyWagonArrivalId);
    if (arrival && (isOneCArrival(arrival) || arrival.arrivalNumber?.startsWith('1C-'))) continue;

    const routeProduct = (r.wagonRoutes ?? []).find(w => w.productType)?.productType;
    const productLabel = productTitle(r.productType || routeProduct || arrival?.productType || '');
    const regWagons = (r.wagonRoutes ?? []).map(route => route.wagonNumber).filter(Boolean);
    const count = registryWagonCountOf(r);

    // 10.A BUYURTMA: Yuk xatini shakllantirish (Tarkib yig'ish)
    const prepTime = r.preparedAt;
    if (prepTime) {
      items.push({
        id: `reg-prep-${r.id}`,
        at: prepTime,
        title: r.registryNumber || 'Yuk xati',
        detail: `Yuk xati shakllantirildi · ${r.contractorName ? r.contractorName + ' · ' : ''}${count} vagon`,
        actor: r.preparedByName || 'Tovar kassiri',
        department: 'Tovar kassasi (Logistika)',
        stageName: 'Yuk xati shakllantirish',
        statusBadge: 'Tarkib yig‘ildi',
        kind: 'order',
        productLabel,
        wagonNumbers: regWagons,
        wagonCount: count,
        summary: `${r.orderNumber ? 'Buyurtma ' + r.orderNumber + ' · ' : ''}${r.contractorName || 'Mijoz'}`,
        mainTitle: `Yuk xati · ${r.registryNumber}`,
        subNote: `${r.contractorName || '—'} · ${r.destinationStation || '—'}`,
        documentNumber: r.registryNumber,
        extraInfo: `Buyurtma: ${r.orderNumber || '—'} · Shartnoma: ${r.contractNumber || '—'}`,
      });
    }

    // 10.B BUYURTMA: Iqtisodchi tekshiruvi
    if (r.economistApprovedAt) {
      items.push({
        id: `reg-econ-${r.id}`,
        at: r.economistApprovedAt,
        title: r.registryNumber,
        detail: `Iqtisodchi tekshiruvi tasdiqlandi · ${r.contractorName || ''}`,
        actor: r.economistApprovedByName || 'Iqtisodchi',
        department: 'ICHDX / Iqtisodchi',
        stageName: 'Iqtisodchi tekshiruvi',
        statusBadge: 'Tasdiqlandi',
        kind: 'order',
        productLabel,
        wagonNumbers: regWagons,
        wagonCount: count,
        summary: 'Iqtisodchi tasdig‘i',
        mainTitle: 'Iqtisodchi tasdig‘i',
      });
    }

    // 10.C BUYURTMA: 1C va E-Nakladnoyga yuborildi
    const sentTime = r.sentToOneCAt || r.sentToENaklAt;
    if (sentTime) {
      items.push({
        id: `reg-sent-${r.id}`,
        at: sentTime,
        title: r.registryNumber,
        detail: `1C / E-Nakladnoyga yuborildi · ${r.registryNumber}`,
        actor: r.preparedByName || 'Tizim / Integratsiya',
        department: 'Buxgalteriya / 1C',
        stageName: '1C / E-Nakladnoy',
        statusBadge: 'Yuborildi',
        kind: 'order',
        productLabel,
        wagonNumbers: regWagons,
        wagonCount: count,
        summary: '1C / E-Nakl jo‘natildi',
        mainTitle: '1C integratsiyasi',
      });
    }

    // 10.D CHIQISH: Qo'riqlash (XA) chiqish ko'rigi
    if (r.securityApprovedAt) {
      items.push({
        id: `reg-sec-${r.id}`,
        at: r.securityApprovedAt,
        title: r.registryNumber,
        detail: `Chiqish ko‘rigi (XA soqchilik) tasdiqlandi`,
        actor: r.securityApprovedByName || 'Qo‘riqlash xizmati',
        department: 'Qo‘riqlash xizmati (XA)',
        stageName: 'Chiqish ko‘rigi (XA)',
        statusBadge: 'XA ruxsat berdi',
        kind: 'exit',
        productLabel,
        wagonNumbers: regWagons,
        wagonCount: count,
        summary: 'Qo‘riqlash chiqish ruxsati',
        mainTitle: 'XA chiqish ko‘rigi',
      });
    }

    // 10.E CHIQISH: Ruxsatnoma byurosi chiqish ruxsati
    if (r.permitApprovedAt) {
      items.push({
        id: `reg-prm-${r.id}`,
        at: r.permitApprovedAt,
        title: r.registryNumber,
        detail: `Chiqish ruxsatnomasi tasdiqlandi`,
        actor: r.permitApprovedByName || 'Ruxsatnoma byurosi',
        department: 'Ruxsatnoma byurosi',
        stageName: 'Chiqish ruxsatnomasi',
        statusBadge: 'Ruxsatnoma berildi',
        kind: 'exit',
        productLabel,
        wagonNumbers: regWagons,
        wagonCount: count,
        summary: 'Ruxsatnoma byurosi chiqish ruxsati',
        mainTitle: 'Chiqish ruxsatnomasi',
      });
    }

    // 10.F CHIQISH: Zavoddan chiqarildi (Kengsoyga jo'natildi)
    if (r.exitedToKengsoyAt) {
      items.push({
        id: `exit-${r.id}`,
        at: r.exitedToKengsoyAt,
        title: r.registryNumber || r.arrivalNumber,
        detail: `Chiqish · ${productLabel} · ${count} vagon`,
        actor: r.shiftSupervisorApprovedByName || 'Temir yo‘l dispetcheri',
        department: 'Temir yo‘l sexi',
        stageName: 'Zavoddan chiqarildi',
        statusBadge: 'Jo‘natildi',
        kind: 'exit',
        productLabel,
        wagonNumbers: regWagons,
        wagonCount: count,
        summary: `${productLabel} · Zavoddan chiqarildi`,
        mainTitle: `Zavoddan chiqarildi · ${productLabel}`,
        subNote: `${count} vagon Kengsoyga jo‘natildi`,
      });
    }
  }

  return items.sort((a, b) => b.at.localeCompare(a.at));
}

export const STAGE_LABEL_UZ: Record<string, string> = {
  Draft: 'Qoralama',
  Created: 'Yaratilgan',
  RailwayInspected: 'Temir yo‘l tekshiruvi',
  KengsoyInspection: 'Kengsoy',
  SecurityInspection: 'Qo‘riqlash',
  ReadyForEstakada: 'Tara / estakada',
  TareWeighing: 'Tara',
  EstakadaPlaced: 'Estakada',
  Loading: 'Yuklanmoqda',
  Loaded: 'Yuklangan',
  Returned: 'Nuqson — qaytarilgan',
  ToRailwayScale: 'Tarozi',
  GrossWeighed: 'Brutto',
  SealInstallation: 'Plomba',
  SealPending: 'Plomba kutilmoqda',
  Sealed: 'Muhrlangan',
  RegistryPrepared: 'Reyestr',
  DocumentsIssued: 'Hujjatlar',
  PermitAndSecurityApproved: 'Ruxsat/qo‘riqlash',
  Exited: 'Chiqib ketgan',
};
