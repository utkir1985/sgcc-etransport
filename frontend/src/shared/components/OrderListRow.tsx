import { useEffect, useState, type ReactNode } from 'react';
import { ChevronRight, X, Pencil, Trash2, CheckCircle2 } from 'lucide-react';
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
import { computeOrderFulfillment, isOrderFulfilled, isOrderLoadingOverdue } from './OrderFulfillmentStatus';
import { TablePagination } from './TablePagination';

/** Tonna: mingliklar probel bilan, kasr nuqta bilan (masalan, 8 301.26) — brauzer locale'iga bog‘liq emas. */
/** Buyurtma hozirgi kelishuv bosqichiga qachon kelgani (mavjud vaqt belgilari bo‘yicha). */
function stageEnteredAt(order: MonthlyOrder): string | null | undefined {
  switch (order.status) {
    case 'Draft': return order.createdAt;
    case 'PendingAccounting': return order.submittedAt;
    case 'ReadyForDispatch': return order.approvedAt ?? order.submittedAt;
    case 'PendingDeputyDirector': return order.submittedToDispatchAt ?? order.approvedAt ?? order.submittedAt;
    case 'PendingDispatching': return order.deputyApprovedAt ?? order.submittedToDispatchAt;
    case 'ReturnedToMarketing': return order.approvedAt ?? order.submittedAt;
    default: return null;
  }
}

function formatTons(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const [int, frac] = Math.abs(rounded).toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  const decimals = frac.replace(/0+$/, '');
  return `${rounded < 0 ? '-' : ''}${grouped}${decimals ? `.${decimals}` : ''}`;
}

