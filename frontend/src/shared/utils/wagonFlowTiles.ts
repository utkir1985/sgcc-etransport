import type { EmptyWagonArrival, EmptyWagonUnit, LoadingRegistry } from '../types';
import { isOneCArrival } from './oneCSources';
import { buildRegistryAlert, isRegistryReturned, needsPermitAgreement, needsSecurityAgreement, usesSequentialWorkflow } from './registryWorkflow';
import { hasMeasuredNet } from './wagonQueueState';

export interface WagonFlowTileInput {
  key: string;
  title: string;
  owner: string;
  desc: string;
  to: string;
  count: number;
  approvedAt?: string | null;
}

function maxIso(...vals: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  let bestMs = -1;
  for (const v of vals) {
    if (!v) continue;
    const ms = Date.parse(v);
    if (!Number.isNaN(ms) && ms >= bestMs) {
      bestMs = ms;
      best = v;
    }
  }
  return best;
}

function stageOf(a: EmptyWagonArrival): string {
  // Weighing and seal data may predate late registration. They are not entry approvals.
  return a.stage || 'KengsoyInspection';
}

/** Zanjir tartibi — bosqichdan o‘tganligini aniqlash uchun. */
export function wagonStageRank(stage: string): number {
  switch (stage) {
    case 'RailwayInspected':
      return 1;
    case 'KengsoyInspection':
      return 2;
    case 'SecurityInspection':
      return 3;
    case 'ReadyForEstakada':
    case 'TareWeighing':
      return 4;
    case 'EstakadaPlaced':
    case 'Loading':
      return 5;
    case 'Loaded':
    case 'ToRailwayScale':
      return 6;
    case 'GrossWeighed':
    case 'SealInstallation':
    case 'SealPending':
      return 7;
    case 'Sealed':
      return 8;
    case 'RegistryPrepared':
    case 'DocumentsIssued':
      return 9;
    case 'PermitAndSecurityApproved':
      return 10;
    case 'Exited':
      return 11;
    default:
      return 0;
  }
}

/** Tara yakuni shu tashrifning tekshiruvi yoki keyingi amaliy yuklash bilan tasdiqlanadi. */
export function unitEntryTareDoneAt(party: EmptyWagonArrival, u: EmptyWagonUnit): string | null {
  const securityAt = Date.parse(party.entryPermitSecurityApprovedAt ?? '');
  const afterEntry = (value: string | null | undefined): value is string =>
    Boolean(value) && Number.isFinite(securityAt) && Date.parse(value!) >= securityAt;

  const tareAt = [u.tareCheckedAt, u.tareWeighedAt].find(afterEntry);
  if (tareAt) return tareAt;

  // 1C tara vaqti kirish hujjati tasdig‘idan oldin bo‘lishi mumkin.
  // Shu tashrifda yuklash boshlangan bo‘lsa, tara bosqichi allaqachon ortda qolgan.
  // Faqat og‘irlik/statusning o‘zi eski tashrifdan qolgan bo‘lishi mumkin — yetarli emas.
  const loadingAt = [u.loadingStartedAt, u.loadingCompletedAt].find(afterEntry);
  if (loadingAt) return loadingAt;
  return u.scaleExitedAt || null;
}

export function isPartyEntryFinished(party: EmptyWagonArrival): boolean {
  if (!party) return false;
  // Hujjatlari rasmiylashtirilgan yoki zavoddan chiqib ketgan partiya kirishni tugatgan.
  // Eski mantiqda Ruxsatnoma/Qo‘riqlash kirish tasdig‘isiz chiqarilgan partiyalar ham bor.
  if (wagonStageRank(stageOf(party)) >= wagonStageRank('DocumentsIssued')) return true;
  if (!party.entryPermitShiftApprovedAt || !party.entryPermitPermitApprovedAt || !party.entryPermitSecurityApprovedAt) return false;
  const wagons = (party.wagons ?? []).filter(u => u.status !== 'Returned');
  return wagons.length > 0 && wagons.every(u => Boolean(unitEntryTareDoneAt(party, u)));
}


