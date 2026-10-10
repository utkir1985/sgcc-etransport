import type { EmptyWagonArrival, LoadingRegistry, MonthlyOrder } from '../../../shared/types';
import { normalizeWagonOwnership, WAGON_OWNERSHIP } from '../../../shared/constants/wagonOwnership';
import { isOneCArrival } from '../../../shared/utils/oneCSources';
import { workUnits } from '../../../shared/utils/wagonWorkState';

export interface WagonStageStopwatchItem {
  stageNumber: number;
  stageName: string;
  role: string;
  standardHours: number;
  actualHours: number;
  overdueHours: number;
  isOverdue: boolean;
  status: 'done' | 'active' | 'pending';
  penaltyShareUzs: number;
  responsibleEmployee?: string;
  description: string;
}

export interface DemurrageWagonItem {
  id: string;
  wagonNumber: string;
  arrivalId: string;
  arrivalNumber: string;
  arrivalDate: string;
  ownership: 'majmua' | 'tashqi';
  wagonType: string;
  productType: string;
  status: string;
  stageLabel: string;
  hoursInPlant: number;
  zone: 'green' | 'yellow' | 'red';
  normativeHours: number;
  overdueHours: number;
  estimatedPenaltyUzs: number;
  fifoPriority: number;
  currentStep: 'intake' | 'tare' | 'loading' | 'scale' | 'seal' | 'ready' | 'exited';
  stepHours: {
    toTare: number;
    loading: number;
    toGross: number;
    sealing: number;
    dispatch: number;
  };
  tareWeight?: string;
  grossWeight?: string;
  nettoWeight?: number | null;
  capacityTons: number;
  weightDiff: number;
  weightStatus: 'overload' | 'underload' | 'normal' | 'unweighed';
  contractorName?: string;
  destinationStation?: string;
  defectActNumber?: string;
  defectReason?: string;
  isExited: boolean;
  exitedAt?: string | null;
  delayCulprit?: {
    role: string;
    stageName: string;
    hours: number;
    explanation: string;
    employee?: string;
  };
  stageBreakdown?: WagonStageStopwatchItem[];
}

export interface DemurrageSummary {
  totalActive: number;
  redCount: number;
  yellowCount: number;
  greenCount: number;
  tashqiCount: number;
  majmuaCount: number;
  redTashqiCount: number;
  totalPenaltyUzs: number;
  avgHoursInPlant: number;
  longestStayWagon?: DemurrageWagonItem;
  stageBottlenecks: {
    tareAvgHours: number;
    loadingAvgHours: number;
    scaleAvgHours: number;
    sealAvgHours: number;
    dispatchAvgHours: number;
    bottleneckStage: string;
  };
  totalExited: number;
  roleDelayStats: Array<{
    roleName: string;
    department: string;
    totalDelayHours: number;
    delayedWagonsCount: number;
    totalPenaltyUzs: number;
    color: string;
  }>;
}

export interface WeightRecordItem {
  wagonNumber: string;
  arrivalNumber: string;
  productType: string;
  date: string;
  tareWeight: number;
  grossWeight: number;
  nettoWeight: number;
  capacityTons: number;
  diffTons: number;
  status: 'overload' | 'underload' | 'normal';
  note: string;
  contractorName?: string;
  destinationStation?: string;
  stationRisk: boolean;
}

export interface WeightSummary {
  totalWeighed: number;
  overloadCount: number;
  underloadCount: number;
  normalCount: number;
  totalLostCapacityTons: number;
  totalExcessTons: number;
  avgNettoTons: number;
  overloadRatePercent: number;
  estimatedLostCapacityCostUzs: number;
}

export interface ContractorLimitDetail {
  orderLineId?: string;
  orderNumber: string;
  contractNumber: string;
  productType: string;
  destinationStation: string;
  planTons: number;
  planWagons: number;
  loadedTons: number;
  loadedWagons: number;
  remainingTons: number;
  remainingWagons: number;
  progressPercent: number;
  status: 'ok' | 'warning' | 'danger';
  lastLoadedDate?: string;
}

export interface ContractorLimitItem {
  contractorName: string;
  orderNumber: string;
  contractNumber: string;
  productType: string;
  destinationStation: string;
  planTons: number;
  planWagons: number;
  loadedTons: number;
  loadedWagons: number;
  remainingTons: number;
  remainingWagons: number;
  progressPercent: number;
  status: 'ok' | 'warning' | 'danger';
  lastLoadedDate?: string;
  orderCount?: number;
  stationCount?: number;
  details?: ContractorLimitDetail[];
}

export interface DefectGu23Item {
  wagonNumber: string;
  arrivalNumber: string;
  arrivalDate: string;
  actNumber: string;
  actType: string;
  defectReason: string;
  station: string;
  fileName?: string;
  uploadedAt?: string;
  delayHours: number;
  isReturned: boolean;
}


export interface LogisticsTariffSettings {
  hourlyPenaltyUzs: number;
  normativeHoursTashqi: number;
  normativeHoursMajmua: number;
  warningHoursTashqi: number;
  underloadLossPerTonUzs: number;
}

// «Sho'rtan GKM» MCHJ Bosh direktori Sh.Ch. Aslanov va Qo'riqlash xizmati tomonidan tasdiqlangan
// «Tayyor mahsulotlarni jo'natish va MTRlarni qabul qilish JARAYONI» (2-tahrir) rasmiy me'yorlari
export const OFFICIAL_TOTAL_NORM_MINUTES = 533; // 8 soat 53 daqiqa
export const OFFICIAL_TOTAL_NORM_HOURS = 8.9;   // 8.9 soat

export interface OfficialStageNorm {
  stepNumber: number;
  name: string;
  responsible: string;
  standardMinutes: number;
  standardHours: number;
  description: string;
}

// 1. Tayyor mahsulotlarni yuklash va jo'natish sxemasi (13 ta bosqich - 533 daqiqa)
export const OFFICIAL_FINISHED_GOODS_STAGES: OfficialStageNorm[] = [
  { stepNumber: 1, name: "Kengsoy bekatida vagonlarni qabul qilish va GU-45 rasmiylashtirish", responsible: "TYTTX xodimlari", standardMinutes: 20, standardHours: 0.33, description: "Vagonlar holatini tekshirish, GU-45 shaklidagi eslatma tuzish" },
  { stepNumber: 2, name: "Kirishda tekshiruv o'tkazish", responsible: "Qo'riqlash xizmati xodimlari", standardMinutes: 40, standardHours: 0.67, description: "Tashqi predmetlar va nuqsonlar yo'qligini vizual tekshirish" },
  { stepNumber: 3, name: "Temir yo'l tarozisida og'irligini o'lchash (Tara)", responsible: "TYTTX va Qo'riqlash xizmati", standardMinutes: 38, standardHours: 0.63, description: "Tara og'irligini aniqlash va 1C ga kiritish" },
  { stepNumber: 4, name: "Tushirish va yuklashga qo'yib berish", responsible: "TYTTX xodimlari", standardMinutes: 30, standardHours: 0.5, description: "Belgilangan estakadalarga yetkazib berish" },
  { stepNumber: 5, name: "Yuklashga tayyorlash (lyuklarni tozalash va qoplash)", responsible: "TM va XAS, TMT xodimlari", standardMinutes: 60, standardHours: 1.0, description: "Lyuklarni qoplash, quyish moslamalarini ulash" },
  { stepNumber: 6, name: "Tayyor mahsulotlarni yuklash", responsible: "TM va XAS, TMT xodimlari", standardMinutes: 135, standardHours: 2.25, description: "Polietilen xalta yuklash / Suyuq uglevodorodlarni quyish" },
  { stepNumber: 7, name: "Tarozida og'irligini o'lchash uchun taqdim qilish", responsible: "TYTTX xodimlari", standardMinutes: 30, standardHours: 0.5, description: "Estakadadan taroziga harakatlantirish" },
  { stepNumber: 8, name: "Tarozida og'irligini o'lchash va tamg'alash (Brutto)", responsible: "TYTTX, Qo'riqlash, ICHDX", standardMinutes: 50, standardHours: 0.83, description: "Brutto og'irligini aniqlash va tamg'alash" },
  { stepNumber: 9, name: "Kuzatuv maydonchasiga tekshiruvga taqdim qilish", responsible: "TYTTX xodimlari", standardMinutes: 10, standardHours: 0.17, description: "Kuzatuv maydonchasiga yetkazish" },
  { stepNumber: 10, name: "Chiqishda tekshiruv o'tkazish", responsible: "Qo'riqlash xizmati xodimlari", standardMinutes: 40, standardHours: 0.67, description: "Tashqi predmetlar va nuqsonlar yo'qligini vizual tekshirish" },
  { stepNumber: 11, name: "Yuklab chiqariladigan mahsulot hujjatini rasmiylashtirish", responsible: "ICHDX xodimi", standardMinutes: 50, standardHours: 0.83, description: "No2-sonli nazorat o'tish joyiga mahsulot hujjatlarini taqdim qilish" },
  { stepNumber: 12, name: "Yuklangan vagonlarni stansiyaga olib chiqish", responsible: "TYTTX xodimlari", standardMinutes: 10, standardHours: 0.17, description: "Kengsoy stansiyasiga olib chiqish" },
  { stepNumber: 13, name: "Vagonlarni stansiya ishchi-xodimlariga topshirish", responsible: "TYTTX xodimlari", standardMinutes: 20, standardHours: 0.33, description: "Stansiya xodimlariga topshirish va rasmiylashtirish" },
];

