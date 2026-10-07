import { ChevronRight } from 'lucide-react';
import { ProductTypeIcon } from './ProductTypeIcon';
import { getProductLabel } from '../constants/productTypes';
import { LOGISTICS_TYPES } from '../constants/logisticsTypes';
import { STATUS_COLORS } from '../types';
import type { DailyPlan } from '../types';

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function statusLabel(status: string): string {
  switch (status) {
    case 'Draft':
      return 'Qoralama';
    case 'PendingMsMx':
      return 'MS/MX';
    case 'PendingRailway':
      return 'Temir yo‘l';
    case 'PendingWarehouse':
      return 'TM/XA';
    case 'PendingSecurity':
      return 'Qo‘riqlash';
    case 'Approved':
    case 'Active':
      return 'Tasdiqlangan';
    default:
      return status;
  }
}

interface PlanListRowProps {
  plan: DailyPlan;
  active?: boolean;
  onClick: () => void;
}

export function PlanListRow({ plan, active = false, onClick }: PlanListRowProps) {
  const productType = plan.productType || '';
  const lineCount = plan.lines?.length ?? 0;
  const contractOrOrder = plan.orderNumber?.trim() || '—';

  return (
    <button
      type="button"
      role="listitem"
      className={`marketing-order-row${active ? ' marketing-order-row--active' : ''}`}
      onClick={onClick}
    >
      <ProductTypeIcon productType={productType} size="sm" className="marketing-order-row__icon" />

      <div className="marketing-order-row__identity">
        <span className="marketing-order-row__product">
          {productType
            ? getProductLabel(productType, LOGISTICS_TYPES.Railway)
            : plan.planNumber}
        </span>
        <span className={`order-status-badge ${STATUS_COLORS[plan.status] || STATUS_COLORS.Draft}`}>
          {statusLabel(plan.status)}
        </span>
      </div>

      <div className="marketing-order-row__metrics" aria-label="Taqsimot ma'lumotlari">
        <span className="marketing-order-row__metric">
          <span className="marketing-order-row__metric-value">{plan.plannedWagons}</span>
          <span className="marketing-order-row__metric-label">vagon</span>
        </span>
        <span className="marketing-order-row__metric">
          <span className="marketing-order-row__metric-value">{lineCount}</span>
          <span className="marketing-order-row__metric-label">yo‘nalish</span>
        </span>
        <span className="marketing-order-row__metric">
          <span className="marketing-order-row__metric-value">{fmtDate(plan.planDate)}</span>
          <span className="marketing-order-row__metric-label">sana</span>
        </span>
        <span className="marketing-order-row__metric marketing-order-row__metric--contract">
          <span className="marketing-order-row__metric-value" title={contractOrOrder}>
            {contractOrOrder}
          </span>
          <span className="marketing-order-row__metric-label">buyurtma</span>
        </span>
      </div>

      <ChevronRight className="marketing-order-row__chevron w-5 h-5" strokeWidth={1.75} />
    </button>
  );
}

interface PlanListProps {
  plans: DailyPlan[];
  activePlanId?: string | null;
  onSelect: (plan: DailyPlan) => void;
}

export function PlanList({ plans, activePlanId, onSelect }: PlanListProps) {
  if (plans.length === 0) return null;

  return (
    <div className="marketing-orders-list" role="list">
      {plans.map(plan => (
        <PlanListRow
          key={plan.id}
          plan={plan}
          active={activePlanId === plan.id}
          onClick={() => onSelect(plan)}
        />
      ))}
    </div>
  );
}
