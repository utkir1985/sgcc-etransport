import type { OrderFilters } from '../hooks/useOrderFilters';
import { OrderPeriodPicker } from './OrderPeriodPicker';

interface OrderPeriodToolbarProps {
  filters: OrderFilters;
  className?: string;
}

export function OrderPeriodToolbar({ filters, className = 'mb-6' }: OrderPeriodToolbarProps) {
  const {
    periodFrom,
    periodTo,
    setPeriodFrom,
    setPeriodTo,
  } = filters;

  return (
    <div className={`orders-toolbar orders-toolbar--period-only ${className}`.trim()}>
      <OrderPeriodPicker
        from={periodFrom}
        to={periodTo}
        onFromChange={setPeriodFrom}
        onToChange={setPeriodTo}
      />
    </div>
  );
}
