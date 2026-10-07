import type { ReactNode } from 'react';
import {
  getProductButtonLabel,
  getProductOptions,
  RAILWAY_PRODUCT_TYPE_WIDTH_LABEL,
} from '../constants/productTypes';
import { LOGISTICS_TYPES } from '../constants/logisticsTypes';
import type { OrderFilters } from '../hooks/useOrderFilters';
import { OrderPeriodPicker } from './OrderPeriodPicker';
import { ProductTypeFilter } from './ProductTypeFilter';

const RAILWAY_LOGISTICS = LOGISTICS_TYPES.Railway;
const RAILWAY_PRODUCTS = getProductOptions(RAILWAY_LOGISTICS);

interface OrderFilterToolbarProps {
  filters: OrderFilters;
  actions?: ReactNode;
}

export function OrderFilterToolbar({ filters, actions }: OrderFilterToolbarProps) {
  const {
    periodFrom,
    periodTo,
    setPeriodFrom,
    setPeriodTo,
    filterProductType,
    setFilterProductType,
  } = filters;

  const options = RAILWAY_PRODUCTS.map(group => ({
    value: group.options[0].value,
    label: getProductButtonLabel(group.options[0].value, RAILWAY_LOGISTICS) || group.group,
  }));

  return (
    <div className="orders-toolbar mb-6">
      <ProductTypeFilter
        value={filterProductType}
        options={options}
        onChange={setFilterProductType}
        widthLabel={RAILWAY_PRODUCT_TYPE_WIDTH_LABEL}
      />

      <OrderPeriodPicker
        from={periodFrom}
        to={periodTo}
        onFromChange={setPeriodFrom}
        onToChange={setPeriodTo}
      />

      {actions && <div className="orders-toolbar-actions">{actions}</div>}
    </div>
  );
}