export const DEFAULT_TARIFF_SETTINGS: LogisticsTariffSettings = {
  hourlyPenaltyUzs: 65000,
  normativeHoursTashqi: 8.9, // 533 daqiqa (8 soat 53 daqiqa) — Sho'rtan GKM Bosh direktori tasdiqlagan Jarayon reglamenti Tahrir 2
  normativeHoursMajmua: 12,  // Majmua o'z vagonlari uchun texnologik zaxira
  warningHoursTashqi: 6.0,   // 6 soatdan keyin sariq ogohlantirish zonasi
  underloadLossPerTonUzs: 50000,
};

const SETTINGS_KEY = 'etransport_logistics_tariffs';

export function getTariffSettings(): LogisticsTariffSettings {
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Eski 24 soatlik me'yorni avtomatik ShGKM Bosh direktori tasdiqlagan rasmiy 8.9 soat (533 daqiqa) ga yangilash
        if (parsed.normativeHoursTashqi === 24 || !parsed.normativeHoursTashqi) {
          parsed.normativeHoursTashqi = DEFAULT_TARIFF_SETTINGS.normativeHoursTashqi;
        }
        if (parsed.warningHoursTashqi === 18 || !parsed.warningHoursTashqi) {
          parsed.warningHoursTashqi = DEFAULT_TARIFF_SETTINGS.warningHoursTashqi;
        }
        if (parsed.normativeHoursMajmua === 36 || !parsed.normativeHoursMajmua) {
          parsed.normativeHoursMajmua = DEFAULT_TARIFF_SETTINGS.normativeHoursMajmua;
        }
        return { ...DEFAULT_TARIFF_SETTINGS, ...parsed };
      }
    }
  } catch (e) {
    // fallback
  }
  return DEFAULT_TARIFF_SETTINGS;
}

export function saveTariffSettings(settings: LogisticsTariffSettings): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      window.dispatchEvent(new CustomEvent('etransport:tariffs-updated', { detail: settings }));
    }
  } catch (e) {
    // ignore
  }
}

export interface ProductCapacityConfig {
  nominalCapacityTons: number;
  minNormalTons: number;
  maxNormalTons: number;
  label: string;
}

/**
 * Mahsulot turi va vagon tipiga qarab standart yuklash/pasport sig'imi me'yorlari:
 * - Suyultirilgan gaz: ~32.0 t (sisterna hajmi 75-84 m³, zichligi ~0.52 t/m³, 85% to'ldirish chegarasi)
 * - Buten-1: ~36.0 t (gaz sisternasi, zichligi ~0.59 t/m³)
 * - Etilenning polimerlari (polietilen): 50.0 t (yopiq vagon, palletlar bilan to'liq sig'im)
 * - Tabiiy gaz kondensati: ~55.0 t (neft-gaz sisternasi, zichligi ~0.75 t/m³)
 * - Oltingugurt (sera): ~64.0 t (poluvagon/yopiq vagon)
 * - Standart boshqa vagonlar: 66.0 t
 */
export function getProductCapacityConfig(
  productType?: string | null,
  wagonType?: string | null
): ProductCapacityConfig {
  const p = (productType || '').toLowerCase();
  const w = (wagonType || '').toLowerCase();

  // 1. Suyultirilgan gaz (LPG / Propan-butan)
  if (
    p.includes('suyultirilgan') ||
    p.includes('lpg') ||
    p.includes('propan') ||
    p.includes('butan') ||
    w.includes('suyultirilgan')
  ) {
    return {
      nominalCapacityTons: 32.0,
      minNormalTons: 29.5,
      maxNormalTons: 33.5,
      label: 'Suyultirilgan gaz (Norma: ~32.0 t)',
    };
  }

  // 2. Buten-1 monomer
  if (p.includes('buten')) {
    return {
      nominalCapacityTons: 36.0,
      minNormalTons: 33.0,
      maxNormalTons: 38.0,
      label: 'Buten-1 (Norma: ~36.0 t)',
    };
  }

  // 3. Etilenning polimerlari (Polietilen granula)
  if (
    p.includes('polietilen') ||
    p.includes('etilen') ||
    p.includes('granula') ||
    w.includes('granula')
  ) {
    return {
      nominalCapacityTons: 50.0,
      minNormalTons: 47.0,
      maxNormalTons: 51.5,
      label: 'Polietilen (Norma: 50.0 t)',
    };
  }

  // 4. Tabiiy gaz kondensati
  if (p.includes('kondensat') || w.includes('kondensat')) {
    return {
      nominalCapacityTons: 55.0,
      minNormalTons: 50.0,
      maxNormalTons: 60.0,
      label: 'Gaz kondensati (Norma: ~55.0 t)',
    };
  }

  // 5. Oltingugurt (Sera)
  if (p.includes('oltingugurt') || p.includes('sera') || w.includes('sera')) {
    return {
      nominalCapacityTons: 64.0,
      minNormalTons: 58.0,
      maxNormalTons: 66.5,
      label: 'Oltingugurt (Norma: ~64.0 t)',
    };
  }

  // Standart umumiy vagon sig'imi
  return {
    nominalCapacityTons: 66.0,
    minNormalTons: 62.0,
    maxNormalTons: 68.5,
    label: 'Standart vagon (66.0 t)',
  };
}

export const DEFAULT_CAPACITY_TONS = 68.0;

function parseHoursDiff(fromIso?: string | null, toIso?: string | null): number {
  if (!fromIso) return 0;
  const t1 = new Date(fromIso).getTime();
  const t2 = toIso ? new Date(toIso).getTime() : Date.now();
  if (isNaN(t1) || isNaN(t2) || t2 <= t1) return 0;
  return Math.round(((t2 - t1) / (1000 * 60 * 60)) * 10) / 10;
}

