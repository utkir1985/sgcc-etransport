import type { DailyPlan, EmptyWagonArrival, EmptyWagonUnit, LoadingRegistry, MonthlyOrder, WaybillPartQr } from '../types';
import { wagonOwnershipLabel } from '../constants/wagonOwnership';
import { isWagonKind, WAGON_KIND_LABEL, type WagonKind } from './wagonKinds';
import { numberToUzWords } from './uzNumberWords';
import { toLatinProductName } from './cyrillicToLatin';
import { splitSealNumbers } from './seals';

export interface YukXatiWagonRow {
  index: number;
  wagonNumber: string;
  wagonType: string;
  wagonTypeCode: string;
  axles: string;
  capacity: string;
  techNorm: string;
  tareKg: string;
  bruttoKg: string;
  nettoKg: string;
  sealNumber: string;
  techInspection: string;
  securityCheck: string;
  noteOwner: string;
  receiverAndStation: string;
  /** Vagon bog‘langan buyurtma qatorining shartnoma raqami */
  contractNumber?: string;
  isDefective?: boolean;
  defectActFileName?: string;
  unitId?: string;
  productName?: string;
}

export interface YukXatiProcessStep {
  key: string;
  title: string;
  at: string | null;
  byName: string;
  done: boolean;
}

export interface YukXatiModel {
  registryId: string;
  etId: string;
  registryNumber: string;
  formedAt: string | null;
  marketingOrderNo: string;
  dailyPlanNo: string;
  loadingTaskNo: string;
  exitToKengsoyDate: string;
  exitToKengsoyTime: string;
  originLabel: string;
  destinationStation: string;
  consignorName: string;
  consignorContract: string;
  consignorAddress: string;
  consigneeName: string;
  consigneeContract: string;
  consigneeAddress: string;
  transportRail: boolean;
  transportRoad: boolean;
  wagonProvider: string;
  paymentPaid: boolean;
  paymentPartial: boolean;
  paymentUnpaid: boolean;
  finalConsignee: string;
  wagonCount: number;
  placesCount: number;
  cargoName: string;
  cargoCodes: string;
  totalTareKg: number;
  totalBruttoKg: number;
  totalNettoKg: number;
  totalTareWords: string;
  totalBruttoWords: string;
  totalNettoWords: string;
  wagonCountWords: string;
  placesCountWords: string;
  massByScale: boolean;
  ungRecordNo: string;
  weighDateTime: string;
  sealType: string;
  sealCount: number;
  sealNumbers: string;
  qrValue: string;
  qrLink: string;
  qrGlobalId?: string;
  qrVerificationUrl?: string;
  qrCodeBase64?: string;
  permitOk: boolean;
  permitDenied: boolean;
  exitedToKengsoy: boolean;
  statusCompleted: boolean;
  statusRework: boolean;
  scaleOperatorAt: string | null;
  scaleOperatorName: string;
  railwayRepAt: string | null;
  railwayRepName: string;
  shiftSupervisorAt: string | null;
  shiftSupervisorName: string;
  securityAt: string | null;
  securityName: string;
  economistAt: string | null;
  economistName: string;
  warehouseAt: string | null;
  warehouseName: string;
  permitAt: string | null;
  permitName: string;
  wagons: YukXatiWagonRow[];
  processSteps: YukXatiProcessStep[];
  /** Qo‘riqlash tasdiqlagan (ajratmalar faqat shundan keyin beriladi) */
  securityApproved?: boolean;
  /** Guruhlar WB-…-N bilan raqamlanadimi (01.10.2026 dan oldin qo‘riqlangan hujjatlarda ajratma yo‘q) */
  partsNumbered?: boolean;
  /** Ajratmalarning QR Link nusxalari (backend saqlagan) */
  waybillParts?: WaybillPartQr[];
  /** Ajratma ko‘rinishi: asosiy yuk xati raqami va tartibi (3 / 4) */
  part?: { parentRegistryNumber: string; partNo: number; partCount: number };
}

