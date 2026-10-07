import type { EmptyWagonArrival } from '../types';
import { latestIntakeReturnNote } from './arrivalIssueNotes';

export interface EntryWorkflowStepInfo {
  stepNumber: number;
  title: string;
  role: string;
  actionRequired: string;
  isDone: boolean;
  isCurrent: boolean;
  isRejected?: boolean;
  rejectReason?: string | null;
}

export interface EntryPendingActionInfo {
  arrivalNumber: string;
  wagonCount: number;
  stage: string;
  responsibleRole: string;
  actionName: string;
  summaryText: string;
  detailText: string;
  isReturned: boolean;
  isEntryDone: boolean;
  steps: EntryWorkflowStepInfo[];
}

export function getArrivalEntryPendingActionInfo(arrival: EmptyWagonArrival): EntryPendingActionInfo {
  const returnNote = latestIntakeReturnNote(arrival.notes);
  const isReturned = Boolean(returnNote && returnNote.trim());

  const stage = arrival.stage || 'KengsoyInspection';

  const isRailwayDispatched = stage !== 'RailwayInspected';
  const isShiftDone = Boolean(arrival.entryPermitShiftApprovedAt) || (isRailwayDispatched && stage !== 'KengsoyInspection');
  const isPermitDone = Boolean(arrival.entryPermitPermitApprovedAt);
  const isSecurityDone = Boolean(arrival.entryPermitSecurityApprovedAt);

  // Tara tortish yakunlanganmi:
  const wagons = arrival.wagons ?? [];
  const hasTare = wagons.length > 0
    ? wagons.every(w => Boolean(w.tareWeighedAt || w.tareWeight))
    : Boolean(arrival.tareWeight);
  const isTareDone = hasTare || ['EstakadaPlaced', 'Loading', 'Loaded', 'GrossWeighed', 'Sealed', 'RegistryPrepared', 'DocumentsIssued', 'PermitAndSecurityApproved', 'Exited'].includes(stage);

  const isEntryDone = isSecurityDone && isTareDone;

  let currentStep = 1;
  if (isReturned) {
    currentStep = 2; // Kengsoy ko'rigi / Qaytarilgan
  } else if (!isRailwayDispatched) {
    currentStep = 1;
  } else if (!arrival.entryPermitShiftApprovedAt && stage === 'KengsoyInspection') {
    currentStep = 2;
  } else if (stage === 'KengsoyInspection') {
    currentStep = 2; // Temir yo'l vagonlarni kiritish bosqichi
  } else if (!isPermitDone) {
    currentStep = 3;
  } else if (!isSecurityDone) {
    currentStep = 4;
  } else if (!isTareDone) {
    currentStep = 5;
  } else {
    currentStep = 6;
  }

  const steps: EntryWorkflowStepInfo[] = [
    {
      stepNumber: 1,
      title: "Temir yo‘l qabuli",
      role: "Temir yo‘l inspektori",
      actionRequired: "«Tasdiqlash va ijroga jo‘natish» tugmasi",
      isDone: isRailwayDispatched,
      isCurrent: currentStep === 1,
    },
    {
      stepNumber: 2,
      title: "Smena boshlig‘i & Kengsoy",
      role: "ICHDX smena boshlig‘i / Temir yo‘l",
      actionRequired: !arrival.entryPermitShiftApprovedAt ? "Smena boshlig‘i tasdig‘i" : "«Vagonlarni kiritish» tugmasi",
      isDone: isShiftDone && stage !== 'KengsoyInspection',
      isCurrent: currentStep === 2,
      isRejected: isReturned,
      rejectReason: isReturned ? returnNote : undefined,
    },
    {
      stepNumber: 3,
      title: "Ruxsatnoma byurosi",
      role: "Ruxsatnoma byurosi",
      actionRequired: "«Ijro uchun qabul qilish» tugmasi",
      isDone: isPermitDone,
      isCurrent: currentStep === 3,
    },
    {
      stepNumber: 4,
      title: "Qo‘riqlash xizmati",
      role: "Qo‘riqlash xizmati (Darvoza)",
      actionRequired: "«Vagonlarni tekshirib kiritish» («Ruxsat etildi»)",
      isDone: isSecurityDone,
      isCurrent: currentStep === 4,
    },
    {
      stepNumber: 5,
      title: "Darvoza tarozisi",
      role: "Tarozi nazoratchisi",
      actionRequired: "«Tara tortish» (bo‘sh vagon og‘irligi)",
      isDone: isTareDone,
      isCurrent: currentStep === 5,
    },
  ];

  let responsibleRole = "";
  let actionName = "";
  let detailText = "";

  if (isReturned) {
    responsibleRole = "Temir yo‘l (dispetcher)";
    actionName = "Kamchilikni tuzatib, «Qayta yuborish»";
    detailText = `Darvoza ko‘rigida rad etilgan/qaytarilgan (${returnNote || "sababsiz"}). Temir yo‘l xizmati kamchilikni bartaraf etib, «Qayta yuborish» tugmasini bosishi kerak.`;
  } else if (!isRailwayDispatched) {
    responsibleRole = "Temir yo‘l inspektori / Dispetcher";
    actionName = "«Tasdiqlash va ijroga jo‘natish» tugmasi";
    detailText = "Temir yo‘l xodimi vagonlarni Kengsoyda qabul qilib, «Tasdiqlash va ijroga jo‘natish» tugmasini bosishi kutilmoqda.";
  } else if (!arrival.entryPermitShiftApprovedAt && stage === 'KengsoyInspection') {
    responsibleRole = "ICHDX smena boshlig‘i";
    actionName = "«Kelishildi» tasdiq tugmasi";
    detailText = "ICHDX smena boshlig‘i kirish xizmat xatini tekshirib, tasdiqlashi kutilmoqda.";
  } else if (stage === 'KengsoyInspection') {
    responsibleRole = "Temir yo‘l (mashinist / dispetcher)";
    actionName = "«Vagonlarni kiritish» tugmasi";
    detailText = "Temir yo‘l xizmati vagonlarni zavod darvozasiga (ko‘rik postiga) olib kirish («Vagonlarni kiritish» tugmasi) kutilmoqda.";
  } else if (!isPermitDone) {
    responsibleRole = "Ruxsatnoma byurosi";
    actionName = "«Ijro uchun qabul qilish» tugmasi";
    detailText = "Ruxsatnoma byurosi xodimi vagonlarni tekshirib, «Ijro uchun qabul qilish» tasdiq tugmasini bosishi kutilmoqda.";
  } else if (!isSecurityDone) {
    responsibleRole = "Qo‘riqlash xizmati";
    actionName = "«Vagonlarni tekshirib kiritish» («Ruxsat etildi») tugmasi";
    detailText = "Qo‘riqlash xizmati darvoza postida vagonlarni ko‘rikdan o‘tkazib, «Vagonlarni tekshirib kiritish» («Ruxsat etildi») tugmasini bosishi kutilmoqda.";
  } else if (!isTareDone) {
    responsibleRole = "Darvoza tarozisi nazoratchisi";
    actionName = "«Tara tortish» (Bo‘sh vagon og‘irligi)";
    detailText = "Vagonlar zavod darvozasidan kiritilgan. Endi darvoza tarozisida bo‘sh vagon (tara) vaznini tortish kutilmoqda.";
  } else {
    responsibleRole = "—";
    actionName = "Kiritish yakunlangan";
    detailText = "Vagonlar zavod hududiga to‘liq kiritilgan va estakadaga yo‘naltirilgan.";
  }

  const summaryText = `Hozirda kutilmoqda: ${responsibleRole} (${actionName})`;

  return {
    arrivalNumber: arrival.arrivalNumber,
    wagonCount: arrival.wagonCount,
    stage,
    responsibleRole,
    actionName,
    summaryText,
    detailText,
    isReturned,
    isEntryDone,
    steps,
  };
}
