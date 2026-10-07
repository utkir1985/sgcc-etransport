/** 1C integratsiyasidan kelgan yozuvlar E-Transport operatsion zanjirida chiqmaydi (faqat sof E-Transport). */

export function isOneCOrder(order?: { orderNumber?: string | null; contractNumber?: string | null } | null): boolean {
  if (!order) return false;
  const num = order.orderNumber ?? '';
  const cnt = order.contractNumber ?? '';
  return num.startsWith('MO-T-1C-') || num.startsWith('1C-') || cnt.startsWith('1C-');
}

export function isOneCPlan(plan?: { planNumber?: string | null } | null): boolean {
  if (!plan) return false;
  const num = plan.planNumber ?? '';
  return num.startsWith('DP-1C-') || num.startsWith('1C-');
}

export function isOneCArrival(arrival?: {
  arrivalNumber?: string | null;
  notes?: string | null;
} | null): boolean {
  if (!arrival) return false;
  const num = arrival.arrivalNumber ?? '';
  const notes = arrival.notes ?? '';
  return num.startsWith('1C-') || notes.includes('1C vesii');
}

export function isOneCUnit(unit?: { sealConfirmedByScaleName?: string | null; defectActNumber?: string | null } | null): boolean {
  if (!unit) return false;
  const defect = unit.defectActNumber ?? '';
  return defect.startsWith('1C-') || defect.startsWith('IR-1C-');
}

export function excludeOneCOrders<T extends { orderNumber?: string | null; contractNumber?: string | null }>(
  orders: T[],
): T[] {
  return orders.filter(o => !isOneCOrder(o));
}

export function excludeOneCPlans<T extends { planNumber?: string | null }>(plans: T[]): T[] {
  return plans.filter(p => !isOneCPlan(p));
}

export function excludeOneCArrivals<T extends {
  arrivalNumber?: string | null;
  notes?: string | null;
}>(arrivals: T[]): T[] {
  return arrivals.filter(a => !isOneCArrival(a));
}

export function isInternalFondArrival(arrival?: { arrivalNumber?: string | null } | null): boolean {
  if (!arrival) return false;
  const num = arrival.arrivalNumber ?? '';
  return num.startsWith('ZF-');
}

export function isRailwayEntryArrival(arrival?: {
  arrivalNumber?: string | null;
  notes?: string | null;
} | null): boolean {
  return !isOneCArrival(arrival) && !isInternalFondArrival(arrival);
}

