import { useState } from 'react';
import { ChevronRight, X, Pencil, Trash2, MapPin, CheckCircle2 } from 'lucide-react';
import { ProductTypeIcon } from './ProductTypeIcon';
import { OrderStatusBadge, orderStatusModifier } from './OrderStatusBadge';
import { DocumentChipButton } from './DocumentPackChip';
import { ProductOrderDocument, isProductOrderPrintReady } from './ProductOrderDocument';
import { DocumentPrintButton } from './DocumentPrintButton';
import { downloadOrderPdf } from '../utils/orderSheetPrint';
import { getProductLabel } from '../constants/productTypes';
import type { LogisticsType } from '../constants/logisticsTypes';
import type { MonthlyOrder } from '../types';
import { formatDateDisplay, formatDateTimeDisplay } from '../utils/dates';
import { summarizeOrderQuantities } from '../utils/orderQuantity';
import { computeOrderFulfillment } from './OrderFulfillmentStatus';

interface OrderListRowProps {
  order: MonthlyOrder;
  logisticsType: LogisticsType;
  active?: boolean;
  onClick: () => void;
  onEdit?: (order: MonthlyOrder) => void;
  canEdit?: boolean;
}

export function OrderListRow({ order, logisticsType, active = false, onClick, onEdit, canEdit }: OrderListRowProps) {
  const { wagonTotal } = summarizeOrderQuantities(order.lines);
  const productLabel = getProductLabel(order.productType, logisticsType);
  const deadlineLabel = formatDateDisplay(order.deadline?.slice(0, 10) || '') || '—';
  const fulfillment = computeOrderFulfillment(order);
  const stations = Array.from(new Set((order.lines ?? []).map(l => l.destinationStation).filter(Boolean))) as string[];
  const stationText = stations.length > 0 ? stations[0] : null;
  const isCompleted = order.status === 'Completed';
  const remainText = isCompleted || fulfillment.remainingWagons === 0
    ? '100% yopilgan (0 qoldi)'
    : `${fulfillment.remainingWagons} ta vagon qoldi (${fulfillment.fulfilledWagons}/${fulfillment.orderedWagons} yuklandi)`;

  const meta = [
    order.orderNumber,
    stationText ? `📍 ${stationText}` : null,
    wagonTotal > 0 ? `${wagonTotal} vagon` : null,
    remainText,
    deadlineLabel !== '—' ? deadlineLabel : null,
  ].filter(Boolean).join(' • ');
  const statusMod = orderStatusModifier(order.status);

  return (
    <div
      role="listitem"
      className={[
        'marketing-order-row marketing-order-row--compact',
        `marketing-order-row--${statusMod}`,
        active ? 'marketing-order-row--active' : '',
      ].filter(Boolean).join(' ')}
      onClick={onClick}
    >
      <ProductTypeIcon productType={order.productType} size="sm" className="marketing-order-row__icon" />

      <div className="marketing-order-row__compact-main">
        <div className="marketing-order-row__identity">
          <span className="marketing-order-row__product" title={productLabel}>
            {productLabel}
          </span>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="marketing-order-row__meta">{meta}</p>
      </div>

      {canEdit && onEdit && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(order);
          }}
          className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg shrink-0"
          title="Tahrirlash"
          aria-label="Tahrirlash"
        >
          <Pencil className="w-4 h-4" />
        </button>
      )}

      <ChevronRight className="marketing-order-row__chevron w-5 h-5 shrink-0" strokeWidth={1.75} />
    </div>
  );
}

interface OrderListProps {
  orders: MonthlyOrder[];
  logisticsType: LogisticsType;
  activeOrderId?: string | null;
  onSelect: (order: MonthlyOrder) => void;
  onEdit?: (order: MonthlyOrder) => void;
  onDelete?: (order: MonthlyOrder) => void;
  canEditOrder?: (order: MonthlyOrder) => boolean;
  canDeleteOrder?: (order: MonthlyOrder) => boolean;
}