export function buildDemurrageAnalysis(
  arrivals: EmptyWagonArrival[],
  registries: LoadingRegistry[],
  nowMs: number = Date.now(),
  customSettings?: LogisticsTariffSettings
): { items: DemurrageWagonItem[]; summary: DemurrageSummary } {
  const settings = customSettings || getTariffSettings();
  const items: DemurrageWagonItem[] = [];
  const nowDate = new Date(nowMs);

  const registryByArrivalId = new Map<string, LoadingRegistry>();
  const registryWagonMap = new Map<string, { contractor: string; station: string; exitedAt?: string | null; regNumber?: string; preparedAt?: string | null; preparedByName?: string }>();
  const wagonGlobalExitMap = new Map<string, { contractor: string; station: string; exitedAt?: string | null; regNumber?: string; preparedAt?: string | null; preparedByName?: string }>();

  for (const reg of registries) {
    if (reg.emptyWagonArrivalId) registryByArrivalId.set(reg.emptyWagonArrivalId, reg);
    for (const rw of reg.wagonRoutes || []) {
      const wNum = (rw.wagonNumber || (rw as any).WagonNumber || '').trim();
      if (!wNum) continue;

      const exitedAt = reg.exitedToKengsoyAt ? reg.exitedToKengsoyAt : null;
      const info = {
        contractor: rw.contractorName || (rw as any).ContractorName || reg.contractorName || '',
        station: rw.destinationStation || (rw as any).DestinationStation || reg.destinationStation || '',
        exitedAt,
        regNumber: reg.registryNumber,
        preparedAt: reg.preparedAt,
        preparedByName: reg.preparedByName,
      };

      const srcArr = rw.sourceArrivalId || (rw as any).SourceArrivalId || reg.emptyWagonArrivalId || '';
      if (srcArr) registryWagonMap.set(`${srcArr}_${wNum}`, info);
      if (reg.emptyWagonArrivalId) registryWagonMap.set(`${reg.emptyWagonArrivalId}_${wNum}`, info);

      const prev = wagonGlobalExitMap.get(wNum);
      if (!prev) {
        wagonGlobalExitMap.set(wNum, info);
      } else if (exitedAt) {
        if (!prev.exitedAt || new Date(exitedAt).getTime() > new Date(prev.exitedAt).getTime()) {
          wagonGlobalExitMap.set(wNum, info);
        }
      }
    }
  }

  for (const arrival of arrivals) {
    if (arrival.stage === 'Cancelled' || isOneCArrival(arrival)) continue;
    const arrivalUnits = workUnits(arrival);
    const arrivalIso = arrival.arrivalDate || arrival.createdAt;
    const reg = registryByArrivalId.get(arrival.id);

    for (const unit of arrivalUnits) {
      if (!unit.wagonNumber || !unit.wagonNumber.trim()) continue;

      const isMajmua = normalizeWagonOwnership(unit.ownership) === WAGON_OWNERSHIP.Majmua;
      const ownership = isMajmua ? 'majmua' : 'tashqi';
      const normHours = isMajmua ? settings.normativeHoursMajmua : settings.normativeHoursTashqi;

      const wNum = (unit.wagonNumber || '').trim();
      const regWagon = registryWagonMap.get(`${arrival.id}_${wNum}`);
      const isArrivalExited = arrival.stage === 'Exited';

      let resolvedExitIso: string | null = null;
      // Nuqsonli qaytarilgan vagon (Returned) — zavoddan ketmagan, lekin
      // Prostoy (Demurrage) hisobida «faol» sifatida hisoblanmasligi kerak.
      const isReturnedUnit = unit.status === 'Returned';

      if (unit.scaleExitedAt) {
        resolvedExitIso = unit.scaleExitedAt;
      } else if (regWagon?.exitedAt) {
        resolvedExitIso = regWagon.exitedAt;
      } else if (reg?.emptyWagonArrivalId === arrival.id && reg?.exitedToKengsoyAt && (!unit.status || unit.status === 'Exited' || unit.status === 'Departed')) {
        resolvedExitIso = reg.exitedToKengsoyAt;
      } else if (isArrivalExited && (!unit.status || unit.status === 'Exited' || unit.status === 'Departed')) {
        resolvedExitIso = (arrival as any).updatedAt || arrival.createdAt;
      } else if (isReturnedUnit) {
        // Returned (nuqsonli) vagon — dalolatnoma bilan qaytarilgan.
        // Prostoy hisoblanmaydi: isExited=true bo'ladi, activeItems'ga qo'shilmaydi.
        // hoursInPlant = 0 (arrivalIso bilan bir xil qiymat).
        resolvedExitIso = arrivalIso;
      }

      // Agar unitning o'zida scaleExitedAt bo'lmasa va statusi chiqib ketmagan bo'lsa
      // (masalan ToRailwayScale, Loading), u holda vagon HALI ZAVODDA turibdi!
      const isExited = Boolean(resolvedExitIso);
      const exitIso = resolvedExitIso;

      const hoursInPlant = parseHoursDiff(arrivalIso, exitIso || nowDate.toISOString());

      let zone: 'green' | 'yellow' | 'red' = 'green';
      if (ownership === 'tashqi') {
        if (hoursInPlant >= settings.normativeHoursTashqi) zone = 'red';
        else if (hoursInPlant >= settings.warningHoursTashqi) zone = 'yellow';
        else zone = 'green';
      } else {
        if (hoursInPlant >= settings.normativeHoursMajmua) zone = 'red';
        else if (hoursInPlant >= settings.normativeHoursTashqi) zone = 'yellow';
        else zone = 'green';
      }

      const overdueHours = Math.max(0, Math.round((hoursInPlant - normHours) * 10) / 10);
      const estimatedPenaltyUzs = ownership === 'tashqi' ? Math.round(overdueHours * settings.hourlyPenaltyUzs) : 0;

      let fifoPriority = 100;
      if (ownership === 'tashqi') {
        if (zone === 'red') fifoPriority = 1;
        else if (zone === 'yellow') fifoPriority = 2;
        else fifoPriority = 4;
      } else {
        if (zone === 'red') fifoPriority = 3;
        else if (zone === 'yellow') fifoPriority = 5;
        else fifoPriority = 6;
      }

      const toTare = unit.tareWeighedAt ? parseHoursDiff(arrivalIso, unit.tareWeighedAt) : parseHoursDiff(arrivalIso, nowDate.toISOString());
      const loading = unit.loadingCompletedAt && unit.loadingStartedAt
        ? parseHoursDiff(unit.loadingStartedAt, unit.loadingCompletedAt)
        : unit.loadingStartedAt
          ? parseHoursDiff(unit.loadingStartedAt, nowDate.toISOString())
          : 0;
      const toGross = unit.grossWeighedAt && unit.loadingCompletedAt
        ? parseHoursDiff(unit.loadingCompletedAt, unit.grossWeighedAt)
        : 0;
      const sealing = unit.sealedAt && unit.grossWeighedAt
        ? parseHoursDiff(unit.grossWeighedAt, unit.sealedAt)
        : 0;
      const dispatch = exitIso && (unit.sealedAt || unit.grossWeighedAt)
        ? parseHoursDiff(unit.sealedAt || unit.grossWeighedAt, exitIso)
        : 0;

      // Stopwatch: Har bir bosqichning xronometraji (Daqiqabay hisoblagichi)
      const stageBreakdown: WagonStageStopwatchItem[] = [];

      // 1. Kengsoyda qabul qilish, ko‘rik va Tara tortish
      const tareDone = Boolean(unit.tareWeighedAt);
      const hTare = toTare;
      const stdTare = 2.1;
      const ovdTare = Math.max(0, Math.round((hTare - stdTare) * 10) / 10);
      stageBreakdown.push({
        stageNumber: 1,
        stageName: 'Kengsoyda qabul, ko‘rik va Tara tortish',
        role: "TYTTX va Qo‘riqlash / Tarozi",
        standardHours: stdTare,
        actualHours: hTare,
        overdueHours: ovdTare,
        isOverdue: ovdTare > 0,
        status: tareDone ? 'done' : 'active',
        penaltyShareUzs: 0,
        description: 'Vagon Kengsoy stansiyasidan zavod darvozasi orqali kirishi va bo‘sh vazni (tara) o‘lchanishi.',
      });

      // 2. Estakadada yuklashga tayyorlash va yuklash
      const loadDone = Boolean(unit.loadingCompletedAt);
      const hLoad = loading;
      const stdLoad = 3.25;
      const ovdLoad = Math.max(0, Math.round((hLoad - stdLoad) * 10) / 10);
      stageBreakdown.push({
        stageNumber: 2,
        stageName: 'Estakadada yuklashga tayyorlash va yuklash',
        role: "TM va XAS, TMT sexi",
        standardHours: stdLoad,
        actualHours: hLoad,
        overdueHours: ovdLoad,
        isOverdue: ovdLoad > 0,
        status: loadDone ? 'done' : (unit.loadingStartedAt || tareDone ? 'active' : 'pending'),
        penaltyShareUzs: 0,
        responsibleEmployee: (unit as any).loadingCompletedByName,
        description: 'Vagonni estakadaga qo‘yish, lyuklarini ochish/tozalash va mahsulotni to‘ldirish.',
      });

      // 3. Brutto tortish va tamg‘alash
      const grossDone = Boolean(unit.grossWeighedAt);
      const hGross = toGross;
      const stdGross = 1.3;
      const ovdGross = Math.max(0, Math.round((hGross - stdGross) * 10) / 10);
      stageBreakdown.push({
        stageNumber: 3,
        stageName: 'Brutto tortish va tamg‘alash',
        role: "TYTTX va Tarozi xizmati",
        standardHours: stdGross,
        actualHours: hGross,
        overdueHours: ovdGross,
        isOverdue: ovdGross > 0,
        status: grossDone ? 'done' : (loadDone ? 'active' : 'pending'),
        penaltyShareUzs: 0,
        description: 'Yuklangan vagonning to‘la vaznini o‘lchash va texnologik tamg‘alash.',
      });

      // 4. Chiqish ko‘rigi va plombalash
      const sealDone = Boolean(unit.sealedAt);
      const hSeal = sealing;
      const stdSeal = 0.7;
      const ovdSeal = Math.max(0, Math.round((hSeal - stdSeal) * 10) / 10);
      stageBreakdown.push({
        stageNumber: 4,
        stageName: 'Chiqish ko‘rigi va xavfsizlik nazorati',
        role: "Qo‘riqlash xizmati (2-batalyon)",
        standardHours: stdSeal,
        actualHours: hSeal,
        overdueHours: ovdSeal,
        isOverdue: ovdSeal > 0,
        status: sealDone ? 'done' : (grossDone ? 'active' : 'pending'),
        penaltyShareUzs: 0,
        description: 'Vagonning lyuklari, qopqoqlari va xavfsizlik talablarini tekshirish, plomba o‘rnatish.',
      });

      // 5. Mahsulot yuk xatini shakllantirish
      const regObj = regWagon?.regNumber
        ? (registries.find(r => r.registryNumber === regWagon.regNumber) || reg)
        : (reg && (reg.wagonRoutes || []).some(rw => (rw.wagonNumber || (rw as any).WagonNumber || '').trim() === wNum) ? reg : undefined);
      const docDone = Boolean(regObj?.preparedAt || regWagon?.preparedAt);
      const hDoc = docDone
        ? parseHoursDiff(unit.sealedAt || unit.grossWeighedAt, regObj?.preparedAt || regWagon?.preparedAt)
        : (sealDone ? parseHoursDiff(unit.sealedAt || unit.grossWeighedAt, nowDate.toISOString()) : 0);
      const stdDoc = 0.8;
      const ovdDoc = Math.max(0, Math.round((hDoc - stdDoc) * 10) / 10);
      stageBreakdown.push({
        stageNumber: 5,
        stageName: 'Mahsulot yuk xatini shakllantirish',
        role: "ICHDX iqtisodchisi",
        standardHours: stdDoc,
        actualHours: hDoc,
        overdueHours: ovdDoc,
        isOverdue: ovdDoc > 0,
        status: docDone ? 'done' : (sealDone ? 'active' : 'pending'),
        penaltyShareUzs: 0,
        responsibleEmployee: regObj?.preparedByName || regWagon?.preparedByName,
        description: 'ICHDX iqtisodchisi tomonidan buyurtmaga asosan yuk xatini (reestr) shakllantirish.',
      });

      // 6. ICHDX smena boshlig‘i kelishuvi
      const shiftDone = Boolean(regObj?.isApprovedByShiftSupervisor);
      const hShift = shiftDone
        ? parseHoursDiff(regObj?.preparedAt, regObj?.shiftSupervisorApprovedAt || regObj?.preparedAt)
        : (docDone && !shiftDone ? parseHoursDiff(regObj?.preparedAt, nowDate.toISOString()) : 0);
      const stdShift = 0.3;
      const ovdShift = Math.max(0, Math.round((hShift - stdShift) * 10) / 10);
      stageBreakdown.push({
        stageNumber: 6,
        stageName: 'ICHDX smena boshlig‘i kelishuvi',
        role: "ICHDX smena boshlig‘i",
        standardHours: stdShift,
        actualHours: hShift,
        overdueHours: ovdShift,
        isOverdue: ovdShift > 0,
        status: shiftDone ? 'done' : (docDone ? 'active' : 'pending'),
        penaltyShareUzs: 0,
        responsibleEmployee: regObj?.shiftSupervisorApprovedByName,
        description: 'Smena boshlig‘i tomonidan vagon yuklanishi va ma’lumotlar to‘g‘riligini tasdiqlash.',
      });

      // 7. Ruxsatnoma byurosi kelishuvi
      const permitDone = Boolean(regObj?.isApprovedByPermit);
      const hPermit = permitDone
        ? parseHoursDiff(regObj?.shiftSupervisorApprovedAt || regObj?.preparedAt, regObj?.permitApprovedAt || regObj?.preparedAt)
        : (docDone && shiftDone && !permitDone ? parseHoursDiff(regObj?.shiftSupervisorApprovedAt || regObj?.preparedAt, nowDate.toISOString()) : 0);
      const stdPermit = 0.4;
      const ovdPermit = Math.max(0, Math.round((hPermit - stdPermit) * 10) / 10);
      stageBreakdown.push({
        stageNumber: 7,
        stageName: 'Ruxsatnoma byurosi kelishuvi',
        role: "Ruxsatnoma byurosi",
        standardHours: stdPermit,
        actualHours: hPermit,
        overdueHours: ovdPermit,
        isOverdue: ovdPermit > 0,
        status: permitDone ? 'done' : (shiftDone ? 'active' : 'pending'),
        penaltyShareUzs: 0,
        responsibleEmployee: regObj?.permitApprovedByName,
        description: 'Ruxsatnoma byurosi tomonidan yuklangan vagonning chiqishiga ruxsat berish.',
      });

      // 8. Qo‘riqlash xizmati chiqish ruxsati
      const secDone = Boolean(regObj?.isApprovedBySecurity);
      const hSec = secDone
        ? parseHoursDiff(regObj?.permitApprovedAt || regObj?.preparedAt, regObj?.securityApprovedAt || regObj?.preparedAt)
        : (docDone && permitDone && !secDone ? parseHoursDiff(regObj?.permitApprovedAt || regObj?.preparedAt, nowDate.toISOString()) : 0);
      const stdSec = 0.7;
      const ovdSec = Math.max(0, Math.round((hSec - stdSec) * 10) / 10);
      stageBreakdown.push({
        stageNumber: 8,
        stageName: 'Qo‘riqlash xizmati chiqish ruxsati',
        role: "Qo‘riqlash xizmati (2-batalyon)",
        standardHours: stdSec,
        actualHours: hSec,
        overdueHours: ovdSec,
        isOverdue: ovdSec > 0,
        status: secDone ? 'done' : (permitDone ? 'active' : 'pending'),
        penaltyShareUzs: 0,
        responsibleEmployee: regObj?.securityApprovedByName,
        description: 'Qo‘riqlash xizmati tomonidan yuk xati va vagon plombalarini taqqoslab, ruxsat etish.',
      });

      // 9. Kengsoy stansiyasiga olib chiqish
      const exitDone = isExited;
      const hExit = exitDone
        ? parseHoursDiff(regObj?.securityApprovedAt || regObj?.preparedAt || unit.sealedAt, exitIso)
        : (secDone ? parseHoursDiff(regObj?.securityApprovedAt || regObj?.preparedAt, nowDate.toISOString()) : 0);
      const stdExit = 0.5;
      const ovdExit = Math.max(0, Math.round((hExit - stdExit) * 10) / 10);
      stageBreakdown.push({
        stageNumber: 9,
        stageName: 'Kengsoy stansiyasiga olib chiqish',
        role: "TYTTX xodimlari",
        standardHours: stdExit,
        actualHours: hExit,
        overdueHours: ovdExit,
        isOverdue: ovdExit > 0,
        status: exitDone ? 'done' : (secDone ? 'active' : 'pending'),
        penaltyShareUzs: 0,
        description: 'Temir yo‘l (mashinist) tomonidan vagonlarni zavoddan Kengsoy stansiyasiga olib chiqish.',
      });

      // 10. 1C va E-nakl ro‘yxatidan o‘tkazish
      const extDone = Boolean(regObj?.isSentToOneC && regObj?.isSentToENakl);
      const hExt = extDone
        ? parseHoursDiff(regObj?.exitedToKengsoyAt, regObj?.sentToOneCAt || regObj?.sentToENaklAt || regObj?.exitedToKengsoyAt)
        : (exitDone && !extDone ? parseHoursDiff(regObj?.exitedToKengsoyAt, nowDate.toISOString()) : 0);
      const stdExt = 0.5;
      const ovdExt = Math.max(0, Math.round((hExt - stdExt) * 10) / 10);
      stageBreakdown.push({
        stageNumber: 10,
        stageName: '1C va E-nakl ro‘yxatidan o‘tkazish',
        role: "ICHDX iqtisodchisi",
        standardHours: stdExt,
        actualHours: hExt,
        overdueHours: ovdExt,
        isOverdue: ovdExt > 0,
        status: extDone ? 'done' : (exitDone ? 'active' : 'pending'),
        penaltyShareUzs: 0,
        description: 'Vagonlar chiqqandan so‘ng 1C va E-nakl tizimlarida ro‘yxatdan o‘tkazish.',
      });

      // Jarimani aynan qaysi xizmatlar me’yorni oshirgan bo‘lsa, ularning oshgan soatlariga qarab proporsional taqsimlaymiz
      const totalStageOverdue = stageBreakdown.reduce((sum, s) => sum + s.overdueHours, 0);
      if (estimatedPenaltyUzs > 0 && totalStageOverdue > 0) {
        for (const stg of stageBreakdown) {
          if (stg.overdueHours > 0) {
            stg.penaltyShareUzs = Math.round((stg.overdueHours / totalStageOverdue) * estimatedPenaltyUzs);
          }
        }
      }

      // Asosiy kechikish sababchisini aniqlash
      let delayCulprit: DemurrageWagonItem['delayCulprit'] = undefined;
      // Faqat umumiy me'yor buzilgan bo'lsa (overdueHours > 0 va yashil zonadan chiqqan bo'lsa) kechikish sababchisi belgilanadi.
      // Endigina kirgan yoki hali 1C tarozi (tara) ma'lumoti kutilayotgan me'yordagi vagonlarga kechikish sababchisi yozilmaydi!
      const isNewlyArrived = !tareDone || unit.status === 'AwaitingTare' || !unit.status || unit.status === 'EntryInspection';
      if (zone !== 'green' && overdueHours > 0 && !isNewlyArrived) {
        const worstStage = [...stageBreakdown]
          .filter(s => s.isOverdue && s.status !== 'pending')
          .sort((a, b) => b.overdueHours - a.overdueHours)[0];
        if (worstStage) {
          delayCulprit = {
            role: worstStage.role,
            stageName: worstStage.stageName,
            hours: worstStage.overdueHours,
            explanation: `${worstStage.role}: «${worstStage.stageName}»da me’yordan ${worstStage.overdueHours} soat ko‘p ushlangan (Amalda: ${worstStage.actualHours}s, Me’yor: ${worstStage.standardHours}s)`,
            employee: worstStage.responsibleEmployee,
          };
        }
      }

      let currentStep: DemurrageWagonItem['currentStep'] = 'intake';
      let stageLabel = 'Kirishda';
      if (isReturnedUnit) {
        // Nuqsonli qaytarilgan vagon — alohida holat, demurrage hisoblanmaydi
        currentStep = 'intake';
        stageLabel = 'Nuqsonli (Qaytarilgan — Dalolatnoma)';
      } else if (isExited) {
        currentStep = 'exited';
        stageLabel = 'Chiqib ketgan (Kengsoy)';
      } else if (unit.status === 'Ready' || unit.status === 'Sealed' || Boolean(unit.sealedAt)) {
        currentStep = 'ready';
        stageLabel = 'Chiqishga tayyor (Plombalangan)';
      } else if (unit.status === 'SealPending') {
        currentStep = 'seal';
        stageLabel = 'Plomba kutilmoqda';
      } else if (unit.status === 'GrossWeighed' || Boolean(unit.grossWeighedAt)) {
        currentStep = 'scale';
        stageLabel = 'Brutto tortilgan';
      } else if (unit.status === 'ToRailwayScale' || unit.status === 'Loaded' || Boolean(unit.loadingCompletedAt)) {
        currentStep = 'scale';
        stageLabel = 'Yuklangan (Taroziga navbat)';
      } else if (unit.status === 'Loading' || Boolean(unit.loadingStartedAt)) {
        currentStep = 'loading';
        stageLabel = 'Estakadada yuklanmoqda';
      } else if (unit.status === 'Estakada' || unit.status === 'EstakadaPlaced') {
        currentStep = 'loading';
        stageLabel = 'Estakadada (Yuklashga tayyor)';
      } else if (unit.status === 'Tared' || Boolean(unit.tareWeighedAt)) {
        currentStep = 'loading';
        stageLabel = 'Tara olingan (Estakada kutilmoqda)';
      } else {
        currentStep = 'tare';
        stageLabel = 'Tara kutilmoqda';
      }

      const tare = parseFloat(unit.tareWeight || '0') || 0;
      const gross = parseFloat(unit.grossWeight || '0') || 0;
      const netto = unit.nettoWeight ? parseFloat(String(unit.nettoWeight)) : (gross > tare && tare > 0 ? Math.round((gross - tare) * 100) / 100 : null);
      const capCfg = getProductCapacityConfig(unit.productType || arrival.productType, unit.wagonType);
      const capacityTons = capCfg.nominalCapacityTons;
      let weightDiff = 0;
      let weightStatus: DemurrageWagonItem['weightStatus'] = 'unweighed';

      if (netto !== null && netto > 5) {
        weightDiff = Math.round((netto - capacityTons) * 100) / 100;
        if (netto > capCfg.maxNormalTons) weightStatus = 'overload';
        else if (netto < capCfg.minNormalTons) weightStatus = 'underload';
        else weightStatus = 'normal';
      }

      items.push({
        id: `${arrival.id}_${unit.wagonNumber}`,
        wagonNumber: unit.wagonNumber,
        arrivalId: arrival.id,
        arrivalNumber: arrival.arrivalNumber,
        arrivalDate: arrivalIso,
        ownership,
        wagonType: unit.wagonType || 'Sisterna',
        productType: unit.productType || arrival.productType || 'Suyultirilgan gaz',
        status: unit.status,
        stageLabel,
        hoursInPlant,
        zone,
        normativeHours: normHours,
        overdueHours,
        estimatedPenaltyUzs,
        fifoPriority,
        currentStep,
        stepHours: { toTare, loading, toGross, sealing, dispatch },
        tareWeight: unit.tareWeight,
        grossWeight: unit.grossWeight,
        nettoWeight: netto,
        capacityTons,
        weightDiff,
        weightStatus,
        contractorName: regWagon?.contractor || reg?.contractorName,
        destinationStation: regWagon?.station || reg?.destinationStation,
        defectActNumber: unit.defectActNumber,
        defectReason: unit.defectActType || arrival.notes,
        isExited,
        exitedAt: exitIso,
        delayCulprit,
        stageBreakdown,
      });
    }
  }

  items.sort((a, b) => {
    if (a.isExited !== b.isExited) return a.isExited ? 1 : -1;
    if (a.fifoPriority !== b.fifoPriority) return a.fifoPriority - b.fifoPriority;
    return b.hoursInPlant - a.hoursInPlant;
  });

  const activeItems = items.filter(x => !x.isExited);
  const redCount = activeItems.filter(x => x.zone === 'red').length;
  const yellowCount = activeItems.filter(x => x.zone === 'yellow').length;
  const greenCount = activeItems.filter(x => x.zone === 'green').length;
  const tashqiCount = activeItems.filter(x => x.ownership === 'tashqi').length;
  const majmuaCount = activeItems.filter(x => x.ownership === 'majmua').length;
  const redTashqiCount = activeItems.filter(x => x.ownership === 'tashqi' && x.zone === 'red').length;
  const totalPenaltyUzs = activeItems.reduce((sum, x) => sum + x.estimatedPenaltyUzs, 0);
  const avgHoursInPlant = activeItems.length > 0
    ? Math.round((activeItems.reduce((sum, x) => sum + x.hoursInPlant, 0) / activeItems.length) * 10) / 10
    : 0;

  const withTare = items.filter(x => x.stepHours.toTare > 0);
  const withLoad = items.filter(x => x.stepHours.loading > 0);
  const withGross = items.filter(x => x.stepHours.toGross > 0);
  const withSeal = items.filter(x => x.stepHours.sealing > 0);
  const withDisp = items.filter(x => x.stepHours.dispatch > 0);

  const tareAvgHours = withTare.length ? Math.round((withTare.reduce((s, x) => s + x.stepHours.toTare, 0) / withTare.length) * 10) / 10 : 0;
  const loadingAvgHours = withLoad.length ? Math.round((withLoad.reduce((s, x) => s + x.stepHours.loading, 0) / withLoad.length) * 10) / 10 : 0;
  const scaleAvgHours = withGross.length ? Math.round((withGross.reduce((s, x) => s + x.stepHours.toGross, 0) / withGross.length) * 10) / 10 : 0;
  const sealAvgHours = withSeal.length ? Math.round((withSeal.reduce((s, x) => s + x.stepHours.sealing, 0) / withSeal.length) * 10) / 10 : 0;
  const dispatchAvgHours = withDisp.length ? Math.round((withDisp.reduce((s, x) => s + x.stepHours.dispatch, 0) / withDisp.length) * 10) / 10 : 0;

  const stagesList = [
    { name: 'Tara tortish navbati', val: tareAvgHours },
    { name: 'Estakada/Yuklash jarayoni', val: loadingAvgHours },
    { name: 'Brutto tarozi navbati', val: scaleAvgHours },
    { name: 'Plombalash va rasmiylashtirish', val: sealAvgHours },
    { name: 'Kengsoyga jo\'natish navbati', val: dispatchAvgHours },
  ].sort((a, b) => b.val - a.val);

  // Rollar (xizmatlar) bo'yicha kechikish antireytingi va keltirib chiqarilgan jarima summasi
  const roleAggregation: Record<string, { department: string; totalHours: number; count: number; totalPenaltyUzs: number; color: string }> = {
    "ICHDX smena boshlig‘i": { department: "Yuk xati kelishuvi (Me'yor: 0.3s)", totalHours: 0, count: 0, totalPenaltyUzs: 0, color: "text-amber-700 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800" },
    "Ruxsatnoma byurosi": { department: "Chiqish kelishuvi (Me'yor: 0.4s)", totalHours: 0, count: 0, totalPenaltyUzs: 0, color: "text-teal-700 bg-teal-50 dark:bg-teal-950/40 border-teal-300 dark:border-teal-800" },
    "Qo‘riqlash xizmati (2-batalyon)": { department: "Chiqish ko‘rigi va ruxsat (Me'yor: 0.7s)", totalHours: 0, count: 0, totalPenaltyUzs: 0, color: "text-rose-700 bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800" },
    "ICHDX iqtisodchisi": { department: "Yuk xati, 1C va E-nakl (Me'yor: 0.8s)", totalHours: 0, count: 0, totalPenaltyUzs: 0, color: "text-blue-700 bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800" },
    "TM va XAS, TMT sexi": { department: "Estakadada yuklash (Me'yor: 3.25s)", totalHours: 0, count: 0, totalPenaltyUzs: 0, color: "text-orange-700 bg-orange-50 dark:bg-orange-950/40 border-orange-300 dark:border-orange-800" },
    "TYTTX va Tarozi xizmati": { department: "Brutto tortish va tamg‘alash (Me'yor: 1.3s)", totalHours: 0, count: 0, totalPenaltyUzs: 0, color: "text-purple-700 bg-purple-50 dark:bg-purple-950/40 border-purple-300 dark:border-purple-800" },
    "TYTTX xodimlari": { department: "Kengsoy stansiyasiga olib chiqish (Me'yor: 0.5s)", totalHours: 0, count: 0, totalPenaltyUzs: 0, color: "text-sky-700 bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-800" },
    "TYTTX va Qo‘riqlash / Tarozi": { department: "Kengsoyda qabul va Tara tortish (Me'yor: 2.1s)", totalHours: 0, count: 0, totalPenaltyUzs: 0, color: "text-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-800" },
  };

  for (const it of items) {
    if (it.stageBreakdown) {
      for (const stg of it.stageBreakdown) {
        if (stg.overdueHours > 0) {
          const entry = roleAggregation[stg.role];
          if (entry) {
            entry.totalHours += stg.overdueHours;
            entry.count++;
            entry.totalPenaltyUzs += stg.penaltyShareUzs;
          } else {
            roleAggregation[stg.role] = {
              department: stg.stageName,
              totalHours: stg.overdueHours,
              count: 1,
              totalPenaltyUzs: stg.penaltyShareUzs,
              color: "text-slate-700 bg-slate-50 dark:bg-slate-800/40 border-slate-300 dark:border-slate-700",
            };
          }
        }
      }
    }
  }

  const roleDelayStats = Object.entries(roleAggregation)
    .filter(([_, v]) => v.count > 0)
    .map(([roleName, v]) => ({
      roleName,
      department: v.department,
      totalDelayHours: Math.round(v.totalHours * 10) / 10,
      delayedWagonsCount: v.count,
      totalPenaltyUzs: v.totalPenaltyUzs,
      color: v.color,
    }))
    .sort((a, b) => b.totalPenaltyUzs !== a.totalPenaltyUzs ? b.totalPenaltyUzs - a.totalPenaltyUzs : b.totalDelayHours - a.totalDelayHours);

  const summary: DemurrageSummary = {
    totalActive: activeItems.length,
    redCount,
    yellowCount,
    greenCount,
    tashqiCount,
    majmuaCount,
    redTashqiCount,
    totalPenaltyUzs,
    avgHoursInPlant,
    longestStayWagon: activeItems[0],
    stageBottlenecks: {
      tareAvgHours,
      loadingAvgHours,
      scaleAvgHours,
      sealAvgHours,
      dispatchAvgHours,
      bottleneckStage: stagesList[0]?.name || 'Estakada/Yuklash jarayoni',
    },
    totalExited: items.filter(x => x.isExited).length,
    roleDelayStats,
  };

  return { items, summary };
}

