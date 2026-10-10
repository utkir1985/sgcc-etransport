import type { EmptyWagonArrival } from '../types';

/** Kirish xizmat xati / partiya holati — bosqich bo‘yicha. */
export function getIntakePartyStatus(
  item: EmptyWagonArrival,
  options?: { railwayView?: boolean },
): string {
  const stage = item.stage || 'KengsoyInspection';
  const shiftApproved = Boolean(item.entryPermitShiftApprovedAt);
  const permitApproved = Boolean(item.entryPermitPermitApprovedAt);
  const securityApproved = Boolean(item.entryPermitSecurityApprovedAt);
  const entryComplete = permitApproved && securityApproved;

  if (stage === 'Draft') return 'Qoralama';
  if (stage === 'Cancelled') return 'Bekor qilingan';

  if (stage === 'RailwayInspected') {
    return 'Ro\'yxatga olindi';
  }

  if (stage === 'KengsoyInspection') {
    return 'Vagonlarni kiritish kutilmoqda';
  }

  if (stage === 'SecurityInspection' || hasDisplacedEntryReview(item)) {
    if (entryComplete) return 'Kirishga ruxsat berildi';
    if (!permitApproved) return 'Ruxsatnoma byurosi kutilmoqda';
    if (!securityApproved) return 'Qo‘riqlash xizmati kutilmoqda';
    if (shiftApproved) return 'Kirish kelishuvi kutilmoqda';
    return 'Kirish tasdig‘i kutilmoqda';
  }

  if (stage === 'ReadyForEstakada') {
    if (options?.railwayView) {
      const units = item.wagons ?? [];
      const needsTare = units.length > 0
        ? units.some(u => u.status === 'AwaitingTare' && !u.tareWeighedAt && !String(u.tareWeight ?? '').trim())
        : !String(item.tareWeight ?? '').trim();
      return needsTare ? 'Tara tekshiruvi kutilmoqda' : 'Estakadaga olib borish';
    }
    return 'Kirishga ruxsat berildi';
  }

  if (stage === 'TareWeighing') {
    const units = (item.wagons ?? []).filter(u => u.status !== 'Returned');
    const allTared = units.length > 0
      ? units.every(u => u.status !== 'AwaitingTare' && (Boolean(u.tareWeighedAt) || Boolean(String(u.tareWeight ?? '').trim())))
      : Boolean(String(item.tareWeight ?? '').trim());
    if (allTared) {
      return 'Zavodga qabul qilindi';
    }
    return 'Tara tortilmoqda';
  }

  // Keyingi barcha operatsiyalar (yuklash, brutto, plomba, yuk xati, kengsoyga chiqarish)
  if (stage === 'EstakadaPlaced') return 'Yuklashga tayyor';
  if (stage === 'Loading') return 'Yuklanmoqda';
  if (stage === 'Loaded') return 'Yuklangan';
  if (stage === 'ToRailwayScale') return 'Brutto kutmoqda';
  if (stage === 'GrossWeighed') return 'Plomba kutmoqda';
  if (stage === 'SealInstallation') return 'Plomba o‘rnatilmoqda';
  if (stage === 'SealPending') return 'Plomba tasdig‘i kutilmoqda';
  if (stage === 'Sealed') return 'Yuk xati kutmoqda';
  if (stage === 'RegistryPrepared') return 'Yuk xati shakllantirildi';
  if (stage === 'DocumentsIssued') return '1C / e-naklga kiritildi';
  if (stage === 'PermitAndSecurityApproved') return 'Chiqishga ruxsat berildi';
  if (stage === 'Exited') return 'Kengsoyga chiqarildi';

  return 'Zavodga qabul qilindi';
}

/** ICHDX tasdiqlagan, hali Ruxsatnoma + Qo‘riqlash tekshiruvi tugamagan. */
export function needsGateInspection(item: EmptyWagonArrival): boolean {
  if (!item.entryPermitShiftApprovedAt) return false;
  if (item.entryPermitPermitApprovedAt && item.entryPermitSecurityApprovedAt) return false;
  const stage = item.stage || 'KengsoyInspection';
  return stage === 'KengsoyInspection' || stage === 'SecurityInspection' || hasDisplacedEntryReview(item);
}

/** Ikkala tekshiruvdan o‘tgan kiritish xati. */
export function isGateInspectionDone(item: EmptyWagonArrival): boolean {
  return Boolean(item.entryPermitPermitApprovedAt && item.entryPermitSecurityApprovedAt);
}

export function isIntakeFlowStage(stage: string): boolean {
  return [
    'RailwayInspected',
    'KengsoyInspection',
    'SecurityInspection',
    'ReadyForEstakada',
    'TareWeighing',
  ].includes(stage);
}

/** Existing measurements must not stand in for entry approvals. */
function hasDisplacedEntryReview(item: EmptyWagonArrival): boolean {
  return Boolean(item.entryPermitShiftApprovedAt)
    && !(item.entryPermitPermitApprovedAt && item.entryPermitSecurityApprovedAt)
    && ['ReadyForEstakada', 'TareWeighing', 'EstakadaPlaced', 'Loading', 'Loaded',
      'ToRailwayScale', 'GrossWeighed', 'SealInstallation', 'Sealed'].includes(item.stage ?? '');
}
