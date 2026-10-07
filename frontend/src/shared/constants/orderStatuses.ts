export const ORDER_STATUS_LABELS: Record<string, string> = {
  Draft: 'Qoralama',
  PendingAccounting: 'Kelishish jarayonida',
  ReturnedToMarketing: 'Kelishish jarayonida',
  ReadyForDispatch: 'Tasdiqlash kutilmoqda',
  PendingDeputyDirector: 'Tasdiqlash kutilmoqda',
  PendingDispatching: 'Kelishish jarayonida',
  Active: 'Ijroda',
  Completed: 'Yakunlandi',
  Cancelled: 'Bekor qilingan',
};

/** O‘z navbati kelganda — harakatga chorlovchi yozuv */
export const ORDER_STATUS_ACTION_LABELS: Record<string, string> = {
  Draft: 'Yuborish kerak',
  ReturnedToMarketing: 'Qayta yuborish kerak',
  PendingAccounting: 'Kelishish kerak',
  ReadyForDispatch: 'O\'rinbosarga o\'tkazing',
  PendingDeputyDirector: 'Tasdiqlash kerak',
  PendingDispatching: 'Ijroga qabul qiling',
};

const STATUS_ACTOR_ROLES: Record<string, string[]> = {
  Draft: ['Marketing', 'Management'],
  ReturnedToMarketing: ['Marketing', 'Management'],
  PendingAccounting: ['Accounting'],
  ReadyForDispatch: ['Marketing', 'Management'],
  PendingDeputyDirector: ['DeputyDirector'],
  PendingDispatching: ['DispatchSupervisor'],
};

export function isOrderStatusActionForRole(status: string, role?: string | null): boolean {
  if (!role) return false;
  const actors = STATUS_ACTOR_ROLES[status];
  if (!actors) return false;
  return role === 'Admin' || actors.includes(role);
}

export function getOrderStatusLabel(status: string, _role?: string | null): string {
  return ORDER_STATUS_LABELS[status] || status;
}