export function buildWeightAnalysis(
  arrivals: EmptyWagonArrival[],
  registries: LoadingRegistry[],
  customSettings?: LogisticsTariffSettings
): { items: WeightRecordItem[]; summary: WeightSummary } {
  const settings = customSettings || getTariffSettings();
  const items: WeightRecordItem[] = [];

  const regMap = new Map<string, { contractor: string; station: string }>();
  for (const reg of registries) {
    for (const rw of reg.wagonRoutes || []) {
      regMap.set(`${reg.emptyWagonArrivalId || ''}_${rw.wagonNumber.trim()}`, {
        contractor: rw.contractorName || reg.contractorName || '',
        station: rw.destinationStation || reg.destinationStation || '',
      });
    }
  }

  for (const arrival of arrivals) {
    if (arrival.stage === 'Cancelled' || isOneCArrival(arrival)) continue;
    const units = workUnits(arrival);
    for (const u of units) {
      const tare = parseFloat(u.tareWeight || '0');
      const gross = parseFloat(u.grossWeight || '0');
      const nettoVal = u.nettoWeight ? parseFloat(String(u.nettoWeight)) : (gross > tare && tare > 0 ? gross - tare : 0);
      if (nettoVal <= 5) continue;

      const capCfg = getProductCapacityConfig(u.productType || arrival.productType, u.wagonType);
      const capacityTons = capCfg.nominalCapacityTons;
      const netto = Math.round(nettoVal * 100) / 100;
      const diffTons = Math.round((netto - capacityTons) * 100) / 100;

      let status: WeightRecordItem['status'] = 'normal';
      let note = 'Me\'yorda yuklangan';
      let stationRisk = false;

      if (netto > capCfg.maxNormalTons) {
        status = 'overload';
        const over = Math.round((netto - capCfg.maxNormalTons) * 100) / 100;
        note = `Ortiqcha yuk (+${diffTons} t, me'yordan +${over} t oshiq). Kengsoy qabul qilmaslik xavfi!`;
        stationRisk = true;
      } else if (netto < capCfg.minNormalTons) {
        status = 'underload';
        const under = Math.round((capCfg.minNormalTons - netto) * 100) / 100;
        note = `Kam yuklangan (${Math.abs(diffTons)} t kam, me'yordan ${under} t kam). Bo'sh quvvat tashilgan.`;
      }

      const info = regMap.get(`${arrival.id}_${u.wagonNumber.trim()}`);

      items.push({
        wagonNumber: u.wagonNumber,
        arrivalNumber: arrival.arrivalNumber,
        productType: u.productType || arrival.productType || 'Mahsulot',
        date: u.grossWeighedAt || u.loadingCompletedAt || arrival.arrivalDate || arrival.createdAt,
        tareWeight: tare,
        grossWeight: gross,
        nettoWeight: netto,
        capacityTons,
        diffTons,
        status,
        note,
        contractorName: info?.contractor,
        destinationStation: info?.station,
        stationRisk,
      });
    }
  }

  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const overloadCount = items.filter(x => x.status === 'overload').length;
  const underloadCount = items.filter(x => x.status === 'underload').length;
  const normalCount = items.filter(x => x.status === 'normal').length;
  const totalExcessTons = Math.round(items.filter(x => x.status === 'overload').reduce((s, x) => s + x.diffTons, 0) * 10) / 10;
  const totalLostCapacityTons = Math.round(items.filter(x => x.status === 'underload').reduce((s, x) => s + Math.abs(x.diffTons), 0) * 10) / 10;
  const avgNettoTons = items.length ? Math.round((items.reduce((s, x) => s + x.nettoWeight, 0) / items.length) * 10) / 10 : 0;
  const overloadRatePercent = items.length ? Math.round((overloadCount / items.length) * 1000) / 10 : 0;

  const estimatedLostCapacityCostUzs = Math.round(totalLostCapacityTons * settings.underloadLossPerTonUzs);

  const summary: WeightSummary = {
    totalWeighed: items.length,
    overloadCount,
    underloadCount,
    normalCount,
    totalLostCapacityTons,
    totalExcessTons,
    avgNettoTons,
    overloadRatePercent,
    estimatedLostCapacityCostUzs,
  };

  return { items, summary };
}