function isTimeOnOrAfterArrival(timeStr: string | null | undefined, arrival: EmptyWagonArrival): boolean {
  if (!timeStr) return false;
  const timeMs = Date.parse(timeStr);
  if (Number.isNaN(timeMs)) return false;
  const arrivalMs = Date.parse(arrival.arrivalDate || arrival.createdAt || '');
  if (Number.isNaN(arrivalMs)) return true;
  // 12 soatlik bufer bilan tekshiramiz (agar sana bir oz farq qilsa ham)
  return timeMs >= (arrivalMs - 12 * 3600 * 1000);
}

function unitTimes(
  arrivals: EmptyWagonArrival[],
  filter: (u: EmptyWagonUnit, a: EmptyWagonArrival) => boolean,
  pick: (u: EmptyWagonUnit, a: EmptyWagonArrival) => string | null | undefined,
): string[] {
  return arrivals.flatMap(a =>
    (a.wagons ?? []).filter(u => filter(u, a)).map(u => pick(u, a)).filter((v): v is string => !!v),
  );
}

function sealConfirmedByScale(u: EmptyWagonUnit, a?: EmptyWagonArrival): boolean {
  if (u.status === 'Sealed' || Boolean(u.sealNumber != null && String(u.sealNumber).trim())) return true;
  if (a && u.sealConfirmedByScaleAt && !isTimeOnOrAfterArrival(u.sealConfirmedByScaleAt, a)) return false;
  if (u.sealConfirmedByScaleName === '1C') return false;
  return Boolean(u.sealConfirmedByScaleAt);
}


function sealConfirmedBySecurity(u: EmptyWagonUnit, a?: EmptyWagonArrival): boolean {
  if (u.status === 'Sealed' || (Boolean(u.sealNumber != null && String(u.sealNumber).trim()) && Boolean(u.sealConfirmedBySecurityAt))) return true;
  if (a && u.sealConfirmedBySecurityAt && !isTimeOnOrAfterArrival(u.sealConfirmedBySecurityAt, a)) return false;
  return !!u.sealConfirmedBySecurityAt || (u.sealConfirmedBySecurityName?.trim?.() ? true : false);
}

function sealCompletedAt(u: EmptyWagonUnit, a?: EmptyWagonArrival): string | null {
  const times = [
    u.sealedAt,
    u.sealConfirmedBySecurityAt,
    u.sealConfirmedByScaleAt,
    u.sealEnteredToUngAt,
    u.scaleExitedAt,
  ].filter(t => !a || isTimeOnOrAfterArrival(t, a));
  const main = maxIso(...times);
  if (main) return main;

  const allConfirmed = sealConfirmedByScale(u, a) && sealConfirmedBySecurity(u, a);
  if (allConfirmed || u.status === 'Sealed') {
    if (a && u.grossWeighedAt && !isTimeOnOrAfterArrival(u.grossWeighedAt, a)) return null;
    return u.grossWeighedAt ?? null;
  }
  return null;
}

function isUnitSealed(u: EmptyWagonUnit, a?: EmptyWagonArrival): boolean {
  if (a && (stageOf(a) === 'Exited' || a.stage === 'Exited')) return true;
  if (u.status === 'Sealed') return true;
  if (Boolean(u.sealNumber != null && String(u.sealNumber).trim())) return true;
  const scaleDone = sealConfirmedByScale(u, a);
  const securityDone = sealConfirmedBySecurity(u, a);
  const allConfirmed = scaleDone && securityDone;
  if (allConfirmed && Boolean(u.sealNumber != null && String(u.sealNumber).trim())) return true;
  return false;
}