/** Yuk xati ichidagi qabul qiluvchi guruhi (shartnoma + qabul qiluvchi tashkilot va stansiya). */
export interface YukXatiWagonGroup {
  number: string;
  partNo: number;
  contractNumber: string;
  receiver: string;
  rows: YukXatiWagonRow[];
  isDefectiveSection: boolean;
  tareKg: number;
  bruttoKg: number;
  nettoKg: number;
}

function groupContractFallback(contract?: string | null) {
  const value = (contract ?? '').trim();
  return !value || /bir nechta/i.test(value) ? '—' : value;
}

/**
 * Vagonlarni "shartnoma + qabul qiluvchi" bo‘yicha guruhlaydi (backenddagi YukXatiGrouping bilan bir xil qoida).
 * Bir nechta guruh bo‘lsa WB-1026-030-1, -2, ... (jadvaldagi birinchi vagon tartibida); bitta bo‘lsa — asosiy raqam.
 * Nomuvofiq vagonlar alohida bo‘limga tushadi va ajratma bo‘lmaydi.
 */
/** Ajratmalar shu sanadan keyin qo‘riqlashdan o‘tgan yuk xatlariga beriladi (backend: YukXatiGrouping.PartsFromUtc). */
const PARTS_FROM = Date.parse('2026-09-30T19:00:00Z');

export function yukXatiIssuesParts(registry: LoadingRegistry): boolean {
  if (!registry.isApprovedBySecurity) return true;
  const at = Date.parse(registry.securityApprovedAt || registry.preparedAt || '');
  return !Number.isFinite(at) || at >= PARTS_FROM;
}

export function groupYukXatiWagons(model: YukXatiModel): YukXatiWagonGroup[] {
  const fallbackReceiver = model.finalConsignee || model.consigneeName || '—';
  const buckets = new Map<string, { contract: string; receiver: string; rows: YukXatiWagonRow[] }>();
  const defective: YukXatiWagonRow[] = [];
  for (const row of model.wagons) {
    if (!row.wagonNumber || !String(row.wagonNumber).trim()) continue;
    if (row.isDefective) { defective.push(row); continue; }
    const contract = safeTrim(row.contractNumber) || groupContractFallback(model.consigneeContract);
    const receiver = safeTrim(row.receiverAndStation) || fallbackReceiver;
    const key = `${contract}|${receiver}`.toLowerCase();
    const bucket = buckets.get(key) ?? { contract, receiver, rows: [] };
    bucket.rows.push(row);
    buckets.set(key, bucket);
  }
  const kg = (rows: YukXatiWagonRow[], pick: (r: YukXatiWagonRow) => string) =>
    rows.reduce((s, r) => s + (Number(pick(r)) || 0), 0);
  const split = model.partsNumbered !== false && buckets.size > 1;
  const groups: YukXatiWagonGroup[] = [...buckets.values()].map((b, i) => ({
    number: split ? `${model.registryNumber}-${i + 1}` : model.registryNumber,
    partNo: split ? i + 1 : 0,
    contractNumber: b.contract,
    receiver: b.receiver,
    rows: b.rows,
    isDefectiveSection: false,
    tareKg: kg(b.rows, r => r.tareKg),
    bruttoKg: kg(b.rows, r => r.bruttoKg),
    nettoKg: kg(b.rows, r => r.nettoKg),
  }));
  if (defective.length > 0) {
    groups.push({
      number: '', partNo: 0, contractNumber: '—',
      receiver: 'Nomuvofiqlik aniqlangan vagonlar (yuk xatiga kirmaydi)',
      rows: defective, isDefectiveSection: true, tareKg: 0, bruttoKg: 0, nettoKg: 0,
    });
  }
  return groups;
}

/** Bir nechta qabul qiluvchi bo‘lsa — ajratmalar; aks holda bo‘sh. */
export function yukXatiParts(model: YukXatiModel): YukXatiWagonGroup[] {
  if (model.partsNumbered === false) return [];
  const groups = groupYukXatiWagons(model).filter(g => !g.isDefectiveSection);
  return groups.length > 1 ? groups : [];
}

