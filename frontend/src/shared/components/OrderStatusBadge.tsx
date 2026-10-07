import { useAuth } from '../contexts/AuthContext';
import {
  getOrderStatusLabel,
  isOrderStatusActionForRole,
} from '../constants/orderStatuses';

interface OrderStatusBadgeProps {
  status: string;
  /** Berilmasa — joriy foydalanuvchi roli */
  role?: string | null;
}

/** Holat → CSS modifier (Tailwind dynamic class purge muammosidan qochish) */
const STATUS_MODIFIER: Record<string, string> = {
  Draft: 'draft',
  PendingAccounting: 'accounting',
  ReturnedToMarketing: 'accounting',
  ReadyForDispatch: 'accounting',
  PendingDeputyDirector: 'accounting',
  PendingDispatching: 'accounting',
  Active: 'approved',
  Completed: 'completed',
  Cancelled: 'cancelled',
};

export function orderStatusModifier(status: string): string {
  return STATUS_MODIFIER[status] || 'draft';
}

export function OrderStatusBadge({ status, role: roleProp }: OrderStatusBadgeProps) {
  const { user } = useAuth();
  const role = roleProp ?? user?.role ?? null;
  const mod = orderStatusModifier(status);
  const action = isOrderStatusActionForRole(status, role);

  return (
    <span
      className={[
        'order-status-badge',
        `order-status-badge--${mod}`,
        action ? 'order-status-badge--action' : '',
      ].filter(Boolean).join(' ')}
    >
      {getOrderStatusLabel(status, role)}
    </span>
  );
}
