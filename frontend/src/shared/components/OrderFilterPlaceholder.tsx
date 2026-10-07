import { Package } from 'lucide-react';
import { getProductLabel } from '../constants/productTypes';
import { LOGISTICS_TYPES } from '../constants/logisticsTypes';
import { formatPeriodRangeLabel } from '../utils/dates';

interface OrderFilterPlaceholderProps {
  periodFrom?: string;
  periodTo?: string;
  /** @deprecated */
  filterYear?: number;
  /** @deprecated */
  filterMonth?: number;
  filterProductType?: string;
  mode?: 'period' | 'product';
}

export function OrderFilterPlaceholder({
  periodFrom = '',
  periodTo = '',
  filterProductType = '',
  mode = 'product',
}: OrderFilterPlaceholderProps) {
  const periodLabel = formatPeriodRangeLabel(periodFrom, periodTo);
  const primaryLine = mode === 'period' || !filterProductType
    ? periodLabel
    : `${periodLabel} · ${getProductLabel(filterProductType, LOGISTICS_TYPES.Railway)}`;

  const secondaryLine = mode === 'period'
    ? (periodFrom || periodTo
      ? 'Bu davrda jarayon uchun buyurtma yo‘q'
      : 'Hozircha jarayon uchun buyurtma yo‘q')
    : filterProductType
      ? 'Bu davr va mahsulot bo‘yicha buyurtma topilmadi'
      : (periodFrom || periodTo
        ? 'Bu davrda jarayon uchun buyurtma yo‘q'
        : 'Hozircha jarayon uchun buyurtma yo‘q');

  return (
    <div className="order-sheet-card">
      <div className="order-sheet-table-box">
        <div className="order-sheet-scroll">
          <div className="order-sheet-empty-state py-16 px-6 text-center">
            <Package className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-slate-600" strokeWidth={1.5} />
            <p className="order-sheet-empty-state-primary">{primaryLine}</p>
            <p className="order-sheet-empty-state-secondary">{secondaryLine}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