/** Ajratma modeli: faqat shu guruh vagonlari, o‘z jamilari, raqami va QR'i bilan. */
export function buildYukXatiPartModel(master: YukXatiModel, part: YukXatiWagonGroup, partCount: number): YukXatiModel {
  const qr = (master.waybillParts ?? []).find(p => p.number === part.number);
  const products = [...new Set(part.rows.map(r => r.productName).filter(Boolean))];
  const qrLink = qr?.qrVerificationUrl || '';
  return {
    ...master,
    registryNumber: part.number,
    consigneeContract: part.contractNumber,
    finalConsignee: part.receiver,
    cargoName: products.length === 1 ? (products[0] as string) : master.cargoName,
    wagons: part.rows,
    wagonCount: part.rows.length,
    totalTareKg: Math.round(part.tareKg),
    totalBruttoKg: Math.round(part.bruttoKg),
    totalNettoKg: Math.round(part.nettoKg),
    qrValue: qrLink,
    qrLink,
    qrGlobalId: qr?.qrGlobalId,
    qrVerificationUrl: qr?.qrVerificationUrl,
    qrCodeBase64: qr?.qrCodeBase64,
    part: { parentRegistryNumber: master.registryNumber, partNo: part.partNo, partCount },
  };
}

export function isYukXatiPrintReady(model: YukXatiModel): boolean {
  return Boolean(
    (model.shiftSupervisorAt || model.railwayRepAt)
    && model.warehouseAt
    && model.scaleOperatorAt
    && model.economistAt
    && model.permitAt
    && model.securityAt
    // Ajratma o‘z QR'i QR Link'da ro‘yxatdan o‘tgach chop etiladi
    && !(model.part && !model.qrValue && !model.qrCodeBase64)
  );
}

const SHGKM = '"SHURTAN GAZ KIMYO MAJMUASI" MCHJ';
const SHGKM_ADDRESS = 'Qashqadaryo viloyati, G‘uzor tumani, Shurtan qo‘rg‘oni';
const DEST_KENGSOY = '732602 - KENGSOY';

const WAGON_TYPE_LABEL = WAGON_KIND_LABEL;
const WAGON_TYPE_CODE = WAGON_KIND_LABEL;

export function safeTrim(raw: unknown): string {
  if (raw == null) return '';
  return String(raw).trim();
}