function renderDateTimeCell(iso?: string | null) {
  const formatted = formatDateTimeDisplay(iso);
  if (!formatted || formatted === "—" || !formatted.includes(" ")) {
    return <span className="text-slate-400 text-xs">—</span>;
  }
  const [d, t] = formatted.split(" ");
  return (
    <span className="whitespace-nowrap tabular-nums">
      <span className="text-xs text-slate-700 dark:text-slate-300">{d}</span>{' '}
      <span className="text-[11px] text-slate-400 dark:text-slate-500">{t}</span>
    </span>
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
  const productLabel = getProductLabel(order.productType, logisticsType);
  const deadlineLabel = formatDateDisplay(order.deadline?.slice(0, 10) || '') || '—';
  const fulfillment = computeOrderFulfillment(order);

  const isCompleted = order.status === 'Completed' || isOrderFulfilled(order);
  const remainText = isCompleted
    ? 'Ijro holati: 100%'
    : `${formatTons(fulfillment.remainingTons)} t qoldi / ${fulfillment.fulfilledWagons} vagon yuklandi`;

  const meta = [
    order.orderNumber,
    `${formatTons(summarizeOrderQuantities(order.lines).tonTotal)} t`,
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
          {isOrderLoadingOverdue(order) ? (
            <span className="marketing-orders-table__overdue">Muddat o‘tgan</span>
          ) : null}
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
  /**
   * Bo‘lim ko‘rinishi: `faol` — ijrodagi (holat ustunisiz), `tasdiq` — kelishuvdagi
   * («Kimda turibdi» ustuni), `yakun` — yakunlangan («Jo‘natildi»). `all` — barcha ustunlar.
   */
  variant?: OrderListVariant;
}

export type OrderListVariant = 'all' | 'faol' | 'tasdiq' | 'yakun';

type OrderColumnKey =
  | 'num' | 'order' | 'product' | 'wagons' | 'tons' | 'done' | 'remain' | 'shipped' | 'stage' | 'waiting'
  | 'contract' | 'created' | 'approved' | 'status' | 'doc' | 'actions';

/** Ustunlar nisbiy kengligi — ko‘rinadigan ustunlar bo‘yicha 100% ga moslanadi. */
const COLUMN_WEIGHT: Record<OrderColumnKey, number> = {
  num: 3, order: 10, product: 15, wagons: 7, tons: 7, done: 11, remain: 8, shipped: 10, stage: 16, waiting: 13,
  contract: 9, created: 11, approved: 11, status: 11, doc: 8, actions: 8,
};

function orderColumns(variant: OrderListVariant, showActions: boolean): OrderColumnKey[] {
  switch (variant) {
    case 'faol':
      return ['num', 'order', 'product', 'wagons', 'tons', 'done', 'remain', 'contract', 'created', 'approved', 'doc'];
    case 'tasdiq':
      return ['num', 'order', 'product', 'tons', 'stage', 'waiting', 'contract', 'created', 'doc'];
    case 'yakun':
      return ['num', 'order', 'product', 'wagons', 'tons', 'shipped', 'contract', 'created', 'approved', 'doc'];
    default:
      return ['num', 'order', 'product', 'wagons', 'tons', 'done', 'remain', 'contract', 'created', 'approved', 'status', 'doc',
        ...(showActions ? ['actions' as const] : [])];
  }
}

/** Kelishuvdagi buyurtma hozir kimda turgani (mavjud holat belgisi ranglari bilan). */
const ORDER_STAGE: Record<string, { label: string; mod: string }> = {
  Draft: { label: 'Qoralama', mod: 'draft' },
  PendingAccounting: { label: 'Buxgalteriyada', mod: 'accounting' },
  ReturnedToMarketing: { label: 'Marketingga qaytarilgan', mod: 'returned' },
  ReadyForDispatch: { label: 'Marketingda — o‘rinbosarga yuborish', mod: 'marketing' },
  PendingDeputyDirector: { label: 'Bosh direktor o‘rinbosarida', mod: 'deputy' },
  PendingDispatching: { label: 'ICHDX — ijroga qabul', mod: 'ichdx' },
};

export function OrderList({
  orders,
  logisticsType,
  activeOrderId,
  onSelect,
  onEdit,
  onDelete,
  canEditOrder,
  canDeleteOrder,
  variant = 'all',
}: OrderListProps) {
  const [documentOrder, setDocumentOrder] = useState<MonthlyOrder | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Filtr o‘zgarib ro‘yxat qisqarsa, mavjud bo‘lmagan sahifada qolib ketmaslik uchun
  useEffect(() => {
    setPage(1);
  }, [orders.length]);

  if (orders.length === 0) return null;

  const totalPages = Math.max(1, Math.ceil(orders.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const pageOrders = orders.slice(startIndex, startIndex + pageSize);

  const showActions = !!(onEdit || onDelete);
  const columns = orderColumns(variant, showActions);
  const has = (key: OrderColumnKey) => columns.includes(key);
  const weightTotal = columns.reduce((sum, key) => sum + COLUMN_WEIGHT[key], 0);
  // Sarlavhalar bir qatorda — qisqa nomlar, to‘liq ma’no title'da
  const COLUMN_HEADER: Record<OrderColumnKey, { label: ReactNode; className: string; title?: string }> = {
    num: { label: '№', className: 'text-center' },
    order: { label: 'Buyurtma ID', className: 'text-center', title: 'Tizimdagi ichki buyurtma raqami' },
    product: { label: 'Mahsulot', className: 'text-left' },
    wagons: { label: 'Vagon soni', className: 'text-center', title: 'Yuklangan vagonlar soni' },
    tons: { label: 'Reja (t)', className: 'text-center', title: 'Buyurtma bo‘yicha reja, tonna' },
    done: { label: 'Bajarilish', className: 'text-center', title: 'Yuklangan og‘irlik va foiz' },
    remain: { label: 'Qoldiq', className: 'text-center', title: 'Yuklanishi qolgan og‘irlik' },
    shipped: { label: 'Jo‘natildi (t)', className: 'text-center', title: 'Yuk xatlari bo‘yicha jo‘natilgan og‘irlik' },
    stage: { label: 'Kelishuv bosqichi', className: 'text-center', title: 'Buyurtma hozir kimning kelishuvida turibdi' },
    waiting: { label: 'Bosqichda', className: 'text-center', title: 'Shu bosqichga qachon kelgani va qancha kutayotgani' },
    contract: { label: 'Shartnoma', className: 'text-center' },
    created: { label: 'Yaratilgan', className: 'text-center', title: 'Yaratilgan sana va vaqt' },
    approved: { label: 'Tasdiqlangan', className: 'text-center', title: 'Tasdiqlangan sana va vaqt' },
    status: { label: 'Holat', className: 'text-center' },
    doc: { label: 'Hujjat', className: 'text-center' },
    actions: { label: 'Amallar', className: 'text-center' },
  };

  return (
    <>
      <div className="thub-table-wrap reestr-table-wrap hidden md:block">
        <table className="thub-table reestr-table marketing-orders-table w-full">
          <colgroup>
            {columns.map(key => (
              <col key={key} style={{ width: `${((COLUMN_WEIGHT[key] / weightTotal) * 100).toFixed(2)}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columns.map(key => (
                <th key={key} className={COLUMN_HEADER[key].className} title={COLUMN_HEADER[key].title}>{COLUMN_HEADER[key].label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageOrders.map((order, index) => {
              const { tonTotal } = summarizeOrderQuantities(order.lines);
              const productLabel = getProductLabel(order.productType, logisticsType);
              const active = activeOrderId === order.id;
              const approvedAt = order.dispatchApprovedAt || null;
              const fulfillment = computeOrderFulfillment(order);
              const isCompleted = order.status === 'Completed' || isOrderFulfilled(order);
              const tonPct = fulfillment.orderedTons > 0
                ? Math.min(100, Math.round((fulfillment.fulfilledTons / fulfillment.orderedTons) * 100))
                : 0;

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
                  <td className="thub-mono reestr-num text-xs text-center">{startIndex + index + 1}</td>
                  <td className="whitespace-nowrap text-xs text-center">
                    <div className="party-cell-with-indicator">
                      <span className="marketing-orders-table__number">{order.orderNumber}</span>
                      <span className="party-row-open-indicator" aria-hidden="true">
                        <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} />
                      </span>
                    </div>
                  </td>
                  <td className="px-1.5">
                    <div className="flex items-center gap-1.5 leading-snug">
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
                  {has('wagons') && <td className="text-center font-semibold tabular-nums text-xs whitespace-nowrap">{fulfillment.fulfilledWagons} ta</td>}
                  <td className="text-center font-semibold tabular-nums text-xs whitespace-nowrap">{formatTons(tonTotal)}</td>

                  {has('stage') && (
                    <td className="text-center text-xs">
                      <div className="marketing-orders-table__status">
                        <span className={`order-status-badge order-status-badge--${ORDER_STAGE[order.status]?.mod ?? 'draft'}`}>
                          {ORDER_STAGE[order.status]?.label ?? order.status}
                        </span>
                      </div>
                    </td>
                  )}

                  {has('shipped') && (
                    <td className="text-center text-xs">
                      {order.status === 'Cancelled' ? (
                        <span className="order-status-badge order-status-badge--cancelled">Bekor qilingan</span>
                      ) : (
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap tabular-nums">
                          {formatTons(fulfillment.fulfilledTons)}
                        </span>
                      )}
                    </td>
                  )}

                  {has('waiting') && (() => {
                    const since = stageEnteredAt(order);
                    const days = since ? Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 86_400_000)) : null;
                    return (
                      <td className="text-center text-xs">
                        {since ? (
                          <div className="flex flex-col items-center gap-0.5">
                            {renderDateTimeCell(since)}
                            <span className={`text-[11px] font-semibold ${days !== null && days >= 3 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>
                              {days === 0 ? 'bugun' : `${days} kun kutmoqda`}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    );
                  })()}

                  {/* Bajarilish: foiz + yuklangan og‘irlik + progress */}
                  {has('done') && (
                    <td className="px-3">
                      <div className={`order-progress${isCompleted ? ' order-progress--done' : tonPct >= 75 ? ' order-progress--high' : ''}`}>
                        <div className="order-progress__top">
                          <span className="order-progress__pct">{isCompleted ? 100 : tonPct}%</span>
                          <span className="order-progress__tons">{formatTons(fulfillment.fulfilledTons)} t</span>
                        </div>
                        <div className="order-progress__bar">
                          <i style={{ width: `${isCompleted ? 100 : tonPct}%` }} />
                        </div>
                      </div>
                    </td>
                  )}

                  {/* Qoldiq */}
                  {has('remain') && (
                    <td className="text-center px-2">
                      {isCompleted ? (
                        <span className="order-remain order-remain--done">
                          <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
                          Yopildi
                        </span>
                      ) : (
                        <span className="order-remain">
                          {formatTons(fulfillment.remainingTons)}<small>t</small>
                        </span>
                      )}
                      {!has('status') && isOrderLoadingOverdue(order) ? (
                        <div className="mt-1">
                          <span className="marketing-orders-table__overdue">Muddat o‘tgan</span>
                        </div>
                      ) : null}
                    </td>
                  )}

                  <td className="text-xs text-center leading-snug break-words whitespace-normal px-1" title={order.contractNumber || '—'}>
                    <span className="line-clamp-2">{order.contractNumber || '—'}</span>
                  </td>
                  <td className="whitespace-nowrap text-center text-xs">
                    {renderDateTimeCell(order.createdAt)}
                  </td>
                  {has('approved') && (
                    <td className="whitespace-nowrap text-center text-xs">
                      {renderDateTimeCell(approvedAt)}
                    </td>
                  )}
                  {has('status') && (
                    <td className="text-center text-xs">
                      <div className="marketing-orders-table__status">
                        <OrderStatusBadge status={order.status} />
                        {isOrderLoadingOverdue(order) ? (
                          <span className="marketing-orders-table__overdue">Muddat o‘tgan</span>
                        ) : null}
                      </div>
                    </td>
                  )}
                  <td onClick={event => event.stopPropagation()} className="text-center px-1">
                    <DocumentChipButton
                      onClick={() => setDocumentOrder(order)}
                      title={`${order.orderNumber} buyurtma hujjatini ko‘rish`}
                    />
                  </td>
                  {has('actions') && (
                    <td onClick={event => event.stopPropagation()} className="whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-1">
                        {canEditOrder?.(order) && onEdit && (
                          <button
                            type="button"
                            onClick={() => onEdit(order)}
                            className="users-action-btn users-action-btn--blue"
                            title="Tahrirlash"
                            aria-label="Tahrirlash"
                          >
                            <Pencil className="w-[15px] h-[15px]" strokeWidth={1.9} />
                          </button>
                        )}
                        {canDeleteOrder?.(order) && onDelete && (
                          <button
                            type="button"
                            onClick={() => onDelete(order)}
                            className="users-action-btn users-action-btn--rose"
                            title="O'chirish"
                            aria-label="O'chirish"
                          >
                            <Trash2 className="w-[15px] h-[15px]" strokeWidth={1.9} />
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
        {pageOrders.map(order => (
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

      <TablePagination
        total={orders.length}
        page={currentPage}
        pageSize={pageSize}
        totalPages={totalPages}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        unitLabel="buyurtma"
        pageSizeOptions={[10, 20, 50]}
        className="marketing-orders-pagination"
      />

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
