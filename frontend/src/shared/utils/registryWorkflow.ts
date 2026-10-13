import type { LoadingRegistry } from '../types';

/** Ruxsatnoma byurosi rad etgan (kelishuv bosqichi qaytarilgan). */
export function isPermitRejected(registry: LoadingRegistry): boolean {
  return registry.isEconomistApprovedWithPermit
    && !registry.isApprovedByPermit
    && Boolean(registry.permitCheckResult?.trim());
}

/** Qo‘riqlash xizmati rad etgan. */
export function isSecurityRejected(registry: LoadingRegistry): boolean {
  return registry.isEconomistApprovedWithSecurity
    && !registry.isApprovedBySecurity
    && Boolean(registry.securityCheckResult?.trim())
    && registry.securityCheckResult.trim() !== 'Kelishildi';
}

export function isRegistryReturned(registry: LoadingRegistry): boolean {
  return isPermitRejected(registry) || isSecurityRejected(registry);
}

export function registryRejectionSummary(registry: LoadingRegistry): string[] {
  const parts: string[] = [];
  if (isPermitRejected(registry)) {
    parts.push(`Ruxsatnoma byurosi: ${registry.permitCheckResult}`);
  }
  if (isSecurityRejected(registry)) {
    parts.push(`Qo‘riqlash xizmati: ${registry.securityCheckResult}`);
  }
  return parts;
}

export function buildRegistryAlert(registry: LoadingRegistry): {
  tone: 'danger';
  label: string;
  detail: string;
} | null {
  if (!isRegistryReturned(registry)) return null;
  const parts = registryRejectionSummary(registry);
  return {
    tone: 'danger',
    label: 'Qaytarilgan',
    detail: parts.join(' · '),
  };
}

/** 9-bosqich: iqtisodchi shakllantirgan, smena boshlig‘i tasdig‘i kutilmoqda. */
export function needsShiftApproval(registry: LoadingRegistry): boolean {
  return !registry.isApprovedByShiftSupervisor && !isRegistryReturned(registry);
}

/** 10-bosqich (Ruxsatnoma): Ruxsatnoma byurosi tasdig‘i kutilmoqda. */
export function needsPermitAgreement(registry: LoadingRegistry): boolean {
  const ecoPermitOk = registry.isEconomistApprovedWithPermit || Boolean(registry.preparedAt) || registry.isApprovedByEconomist;
  return Boolean(
    registry.isApprovedByShiftSupervisor
    && ecoPermitOk
    && !registry.isApprovedByPermit
    && !isRegistryReturned(registry),
  );
}

/** 10-bosqich (Qo‘riqlash): Qo‘riqlash xizmati tasdig‘i kutilmoqda. */
export function needsSecurityAgreement(registry: LoadingRegistry): boolean {
  const ecoSecurityOk = registry.isEconomistApprovedWithSecurity || Boolean(registry.preparedAt) || registry.isApprovedByEconomist;
  return Boolean(
    registry.isApprovedByShiftSupervisor
    && registry.isApprovedByPermit
    && ecoSecurityOk
    && !registry.isApprovedBySecurity
    && !isRegistryReturned(registry),
  );
}

// Keep this rollout boundary aligned with DocumentsController. Older documents are exempt.
export const SEQUENTIAL_WORKFLOW_STARTS_AT = '2026-09-29T08:51:05Z';

export function usesSequentialWorkflow(registry: LoadingRegistry): boolean {
  return Date.parse(registry.preparedAt) >= Date.parse(SEQUENTIAL_WORKFLOW_STARTS_AT);
}

export function blocksNextRegistry(registry: LoadingRegistry): boolean {
  return usesSequentialWorkflow(registry)
    && (!registry.exitedToKengsoyAt || !registry.isSentToOneC || !registry.isSentToENakl);
}

export function isRegistryWorkflowLocked(registry: LoadingRegistry): boolean {
  return usesSequentialWorkflow(registry)
    && Boolean(registry.exitedToKengsoyAt || registry.isSentToOneC || registry.isSentToENakl);
}