function parseWeight(raw?: string | number | null): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const str = String(raw).trim();
  if (!str) return null;
  const cleaned = str.replace(/\s/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function toKg(n: number | null): number | null {
  if (n == null) return null;
  return Math.abs(n) < 1000 ? n * 1000 : n;
}

function formatWeight(n: number | null): string {
  if (n == null) return '';
  return String(Math.round(toKg(n) ?? 0));
}

function unitNetto(unit: EmptyWagonUnit): number | null {
  const fromField = parseWeight(unit.nettoWeight);
  if (fromField != null) return fromField;
  const tare = parseWeight(unit.tareWeight);
  const gross = parseWeight(unit.grossWeight);
  if (tare == null || gross == null) return null;
  return Math.max(0, gross - tare);
}

function ownerLabel(unit: EmptyWagonUnit): string {
  return wagonOwnershipLabel(unit.ownership);
}

function kindOf(unit: EmptyWagonUnit): WagonKind {
  return isWagonKind(unit.wagonType) ? unit.wagonType : 'sisterna';
}

function cleanSealNumbers(raw?: string | number | null): string {
  if (raw == null) return '';
  return splitSealNumbers(raw).join(', ');
}

function fmtDateTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function fmtTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function normalizeRegistryNumber(raw: string): string {
  const t = safeTrim(raw);
  // Yuk xati raqami tizimdagi kabi (WB-1026-031) — PDF, ro'yxat va QR bilan bir xil
  return t.replace(/^ET-/i, '');
}

/** Partiya + reyestrdan yangi E-Transport yuk xati modelini yig‘adi. */
export function buildYukXatiModel(
  registry: LoadingRegistry,
  arrival?: EmptyWagonArrival | null,
  plan?: DailyPlan | null,
  order?: MonthlyOrder | null,
  extraUnits: EmptyWagonUnit[] = [],
): YukXatiModel {
  const unitsByNumber = new Map<string, EmptyWagonUnit[]>();
  for (const unit of [...extraUnits, ...(arrival?.wagons ?? [])]) {
    if (!unit.wagonNumber) continue;
    const number = safeTrim(unit.wagonNumber).toLowerCase();
    unitsByNumber.set(number, [...(unitsByNumber.get(number) ?? []), unit]);
  }
  const routeByWagon = new Map(
    (registry.wagonRoutes || []).map(route => [safeTrim(route.wagonNumber).toLowerCase(), route] as const),
  );
  const registryWagonNumbers = [...routeByWagon.keys()];
  const registryUnits = registryWagonNumbers.length > 0
    ? registryWagonNumbers
      .map(number => {
        const route = routeByWagon.get(number);
        const candidates = unitsByNumber.get(number) ?? [];
        return candidates.find(unit => !route?.sourceArrivalId
          || unit.emptyWagonArrivalId?.toLowerCase() === route.sourceArrivalId.toLowerCase())
          ?? candidates[0];
      })
      .filter((unit): unit is EmptyWagonUnit => Boolean(unit))
    : [...unitsByNumber.values()].flat().sort((a, b) => a.sortOrder - b.sortOrder);

  const rows: YukXatiWagonRow[] = (registry.wagonRoutes && registry.wagonRoutes.length > 0)
    ? registry.wagonRoutes.map((route, i) => {
        const number = safeTrim(route.wagonNumber).toLowerCase();
        const candidates = unitsByNumber.get(number) ?? [];
        const u: EmptyWagonUnit = candidates.find(unit => !route.sourceArrivalId
          || unit.emptyWagonArrivalId?.toLowerCase() === route.sourceArrivalId.toLowerCase())
          ?? candidates[0]
          ?? ({
              id: route.wagonNumber,
              emptyWagonArrivalId: route.sourceArrivalId || registry.emptyWagonArrivalId || '',
              wagonNumber: route.wagonNumber,
              wagonType: 'sisterna',
              productType: route.productType || registry.productType || 'Suyultirilgan gaz',
              status: route.isDefective ? 'Returned' : 'Sealed',
              sortOrder: i,
            } as EmptyWagonUnit);
        const kind = kindOf(u);
        const rObj = route as Record<string, any>;
        const tare = parseWeight(u.tareWeight) ?? parseWeight(rObj.tareWeight) ?? (kind === 'platform' ? 21.50 : 37.10);
        const brutto = parseWeight(u.grossWeight) ?? parseWeight(rObj.grossWeight) ?? (kind === 'platform' ? 70.80 : 68.90);
        const netto = unitNetto(u) ?? parseWeight(rObj.nettoWeight ?? rObj.netWeight ?? rObj.NetWeight) ?? (brutto - tare);
        const sealed = Boolean((safeTrim(u.sealNumber) || safeTrim(rObj.sealNumber) || u.status === 'Sealed') && (u.sealedAt || true));
        const securityOk = Boolean(u.sealConfirmedBySecurityAt || u.status === 'Sealed');
        const defective = Boolean(route.isDefective) || u.status === 'Returned';
        const rawRowProduct = (
          route.productType
          || u.productType
          || order?.productType
          || plan?.productType
          || (!/aralash/i.test(registry.productType || '') ? registry.productType : '')
          || (!/aralash/i.test(arrival?.productType || '') ? arrival?.productType : '')
          || (kind === 'sisterna' ? 'Suyultirilgan gaz' : 'Etilenning polimerlari (polietilen)')
        );
        const rowProductName = toLatinProductName(safeTrim(rawRowProduct)) || safeTrim(rawRowProduct) || '';

        return {
          index: i + 1,
          wagonNumber: u.wagonNumber || route.wagonNumber,
          wagonType: WAGON_TYPE_LABEL[kind],
          wagonTypeCode: WAGON_TYPE_CODE[kind],
          axles: '4',
          capacity: kind === 'sisterna' ? '60' : '',
          techNorm: '',
          tareKg: defective ? '' : formatWeight(tare),
          bruttoKg: defective ? '' : formatWeight(brutto),
          nettoKg: defective ? '' : formatWeight(netto),
          sealNumber: defective ? '' : cleanSealNumbers(u.sealNumber || rObj.sealNumber || ''),
          techInspection: defective ? 'Nosoz' : (sealed || u.tareWeighedAt ? 'Soz' : ''),
          securityCheck: defective ? '' : (securityOk ? 'O‘tdi' : ''),
          noteOwner: ownerLabel(u),
          receiverAndStation: defective
            ? 'Nomuvofiqlik aniqlangan'
            : [route.contractorName, route.destinationStation].filter(Boolean).join(' — '),
          contractNumber: defective ? '' : safeTrim(route.contractNumber),
          isDefective: defective,
          defectActFileName: route.defectActFileName || u.defectActFileName || u.defectActNumber || '',
          unitId: u.id,
          productName: rowProductName,
        };
      })
    : registryUnits.map((u, i) => {
        const kind = kindOf(u);
        const route = routeByWagon.get(safeTrim(u.wagonNumber).toLowerCase());
        const rObj = (route ?? {}) as Record<string, any>;
        const tare = parseWeight(u.tareWeight) ?? parseWeight(rObj.tareWeight) ?? (kind === 'platform' ? 21.50 : 37.10);
        const brutto = parseWeight(u.grossWeight) ?? parseWeight(rObj.grossWeight) ?? (kind === 'platform' ? 70.80 : 68.90);
        const netto = unitNetto(u) ?? parseWeight(rObj.nettoWeight ?? rObj.netWeight ?? rObj.NetWeight) ?? (brutto - tare);
        const sealed = Boolean((safeTrim(u.sealNumber) || safeTrim(rObj.sealNumber) || u.status === 'Sealed') && (u.sealedAt || true));
        const securityOk = Boolean(u.sealConfirmedBySecurityAt || u.status === 'Sealed');
        const defective = Boolean(route?.isDefective) || u.status === 'Returned';
        const rawRowProduct = (
          route?.productType
          || u.productType
          || order?.productType
          || plan?.productType
          || (!/aralash/i.test(registry.productType || '') ? registry.productType : '')
          || (!/aralash/i.test(arrival?.productType || '') ? arrival?.productType : '')
          || (kind === 'sisterna' ? 'Suyultirilgan gaz' : 'Etilenning polimerlari (polietilen)')
        );
        const rowProductName = toLatinProductName(safeTrim(rawRowProduct)) || safeTrim(rawRowProduct) || '';

        return {
          index: i + 1,
          wagonNumber: u.wagonNumber || '',
          wagonType: WAGON_TYPE_LABEL[kind],
          wagonTypeCode: WAGON_TYPE_CODE[kind],
          axles: '4',
          capacity: kind === 'sisterna' ? '60' : '',
          techNorm: '',
          tareKg: defective ? '' : formatWeight(tare),
          bruttoKg: defective ? '' : formatWeight(brutto),
          nettoKg: defective ? '' : formatWeight(netto),
          sealNumber: defective ? '' : cleanSealNumbers(u.sealNumber || rObj.sealNumber || ''),
          techInspection: defective ? 'Nosoz' : (sealed || u.tareWeighedAt ? 'Soz' : ''),
          securityCheck: defective ? '' : (securityOk ? 'O‘tdi' : ''),
          noteOwner: ownerLabel(u),
          receiverAndStation: defective
            ? 'Nomuvofiqlik aniqlangan'
            : [route?.contractorName, route?.destinationStation].filter(Boolean).join(' — '),
          contractNumber: defective ? '' : safeTrim(route?.contractNumber),
          isDefective: defective,
          defectActFileName: route?.defectActFileName || u.defectActFileName || u.defectActNumber || '',
          unitId: u.id,
          productName: rowProductName,
        };
      });

  const sum = (pick: (r: YukXatiWagonRow) => string) =>
    rows.reduce((s, r) => s + (parseWeight(pick(r)) ?? 0), 0);

  let totalTare = sum(r => r.tareKg);
  let totalBrutto = sum(r => r.bruttoKg);
  let totalNetto = sum(r => r.nettoKg);

  if (!totalTare && !totalBrutto) {
    totalTare = toKg(parseWeight(arrival?.tareWeight)) ?? 0;
    totalBrutto = toKg(parseWeight(arrival?.grossWeight)) ?? 0;
    totalNetto = totalBrutto && totalTare ? Math.max(0, totalBrutto - totalTare) : 0;
  } else if (!totalNetto && totalBrutto && totalTare) {
    totalNetto = Math.max(0, totalBrutto - totalTare);
  }

  const wagonCount = rows.length || registry.wagonCount || arrival?.wagonCount || 0;
  const placesCount = wagonCount;
  const uniqueRowProducts = [...new Set(rows.map(r => r.productName).filter(Boolean))];
  const product = uniqueRowProducts.length > 0
    ? uniqueRowProducts.join(', ')
    : toLatinProductName(registry.productType)
      || toLatinProductName(arrival?.productType)
      || registry.productType
      || arrival?.productType
      || '';
  const consigneeNames = [...new Set((plan?.lines ?? []).map(line => safeTrim(line.contractor)).filter(Boolean))];
  const receivingStations = [...new Set((plan?.lines ?? []).map(line => safeTrim(line.destinationStation)).filter(Boolean))];
  const sealNumbers = rows.map(r => r.sealNumber).filter(Boolean);
  // Yuk xati mustaqil chiqish partiyasiga tegishli. Kirish partiyasi raqamini
  // hujjat identifikatori sifatida qayta ishlatmaymiz.
  const etId = registry.registryNumber || registry.id.slice(0, 8).toUpperCase();
  const registryNumber = normalizeRegistryNumber(registry.registryNumber || '');
  const fallbackQrTarget = registry.qrGlobalId;
  const qrLink = registry.qrVerificationUrl || (fallbackQrTarget ? `https://qrlink.sgcc.uz/verify/${encodeURIComponent(fallbackQrTarget)}` : `https://qrlink.sgcc.uz/verify/${encodeURIComponent(registry.registryNumber || registry.id)}`);
  const qrValue = qrLink;

  const grossAt = maxUnit(registryUnits, u => u.grossWeighedAt);
  const sealedAt = maxUnit(registryUnits, u => u.sealedAt);
  const securitySealAt = maxUnit(registryUnits, u => u.sealConfirmedBySecurityAt);
  const scaleSealAt = maxUnit(registryUnits, u => u.sealConfirmedByScaleAt);
  const warehouseAt = maxUnit(registryUnits, u => u.loadingCompletedAt)
    || arrival?.loadingCompletedAt
    || arrival?.createdAt
    || registry.preparedAt
    || null;
  const rawWarehouseName = latestUnitName(
    registryUnits,
    u => u.loadingCompletedAt,
    u => u.loadingCompletedByName,
  ) || arrival?.loadingCompletedByName;
  const warehouseName = (safeTrim(rawWarehouseName) && safeTrim(rawWarehouseName) !== '—')
    ? safeTrim(rawWarehouseName)
    : '—';

  const rawScaleOperatorName = latestUnitName(registryUnits, u => u.sealConfirmedByScaleAt, u => u.sealConfirmedByScaleName)
    || latestUnitName(registryUnits, u => u.grossWeighedAt, u => u.sealConfirmedByScaleName)
    || latestUnitName(registryUnits, u => u.tareWeighedAt, u => u.sealConfirmedByScaleName);
  const scaleOperatorName = (safeTrim(rawScaleOperatorName) && safeTrim(rawScaleOperatorName) !== '—')
    ? safeTrim(rawScaleOperatorName)
    : '—';
  const securityName = registry.securityApprovedByName
    || latestUnitName(registryUnits, u => u.sealConfirmedBySecurityAt, u => u.sealConfirmedBySecurityName);
  const economistName = registry.economistApprovedByName
    || registry.preparedByName
    || latestUnitName(registryUnits, u => u.sealConfirmedByEconomistAt, u => u.sealConfirmedByEconomistName);

  const processSteps: YukXatiProcessStep[] = [
    {
      key: 'intake',
      title: 'Bo‘sh vagonlar qabul qilindi',
      at: arrival?.createdAt || arrival?.arrivalDate || null,
      byName: arrival?.createdByName || '',
      done: Boolean(arrival?.createdAt || arrival?.arrivalDate),
    },
    {
      key: 'inspection',
      title: 'Texnik ko‘rik yakunlandi',
      at: registry.preparedAt || securitySealAt,
      byName: '',
      done: Boolean(
        registry.isApprovedBySecurity
        || ['ReadyForEstakada', 'EstakadaPlaced', 'Loading', 'Loaded', 'Sealed', 'Exited'].includes(arrival?.stage || ''),
      ),
    },
    {
      key: 'loading',
      title: 'Yuklash yakunlandi',
      at: warehouseAt,
      byName: warehouseName,
      done: Boolean(warehouseAt),
    },
    {
      key: 'scale-seal',
      title: 'Tarozi va plomba tasdiqlandi',
      at: sealedAt || grossAt,
      byName: '',
      done: rows.filter(r => !r.isDefective).every(r => r.sealNumber) || Boolean(sealedAt),
    },
    {
      key: 'exit',
      title: 'Kengsoyga jo‘natildi',
      at: registry.exitedToKengsoyAt,
      byName: '',
      done: Boolean(registry.exitedToKengsoyAt),
    },
  ];

  const permitOk = registry.isApprovedByPermit && registry.isApprovedBySecurity;
  const exited = Boolean(registry.exitedToKengsoyAt);

  return {
    registryId: registry.id,
    etId,
    registryNumber,
    formedAt: registry.preparedAt,
    marketingOrderNo: registry.orderNumber || order?.orderNumber || plan?.orderNumber || '',
    dailyPlanNo: plan?.planNumber || arrival?.planNumber || '',
    // Vagonlar kiritilgan kiritish xizmat xati raqami (partiya raqami bilan bitta — IB-…)
    loadingTaskNo: arrival?.entryPermitNumber || arrival?.arrivalNumber || '',
    exitToKengsoyDate: fmtDate(registry.exitedToKengsoyAt),
    exitToKengsoyTime: fmtTime(registry.exitedToKengsoyAt),
    originLabel: SHGKM,
    destinationStation: DEST_KENGSOY,
    consignorName: SHGKM,
    consignorContract: '',
    consignorAddress: SHGKM_ADDRESS,
    consigneeName: registry.contractorName || consigneeNames.join('; '),
    consigneeContract: (registry.contractNumber && registry.contractNumber !== 'Bir nechta shartnoma')
      ? registry.contractNumber
      : (order?.contractNumber || registry.contractNumber || ''),
    consigneeAddress: '',
    transportRail: true,
    transportRoad: false,
    wagonProvider: '',
    paymentPaid: false,
    paymentPartial: false,
    paymentUnpaid: false,
    finalConsignee: registry.destinationStation || receivingStations.join('; '),
    wagonCount,
    placesCount,
    cargoName: toLatinProductName(product) || product || '',
    cargoCodes: '',
    totalTareKg: Math.round(totalTare),
    totalBruttoKg: Math.round(totalBrutto),
    totalNettoKg: Math.round(totalNetto),
    totalTareWords: totalTare > 0 ? numberToUzWords(Math.round(totalTare)) : '',
    totalBruttoWords: totalBrutto > 0 ? numberToUzWords(Math.round(totalBrutto)) : '',
    totalNettoWords: totalNetto > 0 ? numberToUzWords(Math.round(totalNetto)) : '',
    wagonCountWords: wagonCount > 0 ? numberToUzWords(wagonCount) : '',
    placesCountWords: placesCount > 0 ? numberToUzWords(placesCount) : '',
    massByScale: true,
    ungRecordNo: '',
    weighDateTime: fmtDateTime(grossAt),
    sealType: sealNumbers.length ? 'Plomba' : '',
    sealCount: sealNumbers.length,
    sealNumbers: sealNumbers.join(', '),
    qrValue,
    qrLink,
    qrGlobalId: registry.qrGlobalId,
    qrVerificationUrl: registry.qrVerificationUrl,
    qrCodeBase64: registry.qrCodeBase64,
    permitOk,
    permitDenied:
      (registry.isApprovedBySecurity === false && Boolean(registry.securityCheckResult))
      || (registry.isApprovedByPermit === false && Boolean(registry.permitCheckResult)),
    exitedToKengsoy: exited,
    statusCompleted: exited,
    statusRework: false,
    scaleOperatorAt: scaleSealAt || grossAt || maxUnit(registryUnits, u => u.tareWeighedAt) || registry.preparedAt || null,
    scaleOperatorName,
    railwayRepAt: arrival?.createdAt || registry.preparedAt,
    railwayRepName: arrival?.createdByName || '',
    shiftSupervisorAt: registry.isApprovedByShiftSupervisor ? (registry.shiftSupervisorApprovedAt || null) : null,
    shiftSupervisorName: registry.isApprovedByShiftSupervisor ? (registry.shiftSupervisorApprovedByName || '—') : '',
    securityAt: registry.isApprovedBySecurity ? (registry.securityApprovedAt || null) : null,
    securityName: registry.isApprovedBySecurity ? (securityName || '—') : '',
    economistAt: (registry.isEconomistApprovedWithPermit || registry.isEconomistApprovedWithSecurity || registry.isApprovedByShiftSupervisor || registry.preparedAt)
      ? (registry.economistApprovedWithPermitAt || registry.economistApprovedAt || registry.preparedAt)
      : null,
    economistName: (economistName && economistName !== '—')
      ? economistName
      : (registry.preparedByName || '—'),
    warehouseAt,
    warehouseName,
    permitAt: registry.isApprovedByPermit ? (registry.permitApprovedAt || null) : null,
    permitName: registry.isApprovedByPermit ? (registry.permitApprovedByName || '—') : '',
    wagons: rows,
    processSteps,
    securityApproved: Boolean(registry.isApprovedBySecurity),
    partsNumbered: yukXatiIssuesParts(registry),
    waybillParts: registry.waybillParts ?? [],
  };
}

function maxUnit(
  units: EmptyWagonUnit[],
  pick: (u: EmptyWagonUnit) => string | null | undefined,
): string | null {
  return units.reduce<string | null>((best, u) => {
    const v = pick(u);
    if (!v) return best;
    if (!best) return v;
    return Date.parse(v) >= Date.parse(best) ? v : best;
  }, null);
}

function latestUnitName(
  units: EmptyWagonUnit[],
  pickAt: (u: EmptyWagonUnit) => string | null | undefined,
  pickName: (u: EmptyWagonUnit) => string | null | undefined,
): string {
  let bestAt = 0;
  let bestName = '';
  for (const unit of units) {
    const at = pickAt(unit);
    const name = pickName(unit)?.trim();
    if (!at || !name) continue;
    const time = Date.parse(at);
    if (time >= bestAt) {
      bestAt = time;
      bestName = name;
    }
  }
  return bestName;
}

export function formatYukXatiDateTime(iso?: string | null): string {
  return fmtDateTime(iso);
}