function cleanContractorKey(s?: string | null): string {
  if (!s) return '';
  return s.trim().toLowerCase().replace(/['"«»`’]/g, '').replace(/\s+/g, ' ');
}

function parseWagonWeight(val: any): number {
  if (val == null) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const str = String(val).replace(',', '.').replace(/[^\d.-]/g, '').trim();
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

export function normalizeContractorName(name?: string | null): string {
  if (!name) return "Noma'lum";
  let s = name.trim().replace(/[«»“”]/g, '"');
  if (/navoi.*uran/i.test(s)) {
    return '"Navoiyuran" DK';
  }
  return s;
}

function cleanStationName(st?: string | null): string {
  if (!st) return 'Kengsoy';
  return st.trim().replace(/\s+\d{5,6}$/, '');
}

export function buildContractorLimitsAnalysis(
  orders: MonthlyOrder[],
  registries: LoadingRegistry[]
): {
  items: ContractorLimitItem[];
  totals: {
    totalPlanTons: number;
    totalLoadedTons: number;
    remainingTons: number;
    dangerCount: number;
    warningCount: number;
  };
} {
  // Aggregate registries by lineId, contractor+station, and contractor
  const byLineId = new Map<string, { tons: number; wagons: number; lastDate?: string }>();

  const trackLoaded = (
    map: Map<string, { tons: number; wagons: number; lastDate?: string }>,
    key: string,
    tons: number,
    wagons: number,
    date?: string | null
  ) => {
    if (!key) return;
    const curr = map.get(key) || { tons: 0, wagons: 0 };
    curr.tons += tons;
    curr.wagons += wagons;
    if (date && (!curr.lastDate || new Date(date) > new Date(curr.lastDate))) {
      curr.lastDate = date;
    }
    map.set(key, curr);
  };

  for (const reg of registries) {
    const regDate = reg.exitedToKengsoyAt || reg.preparedAt;
    const routes = reg.wagonRoutes || [];

    if (routes.length > 0) {
      for (const rw of routes) {
        const rwObj = rw as any;
        const w = parseWagonWeight(
          rwObj.netWeight ?? rwObj.NetWeight ?? rwObj.nettoWeight ?? rwObj.netto ?? 0
        );
        const lineId = (rwObj.monthlyOrderLineId || reg.monthlyOrderLineId || '').trim();

        if (lineId) {
          trackLoaded(byLineId, lineId, w, 1, regDate);
        }
      }
    } else {
      const regObj = reg as any;
      const w = parseWagonWeight(regObj.orderDeductedNetWeight ?? 0);
      const wagons = Number(regObj.orderDeductedWagons ?? regObj.wagonCount ?? 0) || 0;
      const lineId = (regObj.monthlyOrderLineId || '').trim();

      if (lineId) {
        trackLoaded(byLineId, lineId, w, wagons, regDate);
      }
    }
  }

  // Group by (Contractor + Station) so the same client is NEVER shown twice for the same destination,
  // and new waybills/orders correctly aggregate limits without false stop-limits.
  interface StationGroup {
    contractorName: string;
    contracts: Set<string>;
    productType: string;
    destinationStation: string;
    planTons: number;
    planWagons: number;
    loadedTons: number;
    loadedWagons: number;
    lastLoadedDate?: string;
  }

  const stationGroups = new Map<string, StationGroup>();

  for (const order of orders) {
    const contractNo = order.contractNumber || '—';
    const prodType = order.productType || 'Mahsulot';

    for (const line of order.lines || []) {
      const rawContractor = (line.contractor || order.contractNumber || "Noma'lum").trim();
      const contractorName = normalizeContractorName(rawContractor);
      const station = cleanStationName(line.destinationStation || 'Kengsoy');
      const groupKey = `${cleanContractorKey(contractorName)}__${cleanContractorKey(station)}`;

      let planTons = line.tonCount || 0;
      let planWagons = line.wagonCount || 0;

      // Defensive check: auto-convert kg to tons if entered incorrectly in kg
      if (planTons > 500 && planWagons <= 5 && (planTons / (planWagons || 1)) > 500) {
        planTons = Math.round((planTons / 1000) * 100) / 100;
      }

      // Check direct line fulfillment from backend
      const lineNetWeight = parseWagonWeight(line.fulfilledNetWeight);
      const lineFulfilledWagons = Number(line.fulfilledWagonCount) || 0;
      const byLineMatch = line.id ? byLineId.get(line.id) : undefined;

      let lineLoadedTons = 0;
      let lineLoadedWagons = 0;
      let lineLastDate: string | undefined = line.lastLoadingDate || undefined;

      if (lineNetWeight > 0 || lineFulfilledWagons > 0) {
        lineLoadedTons = lineNetWeight;
        lineLoadedWagons = lineFulfilledWagons;
      } else if (byLineMatch && (byLineMatch.tons > 0 || byLineMatch.wagons > 0)) {
        lineLoadedTons = byLineMatch.tons;
        lineLoadedWagons = byLineMatch.wagons;
        lineLastDate = lineLastDate || byLineMatch.lastDate;
      }

      let grp = stationGroups.get(groupKey);
      if (!grp) {
        grp = {
          contractorName,
          contracts: new Set<string>(),
          productType: prodType,
          destinationStation: station,
          planTons: 0,
          planWagons: 0,
          loadedTons: 0,
          loadedWagons: 0,
          lastLoadedDate: undefined,
        };
        stationGroups.set(groupKey, grp);
      }

      if (contractNo && contractNo !== '—') grp.contracts.add(contractNo);
      if (prodType && prodType !== 'Mahsulot') grp.productType = prodType;
      grp.planTons += planTons;
      grp.planWagons += planWagons;
      grp.loadedTons += lineLoadedTons;
      grp.loadedWagons += lineLoadedWagons;

      if (lineLastDate && (!grp.lastLoadedDate || new Date(lineLastDate) > new Date(grp.lastLoadedDate))) {
        grp.lastLoadedDate = lineLastDate;
      }
    }
  }

  const items: ContractorLimitItem[] = [];

  for (const grp of stationGroups.values()) {
    const planTons = Math.round(grp.planTons * 10) / 10;
    const planWagons = grp.planWagons;
    const loadedTons = Math.round(grp.loadedTons * 10) / 10;
    const loadedWagons = grp.loadedWagons;
    const remainingTons = Math.round(Math.max(0, planTons - loadedTons) * 10) / 10;
    const remainingWagons = Math.max(0, planWagons - loadedWagons);

    const progressPercent =
      planTons > 0 ? Math.min(150, Math.round((loadedTons / planTons) * 100)) : loadedTons > 0 ? 100 : 0;

    let status: ContractorLimitItem['status'] = 'ok';
    if (planTons > 0 && (remainingTons <= 0 || progressPercent >= 100)) {
      status = 'danger';
    } else if (progressPercent >= 85) {
      status = 'warning';
    }

    const contractsArr = Array.from(grp.contracts);
    const contractNumber = contractsArr.length > 0 ? contractsArr.join(', ') : '—';

    items.push({
      contractorName: grp.contractorName,
      orderNumber: contractNumber,
      contractNumber,
      productType: grp.productType,
      destinationStation: grp.destinationStation,
      planTons,
      planWagons,
      loadedTons,
      loadedWagons,
      remainingTons,
      remainingWagons,
      progressPercent,
      status,
      lastLoadedDate: grp.lastLoadedDate,
    });
  }

  // Sort: STOP limits first, then warning, then highest progress
  items.sort((a, b) => {
    if (a.status === 'danger' && b.status !== 'danger') return -1;
    if (b.status === 'danger' && a.status !== 'danger') return 1;
    return b.progressPercent - a.progressPercent;
  });

  const totalPlanTons = Math.round(items.reduce((s, x) => s + x.planTons, 0) * 10) / 10;
  const totalLoadedTons = Math.round(items.reduce((s, x) => s + x.loadedTons, 0) * 10) / 10;
  const remainingTons = Math.round(Math.max(0, totalPlanTons - totalLoadedTons) * 10) / 10;
  const dangerCount = items.filter(x => x.status === 'danger').length;
  const warningCount = items.filter(x => x.status === 'warning').length;

  return {
    items,
    totals: { totalPlanTons, totalLoadedTons, remainingTons, dangerCount, warningCount },
  };
}

export function buildDefectsGu23Analysis(
  arrivals: EmptyWagonArrival[],
  registries: LoadingRegistry[]
): {
  items: DefectGu23Item[];
  byStation: Array<{ station: string; count: number; percent: number }>;
  byType: Array<{ type: string; count: number; percent: number }>;
  totalDelayHours: number;
} {
  const items: DefectGu23Item[] = [];

  const regStationMap = new Map<string, string>();
  for (const r of registries) {
    for (const w of r.wagonRoutes || []) {
      if (w.destinationStation) regStationMap.set(w.wagonNumber.trim(), w.destinationStation);
    }
    if (r.destinationStation) regStationMap.set(r.emptyWagonArrivalId, r.destinationStation);
  }

  for (const arrival of arrivals) {
    if (arrival.stage === 'Cancelled' || isOneCArrival(arrival)) continue;
    const units = workUnits(arrival);
    const station = arrival.trackNumber ? `Yo'l #${arrival.trackNumber}` : regStationMap.get(arrival.id) || 'Kengsoy stansiyasi';

    for (const u of units) {
      const hasDefect = Boolean(u.defectActNumber || u.defectActType || u.status === 'Returned');
      if (!hasDefect) continue;

      const actNumber = u.defectActNumber || `GU-23-${arrival.arrivalNumber.slice(-4)}`;
      const actType = u.defectActType || (u.status === 'Returned' ? 'Yaroqsiz vagon (Qaytarilgan)' : 'Texnik nosozlik');
      const defectReason = arrival.notes || 'Lyuk/eshik yoki rama nuqsoni tufayli foydalanish taqiqlangan';
      const delayHours = parseHoursDiff(arrival.arrivalDate || arrival.createdAt, u.defectActUploadedAt || u.scaleExitedAt || arrival.createdAt);

      items.push({
        wagonNumber: u.wagonNumber,
        arrivalNumber: arrival.arrivalNumber,
        arrivalDate: arrival.arrivalDate || arrival.createdAt,
        actNumber,
        actType,
        defectReason,
        station: regStationMap.get(u.wagonNumber.trim()) || station,
        fileName: u.defectActFileName,
        uploadedAt: u.defectActUploadedAt || undefined,
        delayHours: Math.max(8, delayHours),
        isReturned: u.status === 'Returned',
      });
    }
  }

  items.sort((a, b) => new Date(b.arrivalDate).getTime() - new Date(a.arrivalDate).getTime());

  const stationCounts = new Map<string, number>();
  for (const it of items) {
    const s = it.station || 'Kengsoy st.';
    stationCounts.set(s, (stationCounts.get(s) || 0) + 1);
  }
  const total = items.length || 1;
  const byStation = Array.from(stationCounts.entries())
    .map(([station, count]) => ({ station, count, percent: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);

  const typeCounts = new Map<string, number>();
  for (const it of items) {
    const t = it.actType || 'Boshqa nosozlik';
    typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
  }
  const byType = Array.from(typeCounts.entries())
    .map(([type, count]) => ({ type, count, percent: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);

  const totalDelayHours = items.reduce((s, x) => s + x.delayHours, 0);

  return { items, byStation, byType, totalDelayHours };
}