export interface RegistryWorkflowStepInfo {
  stepNumber: number;
  title: string;
  role: string;
  actionRequired: string;
  isDone: boolean;
  isCurrent: boolean;
  isRejected?: boolean;
  rejectReason?: string;
}

export interface RegistryPendingActionInfo {
  registryNumber: string;
  responsibleRole: string;
  actionName: string;
  summaryText: string;
  detailText: string;
  isReturned: boolean;
  steps: RegistryWorkflowStepInfo[];
}

export function getRegistryPendingActionInfo(registry: LoadingRegistry): RegistryPendingActionInfo {
  const permitRejected = isPermitRejected(registry);
  const securityRejected = isSecurityRejected(registry);
  const isReturned = permitRejected || securityRejected;

  const shiftDone = Boolean(registry.isApprovedByShiftSupervisor && registry.shiftSupervisorApprovedByName?.trim()) || Boolean(registry.isApprovedByShiftSupervisor);
  const ecoPermitSent = Boolean(registry.isEconomistApprovedWithPermit);
  const permitDone = Boolean(registry.isApprovedByPermit);
  const ecoSecuritySent = Boolean(registry.isEconomistApprovedWithSecurity);
  const securityDone = Boolean(registry.isApprovedBySecurity);
  const exitDone = Boolean(registry.exitedToKengsoyAt);
  const externalDone = Boolean(registry.isSentToOneC && registry.isSentToENakl);

  let currentStep = 1;
  if (permitRejected) {
    currentStep = 2;
  } else if (securityRejected) {
    currentStep = 3;
  } else if (!shiftDone) {
    currentStep = 1;
  } else if (!permitDone) {
    currentStep = 2;
  } else if (!securityDone) {
    currentStep = 3;
  } else if (!exitDone) {
    currentStep = 4;
  } else if (!externalDone) {
    currentStep = 5;
  } else {
    currentStep = 6;
  }

  const steps: RegistryWorkflowStepInfo[] = [
    {
      stepNumber: 1,
      title: "Smena boshlig‘i tasdig‘i",
      role: "ICHDX smena boshlig‘i",
      actionRequired: "«Kelishildi» tasdiq tugmasi",
      isDone: shiftDone,
      isCurrent: currentStep === 1,
    },
    {
      stepNumber: 2,
      title: "Ruxsatnoma byurosi",
      role: "Ruxsatnoma byurosi",
      actionRequired: ecoPermitSent ? "«Kelishildi» tasdiq tugmasi" : "«Ruxsatnomaga» yuborish",
      isDone: permitDone,
      isCurrent: currentStep === 2,
      isRejected: permitRejected,
      rejectReason: permitRejected ? registry.permitCheckResult : undefined,
    },
    {
      stepNumber: 3,
      title: "Qo‘riqlash xizmati",
      role: "Qo‘riqlash xizmati",
      actionRequired: ecoSecuritySent ? "«Ruxsat etildi» tasdiq tugmasi" : "«Qo‘riqlashga» yuborish",
      isDone: securityDone,
      isCurrent: currentStep === 3,
      isRejected: securityRejected,
      rejectReason: securityRejected ? registry.securityCheckResult : undefined,
    },
    {
      stepNumber: 4,
      title: "Vagonlarni olib chiqish",
      role: "Temir yo‘l (mashinist / dispetcher)",
      actionRequired: "«Vagonlarni olib chiqish» tasdig‘i",
      isDone: exitDone,
      isCurrent: currentStep === 4,
    },
    {
      stepNumber: 5,
      title: "1C va E-nakl",
      role: "ICHDX iqtisodchisi",
      actionRequired: "«1C / E-nakl ro‘yxatini tasdiqlash» tugmasi",
      isDone: externalDone,
      isCurrent: currentStep === 5,
    },
  ];

  let responsibleRole = "";
  let actionName = "";
  let detailText = "";

  if (permitRejected) {
    responsibleRole = "ICHDX iqtisodchisi";
    actionName = "Xatolikni to‘g‘rilab, qayta yuborish";
    detailText = `Ruxsatnoma byurosi rad etgan (${registry.permitCheckResult || "sababsiz"}). ICHDX iqtisodchisi ma’lumotlarni tahrirlab, qayta kelishuvga yuborishi kerak.`;
  } else if (securityRejected) {
    responsibleRole = "ICHDX iqtisodchisi";
    actionName = "Xatolikni to‘g‘rilab, qayta yuborish";
    detailText = `Qo‘riqlash xizmati rad etgan (${registry.securityCheckResult || "sababsiz"}). ICHDX iqtisodchisi ma’lumotlarni tahrirlab, qayta kelishuvga yuborishi kerak.`;
  } else if (!shiftDone) {
    responsibleRole = "ICHDX smena boshlig‘i";
    actionName = "«Kelishildi» tasdiq tugmasi";
    detailText = "ICHDX smena boshlig‘i yuk xatini tekshirib, «Kelishildi» tasdiq tugmasini bosishi kutilmoqda.";
  } else if (!ecoPermitSent && !permitDone) {
    responsibleRole = "ICHDX iqtisodchisi";
    actionName = "«Ruxsatnomaga» yuborish tugmasi";
    detailText = "ICHDX iqtisodchisi yuk xatini Ruxsatnoma byurosiga yuborishi («Ruxsatnomaga» tugmasi) kutilmoqda.";
  } else if (!permitDone) {
    responsibleRole = "Ruxsatnoma byurosi";
    actionName = "«Kelishildi» tasdiq tugmasi";
    detailText = "Ruxsatnoma byurosi xodimi yuk xatini tekshirib, «Kelishildi» tasdiq tugmasini bosishi kutilmoqda.";
  } else if (!ecoSecuritySent && !securityDone) {
    responsibleRole = "ICHDX iqtisodchisi";
    actionName = "«Qo‘riqlashga» yuborish tugmasi";
    detailText = "ICHDX iqtisodchisi yuk xatini Qo‘riqlash xizmatiga yuborishi («Qo‘riqlashga» tugmasi) kutilmoqda.";
  } else if (!securityDone) {
    responsibleRole = "Qo‘riqlash xizmati";
    actionName = "«Ruxsat etildi» tasdiq tugmasi";
    detailText = "Qo‘riqlash xizmati xodimi yuk xatini tekshirib, «Ruxsat etildi» tasdiq tugmasini bosishi kutilmoqda.";
  } else if (!exitDone) {
    responsibleRole = "Temir yo‘l (mashinist / dispetcher)";
    actionName = "«Vagonlarni olib chiqish» tasdig‘i";
    detailText = "Temir yo‘l xizmati vagonlarni zavoddan Kengsoygacha olib chiqib, «Vagonlarni olib chiqish» tasdig‘ini bosishi kutilmoqda.";
  } else if (!externalDone) {
    responsibleRole = "ICHDX iqtisodchisi";
    actionName = "«1C / E-nakl ro‘yxatini tasdiqlash» tugmasi";
    detailText = "Vagonlar Kengsoygacha chiqarilgan. Endi ICHDX iqtisodchisi «1C / E-nakl ro‘yxatini tasdiqlash» tugmasini bosishi kutilmoqda.";
  } else {
    responsibleRole = "—";
    actionName = "Sikl yakunlangan";
    detailText = "Barcha amallar bajarilgan.";
  }

  const summaryText = `Hozirda kutilmoqda: ${responsibleRole} (${actionName})`;

  return {
    registryNumber: registry.registryNumber,
    responsibleRole,
    actionName,
    summaryText,
    detailText,
    isReturned,
    steps,
  };
}

export function describeRegistryPendingAction(registry: LoadingRegistry): string {
  return getRegistryPendingActionInfo(registry).detailText;
}
