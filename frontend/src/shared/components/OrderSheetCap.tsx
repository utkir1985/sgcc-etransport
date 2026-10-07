import type { ReactNode } from 'react';
import { OrderStatusBadge } from './OrderStatusBadge';

interface OrderSheetCapProps {
  orderNumber: string;
  status: string;
  actions?: ReactNode;
}

export function OrderSheetCap({ orderNumber, status, actions }: OrderSheetCapProps) {
  return (
    <div className="order-sheet-cap">
      <div className="order-sheet-cap__left">
        <span className="order-sheet-cap__code">{orderNumber}</span>
        <OrderStatusBadge status={status} />
      </div>
      {actions && <div className="order-sheet-cap__actions">{actions}</div>}
    </div>
  );
}