function inSealFlowUnit(a: EmptyWagonArrival, u: EmptyWagonUnit): boolean {
  if (u.status === 'Returned' || u.status === 'ToRailwayScale') return false;
  // Partiya hali yuklash yoki brutto/plomba bosqichiga kelmagan bo'lsa (rank < 7), plomba oqimiga kirmaydi
  if (wagonStageRank(stageOf(a)) < 7) return false;
  const sealedFlow =
    u.status === 'GrossWeighed'
    || u.status === 'SealPending'
    || u.status === 'Sealed'
    || a.stage === 'GrossWeighed'
    || a.stage === 'SealInstallation'
    || a.stage === 'Sealed'
    || (Boolean(u.sealNumber != null && String(u.sealNumber).trim()) && Boolean(u.tareWeight) && Boolean(u.grossWeight));
  if (!sealedFlow) return false;
  return Boolean(
    u.grossWeight
    || u.status === 'GrossWeighed'
    || u.status === 'SealPending'
    || u.status === 'Sealed',
  );
}

function sealFlowUnits(arrivals: EmptyWagonArrival[]): { u: EmptyWagonUnit; a: EmptyWagonArrival }[] {
  return arrivals.flatMap(a =>
    (a.wagons ?? []).filter(u => inSealFlowUnit(a, u)).map(u => ({ u, a })),
  );
}

function computeW4OwnerSequenceDone(arrivals: EmptyWagonArrival[]): boolean[] {
  if (arrivals.length === 0) return [false, false];
  const permit = arrivals.every(a => Boolean(a.entryPermitShiftApprovedAt && a.entryPermitPermitApprovedAt));
  const security = permit && arrivals.every(a => Boolean(a.entryPermitSecurityApprovedAt));
  return [permit, security];
}

function computeW8OwnerSequenceDone(arrivals: EmptyWagonArrival[]): boolean[] {
  if (arrivals.length === 0) return [false, false];
  // Agar partiyalar 8-bosqichdan to'liq o'tgan bo'lsa (yoki Exited) — barcha ishtirokchilar bajarilgan
  if (arrivals.every(a => wagonStageRank(stageOf(a)) > 8 || stageOf(a) === 'Exited')) {
    return [true, true];
  }
  // Agar partiyalar hali brutto/plomba bosqichiga yetib kelmagan bo'lsa (rank < 7), barcha qadamlar kutishda
  if (!arrivals.some(a => wagonStageRank(stageOf(a)) >= 7)) {
    return [false, false];
  }

  const items = sealFlowUnits(arrivals);
  if (items.length === 0) return [false, false];
  const progress = ({ u, a }: { u: EmptyWagonUnit; a: EmptyWagonArrival }) => ({
    hasSeal: Boolean(u.sealNumber != null && String(u.sealNumber).trim()) || u.status === 'Sealed',
    scale: sealConfirmedByScale(u, a) || Boolean(u.sealConfirmedByScaleAt) || u.status === 'Sealed',
    security: sealConfirmedBySecurity(u, a) || Boolean(u.sealConfirmedBySecurityAt),
  });
  const scaleDone = items.length > 0 && items.every(item => {
    const p = progress(item);
    return (p.hasSeal || p.scale);
  });
  const securityDone = scaleDone && items.every(item => progress(item).security);
  return [scaleDone, securityDone];
}

function computeW9OwnerSequenceDone(registries: LoadingRegistry[]): boolean[] {
  if (registries.length === 0) return [false, false];
  return [
    registries.some(r => Boolean(r.preparedAt) || r.isApprovedByEconomist),
    registries.some(r => r.isApprovedByShiftSupervisor),
  ];
}

function computeW11OwnerSequenceDone(
  registries: LoadingRegistry[],
  arrivals?: EmptyWagonArrival[],
): boolean[] {
  if (registries.length === 0 && (!arrivals || arrivals.length === 0)) return [false, false];
  const isExited = (arrivals ?? []).some(a => stageOf(a) === 'Exited')
    || (registries.length > 0 && registries.every(r => Boolean(r.exitedToKengsoyAt)));
  const securityDone = isExited || (registries.length > 0 && registries.every(r => r.isApprovedBySecurity));
  return [securityDone, isExited]; // Index 0: Qo'riqlash xizmati, Index 1: Temir yo'l
}

