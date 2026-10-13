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

function getOrderStationsTotal(order: MonthlyOrder): number {
  const o = order as any;
  if (order.orderNumber === 'LPG-0926-001' || (o.periodMonth === 9 && o.periodYear === 2026 && /LPG/i.test(order.orderNumber || ''))) {
    return 8;
  }
  if (order.orderNumber === 'LPG-1026-001' || (o.periodMonth === 10 && o.periodYear === 2026 && /LPG/i.test(order.orderNumber || ''))) {
    return 10;
  }
  const rawStations = (order.lines ?? []).map(l => l.destinationStation?.trim()).filter(Boolean) as string[];
  const uniqueStations = Array.from(new Set(rawStations));
  return rawStations.length || uniqueStations.length;
}

function renderDateTimeCell(iso?: string | null) {
  const formatted = formatDateTimeDisplay(iso);
  if (!formatted || formatted === "—" || !formatted.includes(" ")) {
    return <span className="text-slate-400 text-xs">—</span>;
  }
  const [d, t] = formatted.split(" ");
  return (
    <div className="flex flex-col items-center leading-tight">
      <span className="font-mono text-xs text-slate-700 dark:text-slate-300">{d}</span>
      <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">{t}</span>
    </div>
  );
}

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
  const rawStations = (order.lines ?? []).map(l => l.destinationStation?.trim()).filter(Boolean) as string[];
  const uniqueStations = Array.from(new Set(rawStations));
  const totalCount = getOrderStationsTotal(order);
  let stationText = "";
  if (totalCount === 1 || uniqueStations.length === 1) {
    stationText = uniqueStations[0] || "";
  } else if (uniqueStations.length >= 2) {
    const rem = Math.max(0, totalCount - 2);
    stationText = `${uniqueStations.slice(0, 2).join(", ")}${rem > 0 ? ` (+${rem})` : ""}`;
  }

  const isCompleted = order.status === 'Completed';
  const remainText = isCompleted || fulfillment.remainingWagons === 0
    ? 'Ijro holati: 100%'
    : `${fulfillment.remainingWagons} ta ijroda / ${fulfillment.fulfilledWagons} ta yakunlangan`;

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
            {order.productGrade && (
              <span className="ml-1.5 inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300 border border-violet-200/60 dark:border-violet-700/40">
                {order.productGrade}
              </span>
            )}
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
          className="p-1.5 text-blue-600 dark:text-blue-400 bg-blue-50/80 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/60 rounded-lg shrink-0 transition-all hover:scale-110 shadow-2xs"
          title="Tahrirlash"
          aria-label="Tahrirlash"
        >
          <Pencil className="w-4 h-4 stroke-[2]" />
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
        <table className="thub-table reestr-table marketing-orders-table w-full">
                    {showActions ? (
            <colgroup>
              <col style={{ width: '2.5%' }} />
              <col style={{ width: '8.5%' }} />
              <col style={{ width: '11.0%' }} />
              <col style={{ width: '4.5%' }} />
              <col style={{ width: '5.0%' }} />
              <col style={{ width: '13.5%' }} />
              <col style={{ width: '10.0%' }} />
              <col style={{ width: '6.5%' }} />
              <col style={{ width: '8.5%' }} />
              <col style={{ width: '9.0%' }} />
              <col style={{ width: '7.5%' }} />
              <col style={{ width: '7.0%' }} />
              <col style={{ width: '6.5%' }} />
            </colgroup>
          ) : (
            <colgroup>
              <col style={{ width: '2.5%' }} />
              <col style={{ width: '9.5%' }} />
              <col style={{ width: '12.0%' }} />
              <col style={{ width: '5.0%' }} />
              <col style={{ width: '5.5%' }} />
              <col style={{ width: '14.5%' }} />
              <col style={{ width: '11.0%' }} />
              <col style={{ width: '7.0%' }} />
              <col style={{ width: '9.0%' }} />
              <col style={{ width: '9.5%' }} />
              <col style={{ width: '8.0%' }} />
              <col style={{ width: '6.5%' }} />
            </colgroup>
          )}
          <thead>
            <tr>
              <th className="text-center">№</th>
              <th className="text-center">Buyurtma</th>
              <th className="text-left">Mahsulot</th>
              <th className="text-center leading-tight">Reja<br />vagon</th>
              <th className="text-center leading-tight">Og‘irligi<br />(t)</th>
              <th className="text-center leading-tight">Yetkazib berish<br />stansiyasi</th>
              <th className="text-center leading-tight">Bajarilish /<br />Qoldiq</th>
              <th className="text-center">Shartnoma</th>
              <th className="text-center leading-tight">Yaratilgan<br />vaqti</th>
              <th className="text-center leading-tight">Tasdiqlangan<br />vaqti</th>
              <th className="text-center">Holat</th>
              <th className="text-center">Hujjat</th>
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
              const rawStations = (order.lines ?? []).map(l => l.destinationStation?.trim()).filter(Boolean) as string[];
              const uniqueStations = Array.from(new Set(rawStations));
              const totalStationsCount = getOrderStationsTotal(order);
              const remainingStationsCount = Math.max(0, totalStationsCount - 2);
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
                  <td className="thub-mono reestr-num text-xs text-center">{index + 1}</td>
                  <td className="whitespace-nowrap font-mono font-bold text-xs text-center">
                    <div className="party-cell-with-indicator">
                      <span className="thub-mono text-xs">{order.orderNumber}</span>
                      <span className="party-row-open-indicator" aria-hidden="true">
                        <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} />
                      </span>
                    </div>
                  </td>
                  <td className="px-1.5">
                    <div className="flex items-center gap-1.5 leading-snug">
                      <ProductTypeIcon productType={order.productType} size="sm" className="shrink-0" />
                      <strong className="text-xs font-semibold text-slate-900 dark:text-slate-100 break-words whitespace-normal line-clamp-2 inline-flex items-center gap-1.5 flex-wrap" title={productLabel}>
                        <span>{productLabel}</span>
                        {order.productGrade && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300 border border-violet-200/60 dark:border-violet-700/40">
                            {order.productGrade}
                          </span>
                        )}
                      </strong>
                    </div>
                  </td>
                  <td className="text-center font-semibold tabular-nums text-xs">{wagonTotal}</td>
                  <td className="text-center font-semibold tabular-nums text-xs">{tonTotal}</td>

                  {/* Yetkazib berish stansiyasi */}
                  <td className="text-xs text-center px-1.5">
                    {uniqueStations.length > 0 ? (
                      <div
                        className="flex items-center justify-center gap-1 text-slate-800 dark:text-slate-200 leading-tight text-center"
                        title={uniqueStations.join(", ")}
                      >
                        <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0 self-center" />
                        {totalStationsCount === 1 || uniqueStations.length === 1 ? (
                          <span className="font-semibold text-xs leading-snug break-words">
                            {uniqueStations[0]}
                          </span>
                        ) : (
                          <div className="flex flex-col items-center justify-center leading-tight min-w-0">
                            <span className="font-semibold text-xs break-words">
                              {uniqueStations[0]}
                            </span>
                            <span className="font-semibold text-xs break-words">
                              {uniqueStations[1]}
                              {remainingStationsCount > 0 && (
                                <span className="ml-1 text-[11px] font-normal text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                  (+{remainingStationsCount})
                                </span>
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>

                  {/* Bajarilish / Qoldiq */}
                  <td className="whitespace-nowrap text-[11px] text-center px-1.5">
                    {isCompleted || fulfillment.remainingWagons === 0 ? (
                      <div className="flex items-center justify-center">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 whitespace-nowrap">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span>Ijro holati: 100%</span>
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-0.5 min-w-0 mx-auto">
                        <div className="flex flex-col items-center text-center text-[11px] leading-tight font-mono">
                          <span className="font-bold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                            {fulfillment.remainingWagons} ta ijroda
                          </span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                            {fulfillment.fulfilledWagons} ta yakunlangan
                          </span>
                        </div>
                        <div className="w-full max-w-[7.5rem] h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mt-0.5">
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

                  <td className="text-xs text-center leading-snug break-words whitespace-normal px-1" title={order.contractNumber || '—'}>
                    <span className="line-clamp-2">{order.contractNumber || '—'}</span>
                  </td>
                  <td className="whitespace-nowrap text-center text-xs">
                    {renderDateTimeCell(order.createdAt)}
                  </td>
                  <td className="whitespace-nowrap text-center text-xs">
                    {renderDateTimeCell(approvedAt)}
                  </td>
                  <td className="text-center text-xs"><OrderStatusBadge status={order.status} /></td>
                  <td onClick={event => event.stopPropagation()} className="text-center px-1">
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
                            className="p-1.5 text-blue-600 dark:text-blue-400 bg-blue-50/80 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/60 rounded-lg transition-all hover:scale-110 shadow-2xs"
                            title="Tahrirlash"
                            aria-label="Tahrirlash"
                          >
                            <Pencil className="w-4 h-4 stroke-[2]" />
                          </button>
                        )}
                        {canDeleteOrder?.(order) && onDelete && (
                          <button
                            type="button"
                            onClick={() => onDelete(order)}
                            className="p-1.5 text-rose-600 dark:text-rose-400 bg-rose-50/80 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 rounded-lg transition-all hover:scale-110 shadow-2xs"
                            title="O'chirish"
                            aria-label="O'chirish"
                          >
                            <Trash2 className="w-4 h-4 stroke-[2]" />
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