export function OrderList({
  orders,
  logisticsType,
  activeOrderId,
  onSelect,
  onEdit,
  onDelete,
  canEditOrder,
  canDeleteOrder,
}: OrderListProps) {
  const [documentOrder, setDocumentOrder] = useState<MonthlyOrder | null>(null);

  if (orders.length === 0) return null;

  const showActions = !!(onEdit || onDelete);

  return (
    <>
      <div className="thub-table-wrap reestr-table-wrap hidden md:block">
        <table className="thub-table reestr-table docs-hub-table registry-archive-table marketing-orders-table">
          <thead>
            <tr>
              <th>№</th>
              <th>Buyurtma</th>
              <th>Mahsulot</th>
              <th>Reja vagon</th>
              <th>Og‘irligi (t)</th>
              <th>Yetkazib berish stansiyasi</th>
              <th>Bajarilish / Qoldiq</th>
              <th>Shartnoma</th>
              <th>Yaratilgan vaqt</th>
              <th>Tasdiqlangan vaqt</th>
              <th>Holat</th>
              <th>Hujjat</th>
              {showActions && <th className="text-center">Amallar</th>}
            </tr>
          </thead>
          <tbody>
            {orders.map((order, index) => {
              const { wagonTotal, tonTotal } = summarizeOrderQuantities(order.lines);
              const productLabel = getProductLabel(order.productType, logisticsType);
              const active = activeOrderId === order.id;
              const approvedAt = order.dispatchApprovedAt || null;
              const fulfillment = computeOrderFulfillment(order);
              const stations = Array.from(new Set((order.lines ?? []).map(l => l.destinationStation).filter(Boolean))) as string[];
              const isCompleted = order.status === 'Completed';

              return (
                <tr
                  key={order.id}
                  role="button"
                  tabIndex={0}
                  aria-current={active ? 'true' : undefined}
                  className={`marketing-orders-table__row party-row-open-trigger${active ? ' is-active' : ''}`}
                  onClick={() => onSelect(order)}
                  title="Buyurtma tarkibini to‘liq ko‘rish"
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelect(order);
                    }
                  }}
                >
                  <td className="thub-mono reestr-num text-sm">{index + 1}</td>
                  <td className="whitespace-nowrap font-mono font-bold text-sm text-center">
                    <div className="party-cell-with-indicator">
                      <span className="thub-mono text-sm">{order.orderNumber}</span>
                      <span className="party-row-open-indicator" aria-hidden="true">
                        <ChevronRight className="h-4 w-4" strokeWidth={2.25} />
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-2.5 min-w-[11rem]">
                      <ProductTypeIcon productType={order.productType} size="sm" />
                      <strong className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100" title={productLabel}>
                        {productLabel}
                      </strong>
                    </div>
                  </td>
                  <td className="text-center font-semibold tabular-nums text-sm">{wagonTotal}</td>
                  <td className="text-center font-semibold tabular-nums text-sm">{tonTotal}</td>

                  {/* Yetkazib berish stansiyasi */}
                  <td className="whitespace-nowrap text-sm">
                    {stations.length > 0 ? (
                      <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200">
                        <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span className="font-semibold text-xs" title={stations.join(', ')}>
                          {stations[0]}
                          {stations.length > 1 && (
                            <span className="ml-1 text-[10px] font-normal text-slate-400">
                              (+{stations.length - 1})
                            </span>
                          )}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>

                  {/* Bajarilish / Qoldiq */}
                  <td className="whitespace-nowrap text-sm">
                    {isCompleted || fulfillment.remainingWagons === 0 ? (
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>100% yopilgan</span>
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          (0 qoldi)
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="font-bold text-rose-600 dark:text-rose-400 font-mono">
                            {fulfillment.remainingWagons} ta qoldi
                          </span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            ({fulfillment.fulfilledWagons}/{fulfillment.orderedWagons} yuklandi)
                          </span>
                        </div>
                        <div className="w-24 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mt-1">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all"
                            style={{
                              width: `${Math.min(100, Math.round((fulfillment.fulfilledWagons / (fulfillment.orderedWagons || 1)) * 100))}%`
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </td>

                  <td className="whitespace-nowrap text-sm">{order.contractNumber || '—'}</td>
                  <td className="whitespace-nowrap tabular-nums text-sm">{formatDateTimeDisplay(order.createdAt)}</td>
                  <td className="whitespace-nowrap tabular-nums text-sm">{formatDateTimeDisplay(approvedAt)}</td>
                  <td className="text-sm"><OrderStatusBadge status={order.status} /></td>
                  <td onClick={event => event.stopPropagation()}>
                    <DocumentChipButton
                      onClick={() => setDocumentOrder(order)}
                      title={`${order.orderNumber} buyurtma hujjatini ko‘rish`}
                    />
                  </td>
                  {showActions && (
                    <td onClick={event => event.stopPropagation()} className="whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-1">
                        {canEditOrder?.(order) && onEdit && (
                          <button
                            type="button"
                            onClick={() => onEdit(order)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                            title="Tahrirlash"
                            aria-label="Tahrirlash"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        {canDeleteOrder?.(order) && onDelete && (
                          <button
                            type="button"
                            onClick={() => onDelete(order)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors"
                            title="O'chirish"
                            aria-label="O'chirish"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="marketing-orders-list marketing-orders-list--mobile" role="list">
        {orders.map(order => (
          <OrderListRow
            key={order.id}
            order={order}
            logisticsType={logisticsType}
            active={activeOrderId === order.id}
            onClick={() => onSelect(order)}
            onEdit={onEdit}
            canEdit={canEditOrder?.(order)}
          />
        ))}
      </div>

      {documentOrder ? (
        <div className="yx-preview-root" role="dialog" aria-modal="true" aria-label="Buyurtma hujjati">
          <div className="yx-preview-bar">
            <div>
              <div className="yx-preview-bar__title">Buyurtma — {documentOrder.orderNumber}</div>
              <div className="mt-0.5 text-xs text-slate-400">
                {getProductLabel(documentOrder.productType, logisticsType)}
                {' · '}{summarizeOrderQuantities(documentOrder.lines).wagonTotal} vagon
              </div>
            </div>
            <div className="yx-preview-bar__actions">
              <DocumentPrintButton
                ready={isProductOrderPrintReady(documentOrder)}
                onPrint={() => downloadOrderPdf(documentOrder.id)}
              />
              <button
                type="button"
                className="btn-secondary !px-2.5 !py-1.5 !text-xs !bg-slate-800 !text-slate-100 !border-slate-600"
                onClick={() => setDocumentOrder(null)}
                aria-label="Yopish"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
          </div>
          <div
            className="yx-preview-scroll"
            onClick={event => {
              if ((event.target as HTMLElement).closest('.product-order-document')) return;
              setDocumentOrder(null);
            }}
          >
            <ProductOrderDocument order={documentOrder} logisticsType={logisticsType} preview />
          </div>
        </div>
      ) : null}
    </>
  );
}