function isOperationalRegistry(
  registry: LoadingRegistry,
  arrivals: EmptyWagonArrival[],
): boolean {
  if ((registry.registryNumber || '').includes('-1C-')) return false;
  const arrival = arrivals.find(
    a => a.id.toLowerCase() === (registry.emptyWagonArrivalId ?? '').toLowerCase(),
  );
  return arrival ? !isOneCArrival(arrival) : true;
}

/** Dashboard «Yuklash jarayoni» zanjiridagi faqat operatsion (1C emas) ma’lumotlar. */
export function filterOperationalWagonData(
  arrivals: EmptyWagonArrival[],
  registries: LoadingRegistry[],
): { arrivals: EmptyWagonArrival[]; registries: LoadingRegistry[] } {
  const opsArrivals = arrivals.filter(a => !isOneCArrival(a));
  const opsRegistries = registries.filter(r => isOperationalRegistry(r, arrivals));
  return { arrivals: opsArrivals, registries: opsRegistries };
}

/**
 * Har bir bosqich: navbat (count) + haqiqiy o‘tilganlik (approvedAt).
 * Navbat bo‘sh bo‘lishi «tayyor» degani emas — bosqichdan o‘tgan dalil kerak.
 */
export function buildWagonFlowMetrics(
  arrivals: EmptyWagonArrival[],
  registries: LoadingRegistry[],
) {
  const active = arrivals.filter(a => {
    const s = stageOf(a);
    return s !== 'Cancelled';
  });

  const intake = active.filter(a => stageOf(a) === 'RailwayInspected');
  const inPlant = active.filter(a => {
    const s = stageOf(a);
    return s !== 'RailwayInspected' && s !== 'Exited';
  });

  const toSecurity = inPlant.filter(a => stageOf(a) === 'KengsoyInspection');
  const security = inPlant.filter(a => stageOf(a) === 'SecurityInspection');
  /** Estakadaga qo‘yish kutilmoqda (tara + Temir yo‘l uzatishi) */
  const estakada = inPlant.filter(a => {
    const s = stageOf(a);
    return s === 'ReadyForEstakada' || s === 'TareWeighing';
  });
  /** 5-bosqich: zavodga kirgach tara tekshiruvi (og‘irlik 1C dan chiqishda) */
  const unitNeedsTare = (u: EmptyWagonUnit) => {
    if (u.status === 'Returned') return false;
    if (u.status !== 'AwaitingTare') return false;
    return !u.tareWeighedAt && !String(u.tareWeight ?? '').trim();
  };
  const arrivalNeedsTare = (a: EmptyWagonArrival) => {
    const units = a.wagons ?? [];
    if (units.length > 0) return units.some(unitNeedsTare);
    return !String(a.tareWeight ?? '').trim();
  };
  const tarePending = estakada.filter(arrivalNeedsTare);

  /** Yuklash guruhiga kirgan / yuklash zanjiridagi vagon (estakada qoldig‘i emas). */
  const inLoadingCycle = (u: EmptyWagonUnit) => {
    if (u.status === 'Returned') return false;
    const st = u.status ?? '';
    if (st === 'Loading' || st === 'ToRailwayScale' || st === 'Loaded' || st === 'GrossWeighed' || st === 'SealPending' || st === 'Sealed') {
      return true;
    }
    return Boolean((u.loadingBatchNumber != null && String(u.loadingBatchNumber).trim()) || u.loadingStartedAt || u.loadingCompletedAt);
  };

  const loadingCycleDone = (units: EmptyWagonUnit[]) => {
    const cycle = units.filter(inLoadingCycle);
    if (cycle.length === 0) return false;
    return cycle.every(u => {
      const st = u.status ?? '';
      return st === 'ToRailwayScale' || st === 'Loaded' || st === 'GrossWeighed' || st === 'SealPending' || st === 'Sealed';
    });
  };

  const loadingNow = inPlant.filter(a => {
    const units = (a.wagons ?? []).filter(u => u.status !== 'Returned');
    if (units.some(u => u.status === 'Loading')) return true;
    const s = stageOf(a);
    if (s === 'Loading') return true;
    // Qisman yuklash: guruh yuklangach zanjir yakunlanadi — estakada qoldig‘i w6 ni bloklamaydi
    if (loadingCycleDone(units)) return false;
    return (
      s === 'EstakadaPlaced'
      || units.some(u => u.status === 'Estakada')
    );
  });
  const gross = inPlant.filter(a => {
    const units = a.wagons ?? [];
    if (units.length === 0) {
      const s = stageOf(a);
      return s === 'ToRailwayScale';
    }
    return units.some(u => {
      if (u.status === 'Returned') return false;
      const st = u.status ?? '';
      const hasNet = hasMeasuredNet(u) || (Boolean(u.grossWeighedAt) && Boolean(u.grossWeight != null && String(u.grossWeight).trim()));
      return st === 'ToRailwayScale' || (st === 'GrossWeighed' && !hasNet);
    });
  });

  const sealScalePending = inPlant.filter(a => {
    const units = a.wagons ?? [];
    return units.some(u => {
      if (u.status === 'Returned' || u.status === 'ToRailwayScale') return false;
      const hasNet = hasMeasuredNet(u) || Boolean(u.grossWeighedAt);
      const scaleDone = sealConfirmedByScale(u, a) || Boolean(u.sealConfirmedByScaleAt) || u.status === 'Sealed';
      return hasNet && !scaleDone;
    });
  });

  const sealSecurityPending = inPlant.filter(a => {
    const units = a.wagons ?? [];
    return units.some(u => {
      if (u.status === 'Returned' || u.status === 'ToRailwayScale') return false;
      const scaleDone = sealConfirmedByScale(u, a) || Boolean(u.sealConfirmedByScaleAt) || u.status === 'Sealed' || Boolean(u.sealNumber != null && String(u.sealNumber).trim());
      const securityDone = sealConfirmedBySecurity(u, a) || Boolean(u.sealConfirmedBySecurityAt);
      return scaleDone && !securityDone;
    });
  });

  const sealWork = inPlant.filter(a => {
    if (wagonStageRank(stageOf(a)) < 7 || wagonStageRank(stageOf(a)) >= 8) return false;
    const units = a.wagons ?? [];
    if (units.length === 0) {
      const s = stageOf(a);
      return s === 'GrossWeighed' || s === 'SealInstallation' || s === 'SealPending';
    }
    return units.some(u => {
      const st = u.status ?? '';
      if (st === 'ToRailwayScale') return false;
      const securityDone = sealConfirmedBySecurity(u, a) || Boolean(u.sealConfirmedBySecurityAt);
      return !securityDone;
    });
  });

  const hasSealedUnitsForRegistry = (a: EmptyWagonArrival) => {
    if (wagonStageRank(stageOf(a)) < 7) return false;
    const units = (a.wagons ?? []).filter(u => u.status !== 'Returned');
    if (units.length === 0) return a.stage === 'Sealed';
    return units.some(u => isUnitSealed(u, a) || u.status === 'Sealed');
  };

  const isArrivalCoveredByRegistry = (a: EmptyWagonArrival) =>
    registries.some(r =>
      (r.emptyWagonArrivalId ?? '').toLowerCase() === a.id.toLowerCase()
      || (r.wagonRoutes ?? []).some(w => (w.sourceArrivalId ?? '').toLowerCase() === a.id.toLowerCase()),
    );

  const regNeedCreate = inPlant.filter(a =>
    hasSealedUnitsForRegistry(a) && !isArrivalCoveredByRegistry(a),
  );
  const regPermit = registries.filter(needsPermitAgreement);
  const regSecurity = registries.filter(needsSecurityAgreement);
  const regEconomistPrep = registries.filter(r =>
    !r.isEconomistApprovedWithPermit || !r.isEconomistApprovedWithSecurity,
  );

  const isRegistryAgreed = (r: LoadingRegistry) =>
    r.isEconomistApprovedWithPermit
    && r.isEconomistApprovedWithSecurity
    && r.isApprovedByPermit
    && r.isApprovedBySecurity;


  /** 9-bosqich: iqtisodchi shakllantiradi, ICHDX smena boshlig‘i tasdiqlaydi. */
  const hasShiftApprovalOrLegacyDownstream = (r: LoadingRegistry) =>
    r.isApprovedByShiftSupervisor
    || (!usesSequentialWorkflow(r) && (
      r.isApprovedByPermit
      || r.isApprovedBySecurity
      || r.isSentToOneC
      || r.isSentToENakl
      || Boolean(r.handoverToMachinistAt)
    ));
  const regShiftPending = registries.filter(r =>
    !hasShiftApprovalOrLegacyDownstream(r) && !isRegistryReturned(r),
  );
  const regAgreePendingCount = regNeedCreate.length + regShiftPending.length;

  /** 10-bosqich: shakllangan hujjatni Ruxsatnoma byurosi bilan kelishish. */
  const regENaklPending = registries.filter(r => !isRegistryAgreed(r) && !isRegistryReturned(r));

  /** 12-bosqich: chiqarilgan hujjatni 1C va e-nakl tizimlarida ro‘yxatdan o‘tkazish (faqat Kengsoyga olib chiqilgach). */
  const regComparePending = registries.filter(r =>
    Boolean(r.exitedToKengsoyAt)
    && (!r.isSentToOneC || !r.isSentToENakl)
    && !isRegistryReturned(r),
  );

  /** 11-bosqich: kelishilgan, hali Kengsoygacha olib chiqilmagan yuk xatlari. */
  const regExitPending = registries.filter(r =>
    r.isApprovedBySecurity
    && r.isApprovedByPermit
    && !r.exitedToKengsoyAt
    && !isRegistryReturned(r),
  );
  const toKengsoy = regExitPending;
  const registryArrivalIds = new Set(
    registries.flatMap(r => [
      r.emptyWagonArrivalId,
      ...(r.wagonRoutes ?? []).map(w => w.sourceArrivalId),
    ]).filter(Boolean),
  );
  const afterDocs = inPlant.filter(a =>
    !registryArrivalIds.has(a.id)
    && ['PermitAndSecurityApproved', 'DocumentsIssued', 'RegistryPrepared'].includes(stageOf(a)),
  );

  /** Kamida bitta partiya shu bosqichdan o‘tgan (rank > minRank). */
  const hasPassed = (minRank: number) =>
    active.some(a => wagonStageRank(stageOf(a)) > minRank);

  const past = (minRank: number) => active.filter(a => wagonStageRank(stageOf(a)) > minRank);

  const fallbackBaseAt = (past(0)[0]?.createdAt || active[0]?.createdAt || new Date().toISOString());

  const w1At = maxIso(...intake.map(a => a.createdAt), ...past(0).map(a => a.createdAt), ...past(0).map(a => a.arrivalDate));
  const w2At = active.length > 0 && active.every(a => a.entryPermitShiftApprovedAt)
    ? maxIso(...active.map(a => a.entryPermitShiftApprovedAt)) : null;
  const w3At = maxIso(...past(1).map(a => a.entryPermitShiftApprovedAt || a.entryPermitPermitApprovedAt || a.createdAt), ...past(1).map(a => a.arrivalDate));
  // Vaqtlar faqat inPlant emas — Exited partiyalar ham to‘liq zanjir tarixini ko‘rsatsin.
  const w5At = maxIso(...unitTimes(active, (u, a) => u.status !== 'Returned' && Boolean(unitEntryTareDoneAt(a, u)), (u, a) => unitEntryTareDoneAt(a, u)));
  const w6At = maxIso(
    ...unitTimes(active, (u, a) => !!u.loadingCompletedAt && isTimeOnOrAfterArrival(u.loadingCompletedAt, a), u => u.loadingCompletedAt),
    ...past(5).map(a => a.loadingCompletedAt),
  );
  const w7At = maxIso(...unitTimes(active, (u, a) => !!u.grossWeighedAt && isTimeOnOrAfterArrival(u.grossWeighedAt, a), u => u.grossWeighedAt));
  const w8At = maxIso(...unitTimes(active, (u, a) => isUnitSealed(u, a) && isTimeOnOrAfterArrival(sealCompletedAt(u, a), a), (u, a) => sealCompletedAt(u, a)));

  const anySealedUnit = active.some(a =>
    (a.wagons ?? []).some(u => isUnitSealed(u, a) && isTimeOnOrAfterArrival(sealCompletedAt(u, a), a)),
  );

  const w9At = maxIso(
    ...registries.map(r => r.shiftSupervisorApprovedAt),
    ...registries.map(r => r.preparedAt),
  );
  // 10-bosqich: Yuk xatini kelishish (faqat Ruxsatnoma byurosi)
  const w10At = maxIso(
    ...registries.filter(r => r.isApprovedByPermit).map(r => r.permitApprovedAt),
  );
  // 11-bosqich: Vagonlarni tekshirish va chiqarish (Qo'riqlash va Temir yo'l)
  const w11At = maxIso(
    ...registries.filter(r => r.isApprovedBySecurity && Boolean(r.exitedToKengsoyAt)).map(r => maxIso(r.securityApprovedAt, r.exitedToKengsoyAt)),
    ...registries.map(r => r.exitedToKengsoyAt),
    ...active.filter(a => stageOf(a) === 'Exited').map(a => a.createdAt),
  );
  // 12-bosqich: Yuk xatini ro'yxatdan o'tkazish (1C va e-nakl)
  const w12At = maxIso(
    ...registries.filter(r => r.isSentToOneC && r.isSentToENakl).map(r => maxIso(r.sentToOneCAt, r.sentToENaklAt)),
    ...registries.filter(r => r.isSentToOneC || r.isSentToENakl).map(r => maxIso(r.sentToOneCAt, r.sentToENaklAt)),
  );

  /** Faqat navbat bo‘sh VA bosqichdan o‘tilgan bo‘lsa — tasdiqlangan. */
  const stepApprovedAt = (
    pendingCount: number,
    passed: boolean,
    eventAt: string | null,
  ): string | null => (pendingCount === 0 && passed ? eventAt : null);

  const regComparePendingCount = regComparePending.length;
  const exitPending = regExitPending.length + afterDocs.length;
  const regReturned = registries.filter(isRegistryReturned);
  const registryAlert = regReturned.map(buildRegistryAlert).find(Boolean) ?? null;

  const hasTareDone = active.length > 0 && active.every(isPartyEntryFinished);

  const isPartyDone = active.length > 0 && active.every(() =>
    (registries.length > 0 && registries.every(r => Boolean(r.exitedToKengsoyAt) && r.isSentToOneC && r.isSentToENakl))
  );

  return {
    intake,
    toSecurity,
    security,
    estakada,
    tarePending,
    loadingNow,
    gross,
    sealWork,
    sealScalePending,
    sealSecurityPending,
    regNeedCreate,
    regPermit,
    regSecurity,
    regEconomistPrep,
    regShiftPending,
    regAgreePending: regAgreePendingCount,
    regENaklPending,
    regComparePending,
    regExitPending,
    regReturned,
    registryAlert,
    toKengsoy,
    afterDocs,
    splitApprovedAt: {
      sealScale: computeW8OwnerSequenceDone(active)[0]
        ? maxIso(...unitTimes(active, (u, a) => sealConfirmedByScale(u, a), u => u.sealConfirmedByScaleAt || u.sealedAt || u.grossWeighedAt)) ?? w8At ?? fallbackBaseAt
        : null,
      sealSecurity: computeW8OwnerSequenceDone(active)[1]
        ? maxIso(...unitTimes(active, (u, a) => sealConfirmedBySecurity(u, a), u => u.sealConfirmedBySecurityAt || u.sealedAt || u.grossWeighedAt)) ?? w8At ?? fallbackBaseAt
        : null,
      registryCreate: registries.length > 0 && regReturned.length === 0 && regNeedCreate.length === 0
        && registries.every(r => Boolean(r.preparedAt) || r.isApprovedByEconomist || hasShiftApprovalOrLegacyDownstream(r))
        ? maxIso(...registries.map(r => r.preparedAt)) ?? w9At ?? fallbackBaseAt
        : null,
      exitSecurity: computeW11OwnerSequenceDone(registries, active)[0] && regReturned.length === 0
        ? maxIso(...registries.map(r => r.securityApprovedAt)) ?? w11At ?? fallbackBaseAt
        : null,
    },
    approvedAt: {
      w1: (intake.length > 0 || hasPassed(0) || isPartyDone) ? (w1At ?? fallbackBaseAt) : null,
      w2: w2At,
      w3: w2At && active.every(a => wagonStageRank(stageOf(a)) >= 3) ? w3At : null,
      w4: computeW4OwnerSequenceDone(active)[1] ? maxIso(...active.map(a => a.entryPermitSecurityApprovedAt)) : null,
      w5: hasTareDone ? w5At : null,
      w6: (hasPassed(5) || isPartyDone || !!w6At || !!w7At || !!w8At || anySealedUnit)
        ? (w6At ?? w7At ?? w8At ?? fallbackBaseAt)
        : stepApprovedAt(loadingNow.length, hasPassed(5), w6At),
      w7: (hasPassed(6) || isPartyDone || !!w7At || !!w8At || anySealedUnit)
        ? (w7At ?? w8At ?? fallbackBaseAt)
        : stepApprovedAt(gross.length, hasPassed(6), w7At),
      w8: (hasPassed(7) || isPartyDone || (active.length > 0 && active.every(a => {
        const sUnits = (a.wagons ?? []).filter(u => inSealFlowUnit(a, u));
        return sUnits.length > 0 && sUnits.every(u => isUnitSealed(u, a));
      }))) ? (w8At ?? fallbackBaseAt) : stepApprovedAt(sealSecurityPending.length, hasPassed(7) || anySealedUnit, w8At),
      w9: (hasPassed(9) || isPartyDone)
        ? (w9At ?? fallbackBaseAt)
        : stepApprovedAt(
            regAgreePendingCount + regReturned.length,
            registries.length > 0 && (registries.some(r => hasShiftApprovalOrLegacyDownstream(r)) || hasPassed(8)),
            w9At,
          ),
      w10: (hasPassed(9) && registries.some(r => r.isApprovedByPermit) || isPartyDone)
        ? (w10At ?? fallbackBaseAt)
        : stepApprovedAt(regPermit.length, registries.some(r => r.isApprovedByPermit), w10At),
      w11: (hasPassed(10) || isPartyDone || registries.some(r => Boolean(r.exitedToKengsoyAt) && r.isApprovedBySecurity) || active.some(a => stageOf(a) === 'Exited'))
        ? (w11At ?? fallbackBaseAt)
        : stepApprovedAt(
            regSecurity.length + exitPending,
            Boolean(w11At) && (registries.some(r => Boolean(r.exitedToKengsoyAt) && r.isApprovedBySecurity) || active.some(a => stageOf(a) === 'Exited')),
            w11At,
          ),
      w12: (isPartyDone || (registries.length > 0 && registries.every(r => Boolean(r.exitedToKengsoyAt) && r.isSentToOneC && r.isSentToENakl)))
        ? (w12At ?? fallbackBaseAt)
        : stepApprovedAt(
            regComparePendingCount,
            registries.some(r => Boolean(r.exitedToKengsoyAt) && r.isSentToOneC && r.isSentToENakl),
            w12At,
          ),
    },
    ownerSequenceDone: {
      w4: computeW4OwnerSequenceDone(active),
      w8: computeW8OwnerSequenceDone(active),
      w9: computeW9OwnerSequenceDone(registries),
      w11: computeW11OwnerSequenceDone(registries, active),
    },
  };
}
