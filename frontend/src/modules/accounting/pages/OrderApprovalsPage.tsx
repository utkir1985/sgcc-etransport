import { useEffect, useMemo, useState } from 'react';
import { ProductDetailBackButton } from '../../../shared/components/ProductDetailBackButton';
import { api } from '../../../shared/services/api';
import { OrderAccountingSheet } from '../../../shared/components/OrderAccountingSheet';
import { OrderApprovedSheet } from '../../../shared/components/OrderApprovedSheet';
import { OrderEditHistory } from '../../../shared/components/OrderEditHistory';
import { OrderFulfillmentStatus } from '../../../shared/components/OrderFulfillmentStatus';
import { OrderFilterPlaceholder } from '../../../shared/components/OrderFilterPlaceholder';
import { OrderPeriodPicker } from '../../../shared/components/OrderPeriodPicker';
import { MarketingOrdersHome } from '../../../shared/components/MarketingOrdersHome';
import { OrderList } from '../../../shared/components/OrderListRow';
import { useOrderFilters } from '../../../shared/hooks/useOrderFilters';
import { LOGISTICS_LABELS, LOGISTICS_TYPES } from '../../../shared/constants/logisticsTypes';
import { listAccountingOrdersForPeriod } from '../../../shared/utils/orderApprovalNav';
import { entriesFromProductNames, getProductLabel } from '../../../shared/constants/productTypes';
import type { MonthlyOrder } from '../../../shared/types';
import { notifyOrdersChanged, subscribeOrdersChanged } from '../../../shared/utils/realtimeSync';

const RAILWAY_LOGISTICS = LOGISTICS_TYPES.Railway;

export default function OrderApprovalsPage() {
  const filters = useOrderFilters();
  const {
    periodFrom,
    periodTo,
    setPeriodFrom,
    setPeriodTo,
  } = filters;

  const [orders, setOrders] = useState<MonthlyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProductType, setFilterProductType] = useState('');
  const [viewOrderId, setViewOrderId] = useState<string | null>(null);
  const [productEntries, setProductEntries] = useState<{ productType: string; title: string; shortTitle: string }[]>([]);

  const matchingOrders = useMemo(
    () => listAccountingOrdersForPeriod(orders, periodFrom, periodTo, filterProductType),
    [orders, periodFrom, periodTo, filterProductType],
  );

  const viewOrder = useMemo(
    () => (viewOrderId ? matchingOrders.find(o => o.id === viewOrderId) ?? orders.find(o => o.id === viewOrderId) : null),
    [viewOrderId, matchingOrders, orders],
  );

  const load = (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    api.getOrders(RAILWAY_LOGISTICS)
      .then(res => setOrders((res.data ?? []).map(o => ({ ...o, attachments: o.attachments ?? [] }))))
      .finally(() => {
        if (!options?.silent) setLoading(false);
      });
  };

  useEffect(() => {
    load();
    api.getProducts(RAILWAY_LOGISTICS)
      .then(res => setProductEntries(entriesFromProductNames((res.data ?? []).map(p => p.name))))
      .catch(() => setProductEntries([]));

    const unsubscribe = subscribeOrdersChanged(() => {
      load({ silent: true });
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (viewOrderId && !matchingOrders.some(o => o.id === viewOrderId)) {
      setViewOrderId(null);
    }
  }, [matchingOrders, viewOrderId]);

  const renderPeriodPicker = () => (
    <OrderPeriodPicker
      variant="embedded"
      from={periodFrom}
      to={periodTo}
      onFromChange={setPeriodFrom}
      onToChange={setPeriodTo}
    />
  );

  if (loading) {
    return <div className="py-12 text-center text-gray-400 dark:text-slate-500">Yuklanmoqda...</div>;
  }

  if (viewOrder) {
    const isPending = viewOrder.status === 'PendingAccounting';

    return (
      <div className="marketing-order-page space-y-4">
        <div className="marketing-order-page__bar ui-card">
          <div className="marketing-order-page__bar-main">
            <ProductDetailBackButton onClick={() => setViewOrderId(null)} />
            <div className="min-w-0">
              <h2 className="marketing-order-page__title">
                {getProductLabel(viewOrder.productType, RAILWAY_LOGISTICS)}
              </h2>
              <p className="marketing-order-page__subtitle">{viewOrder.orderNumber}</p>
            </div>
          </div>
        </div>
        {isPending ? (
          <OrderAccountingSheet
            order={viewOrder}
            logisticsType={RAILWAY_LOGISTICS}
            onFinalizeReview={selections =>
              api.finalizeAccountingReview(viewOrder.id, selections).then(() => {
                notifyOrdersChanged();
                load({ silent: true });
              })
            }
          />
        ) : (
          <OrderApprovedSheet
            order={viewOrder}
            logisticsType={RAILWAY_LOGISTICS}
          />
        )}
        <div className="order-detail-split">
          <OrderEditHistory orderId={viewOrder.id} />
          {(viewOrder.status === 'Active' || viewOrder.status === 'Completed') ? (
            <OrderFulfillmentStatus order={viewOrder} />
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <MarketingOrdersHome
      title={LOGISTICS_LABELS[RAILWAY_LOGISTICS]}
      hideHeader
      productEntries={productEntries}
      filterProductType={filterProductType}
      onFilterProductChange={setFilterProductType}
      periodControl={renderPeriodPicker()}
    >
      {matchingOrders.length === 0 ? (
        <OrderFilterPlaceholder
          periodFrom={periodFrom}
          periodTo={periodTo}
          filterProductType={filterProductType}
          mode={filterProductType ? 'product' : 'period'}
        />
      ) : (
        <OrderList
          orders={matchingOrders}
          logisticsType={RAILWAY_LOGISTICS}
          activeOrderId={viewOrderId}
          onSelect={order => setViewOrderId(order.id)}
        />
      )}
    </MarketingOrdersHome>
  );
}
