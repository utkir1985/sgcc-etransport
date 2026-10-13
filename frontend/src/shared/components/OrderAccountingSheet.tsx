import { useEffect, useMemo, useState } from 'react';
import { MONTH_NAMES_UZ } from '../utils/dates';
import { CheckCircle2, FileDown, MapPin, AlertCircle } from 'lucide-react';
import type { MonthlyOrder } from '../types';
import { getTableHeaders } from '../constants/productTypes';
import type { LogisticsType } from '../constants/logisticsTypes';
import { buildOrderTableRows } from '../../modules/marketing/utils/orderTable';
import {
  lineTonCount,
  lineWagonCount,
  summarizeOrderQuantities,
} from '../utils/orderQuantity';
import { OrderStatusBadge } from './OrderStatusBadge';
import { OrderSignatureStrip, OrderSheetTableFooter } from './OrderSignatureStrip';
import { OrderAttachmentsPanel } from './OrderAttachmentsPanel';
import { ProductTypeIcon } from './ProductTypeIcon';
import { OrderSheetMenu, type OrderSheetMenuItem } from './OrderSheetMenu';
import { downloadOrderPdf } from '../utils/orderSheetPrint';
import { ProductOrderDocument, isProductOrderPrintReady } from './ProductOrderDocument';
import { PRINT_LOCKED_TITLE } from '../utils/documentPrintGuard';
import {
  LINE_ACCOUNTING_STATUSES,
  normalizeLineAccountingStatus,
} from '../constants/lineAccountingStatuses';
import {
  canSubmitAccountingReview,
  buildReviewSelections,
  getPendingContractorGroups,
  initCheckedMap,
} from '../utils/orderReview';
import { ConfirmDialog } from './ConfirmDialog';
import { useRbacPermission } from '../hooks/useRbacPermission';

function getOrderSheetHeaderClass(header: string): string | undefined {
  if (header === 'Yuklash oxirgi sanasi') return 'order-sheet-date-col';
  if (header === 'Shartnoma raqami') return 'order-sheet-contract-col';
  if (header === 'Kelishish') return 'order-sheet-review-col';
  return undefined;
}

interface OrderAccountingSheetProps {
  order: MonthlyOrder;
  logisticsType: LogisticsType;
  onFinalizeReview: (selections: { contractor: string; checked: boolean }[]) => Promise<void>;
  menuItems?: OrderSheetMenuItem[];
}

export function OrderAccountingSheet({
  order,
  logisticsType,
  onFinalizeReview,
  menuItems = [],
}: OrderAccountingSheetProps) {
  const headers = [...getTableHeaders(logisticsType), 'Kelishish'];
  const groups = useMemo(() => getPendingContractorGroups(order), [order]);
  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>(() => initCheckedMap(groups));
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeConfirmOpen, setFinalizeConfirmOpen] = useState(false);

  useEffect(() => {
    setCheckedMap(initCheckedMap(getPendingContractorGroups(order)));
  }, [order.id]);

  const approvedLines = useMemo(
    () => order.lines.filter(l => normalizeLineAccountingStatus(l.accountingStatus) === LINE_ACCOUNTING_STATUSES.Approved),
    [order.lines],
  );

  const unapprovedLines = useMemo(
    () => order.lines.filter(l => normalizeLineAccountingStatus(l.accountingStatus) !== LINE_ACCOUNTING_STATUSES.Approved),
    [order.lines],
  );

  const isSplitView = approvedLines.length > 0 && unapprovedLines.length > 0;

  const toggleContractor = (contractor: string, checked: boolean) => {
    setCheckedMap(prev => ({ ...prev, [contractor]: checked }));
  };

  const handleFinalize = async () => {
    setFinalizing(true);
    try {
      await onFinalizeReview(buildReviewSelections(groups, checkedMap));
      setFinalizeConfirmOpen(false);
    } finally {
      setFinalizing(false);
    }
  };

  const { canAccountingFinalize, canAccountingSave } = useRbacPermission();
  const canFinalize = canAccountingFinalize && canSubmitAccountingReview(groups);

  const renderTableBlock = (
    lines: typeof order.lines,
    tableTitle: string,
    badgeVariant: 'approved' | 'pending',
    showFooterAction = false,
  ) => {
    const displayRows = buildOrderTableRows(lines);
    const quantityTotals = summarizeOrderQuantities(lines);

    return (
      <div className={`order-sheet-table-box mb-4 overflow-hidden rounded-2xl border ${
        badgeVariant === 'approved'
          ? 'border-emerald-200 dark:border-emerald-800/60 shadow-sm'
          : 'border-amber-200 dark:border-amber-800/60 shadow-sm'
      }`}>
        <div className={`px-4 py-2.5 flex items-center justify-between border-b ${
          badgeVariant === 'approved'
            ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200'
            : 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200'
        }`}>
          <div className="flex items-center gap-2">
            {badgeVariant === 'approved' ? (
              <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertCircle className="w-4.5 h-4.5 text-amber-600 dark:text-amber-400" />
            )}
            <h4 className="font-extrabold text-sm">{tableTitle}</h4>
          </div>
          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
            badgeVariant === 'approved'
              ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200'
              : 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200'
          }`}>
            {lines.length} ta kontragent
          </span>
        </div>

        <div className="order-sheet-scroll">
          <table className="order-sheet-table">
            <thead>
              <tr>
                {headers.map(h => (
                  <th key={h} className={getOrderSheetHeaderClass(h)}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map(({ line, groupNumber, isFirstInGroup, isFirstInTable, groupRowSpan, totalRows }) => {
                const lineStatus = normalizeLineAccountingStatus(line.accountingStatus);
                const isApproved = lineStatus === LINE_ACCOUNTING_STATUSES.Approved;
                const isChecked = checkedMap[line.contractor] ?? false;

                return (
                  <tr key={line.id}>
                    {isFirstInGroup && (
                      <td rowSpan={groupRowSpan} className="order-sheet-num">{groupNumber}</td>
                    )}
                    {isFirstInGroup && (
                      <td rowSpan={groupRowSpan} className="order-sheet-contractor">{line.contractor}</td>
                    )}
                    <td className="order-sheet-center order-sheet-qty">
                      {lineWagonCount(line)}
                    </td>
                    <td className="order-sheet-center order-sheet-qty">
                      {lineTonCount(line)}
                    </td>
                    {isFirstInTable && (
                      <td rowSpan={totalRows} className="order-sheet-contract order-sheet-center">
                        {order.contractNumber}
                      </td>
                    )}
                    <td className="order-sheet-destination">
                      <span className="order-sheet-destination__inner">
                        <MapPin className="order-sheet-destination__icon" strokeWidth={1.75} />
                        <span>{line.destinationStation}</span>
                      </span>
                    </td>
                    {isFirstInGroup && (
                      <td rowSpan={groupRowSpan} className="order-sheet-review-col">
                        {isApproved ? (
                          <span className="order-sheet-review-done order-sheet-review-done--approved font-bold">
                            ✓ Kelishilgan
                          </span>
                        ) : (
                          <div className="flex items-center justify-center gap-2 whitespace-nowrap py-1">
                            {lineStatus === LINE_ACCOUNTING_STATUSES.Rejected && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/80 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-700 shrink-0">
                                ⚠️ Hujjat kutilmoqda
                              </span>
                            )}
                            <label className={`order-sheet-check flex items-center gap-1.5 shrink-0 ${canAccountingSave || canAccountingFinalize ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                disabled={!canAccountingSave && !canAccountingFinalize}
                                onChange={e => toggleContractor(line.contractor, e.target.checked)}
                              />
                              <span className="font-bold text-xs text-blue-700 dark:text-blue-300">
                                {lineStatus === LINE_ACCOUNTING_STATUSES.Rejected ? 'Qaytadan kelishish' : 'Kelishish'}
                              </span>
                            </label>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              <tr className="order-sheet-total">
                <td colSpan={2} className="order-sheet-total-label">JAMI</td>
                <td className="order-sheet-center order-sheet-qty order-sheet-qty--total">{quantityTotals.wagonTotal}</td>
                <td className="order-sheet-center order-sheet-qty order-sheet-qty--total">{quantityTotals.tonTotal}</td>
                <td colSpan={3} />
              </tr>
            </tbody>
          </table>
        </div>

        {showFooterAction && (
          <OrderSheetTableFooter>
            <button
              type="button"
              onClick={() => setFinalizeConfirmOpen(true)}
              disabled={finalizing || !canFinalize}
              className="btn-primary order-sheet-submit-btn"
            >
              <CheckCircle2 className="w-4 h-4" />
              {finalizing ? 'Kelishilmoqda...' : 'Buyurtmani kelishish'}
            </button>
          </OrderSheetTableFooter>
        )}
      </div>
    );
  };

  return (
    <div className="order-sheet-card" data-order-id={order.id}>
      <div className="order-sheet-header">
        <div className="order-sheet-header__main">
          <ProductTypeIcon productType={order.productType} className="order-sheet-header__icon" />
          <div className="order-sheet-header__text">
            <div className="order-sheet-header__title-row flex items-center gap-2 flex-wrap">
              <span className="order-sheet-header__product">{order.productType}</span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-300 dark:border-blue-700 shadow-sm">
                📅 {order.year ? `${order.year}-yil ` : ''}{MONTH_NAMES_UZ[order.month - 1] || ''} oyi buyurtmasi
              </span>
              <OrderStatusBadge status={order.status} />
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="order-sheet-header__code">{order.orderNumber}</span>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                · {order.year ? `${order.year}-yil ` : ''}{MONTH_NAMES_UZ[order.month - 1] || ''} oyi buyurtmasi
              </span>
            </div>
          </div>
        </div>

        <div className="order-sheet-header__aside">
          <OrderAttachmentsPanel orderId={order.id} attachments={order.attachments} />
          <OrderSheetMenu items={menuItems.length > 0 ? menuItems : [{
            key: 'pdf', label: 'PDF yuklash', icon: FileDown,
            disabled: !isProductOrderPrintReady(order),
            title: isProductOrderPrintReady(order) ? 'PDF yuklash' : PRINT_LOCKED_TITLE,
            onClick: () => downloadOrderPdf(order.id),
          }]} />
        </div>
      </div>

      {/* Katta markazlashtirilgan oy sarlavhasi */}
      <div className="order-sheet-month-banner my-2.5 mx-4 sm:mx-6 py-2.5 px-6 rounded-2xl bg-gradient-to-r from-blue-50 via-sky-50 to-indigo-50 dark:from-slate-800/90 dark:via-blue-950/60 dark:to-slate-800/90 border border-blue-200 dark:border-blue-800/80 shadow-sm flex items-center justify-center text-center">
        <div className="inline-flex items-center justify-center gap-2.5 flex-wrap">
          <span className="text-xl sm:text-2xl select-none">📅</span>
          <h2 className="text-base sm:text-lg md:text-xl font-black tracking-wider text-blue-950 dark:text-blue-100 uppercase">
            {order.year ? `${order.year}-YIL ` : ''}{MONTH_NAMES_UZ[order.month - 1] ? `${MONTH_NAMES_UZ[order.month - 1].toUpperCase()} ` : ''}OYI BUYURTMASI
          </h2>
        </div>
      </div>

      <div className="order-sheet-body">
        {isSplitView ? (
          <div className="space-y-6">
            <div>
              {renderTableBlock(approvedLines, 'Kelishilgan kontragentlar', 'approved', false)}
              <OrderSignatureStrip order={order} visibility="accounting" />
            </div>
            <div>
              {renderTableBlock(unapprovedLines, 'Kelishilmagan kontragentlar — Shartnoma hujjatlari kutilmoqda', 'pending', true)}
            </div>
          </div>
        ) : approvedLines.length > 0 ? (
          <div>
            {renderTableBlock(approvedLines, 'Barcha kelishilgan kontragentlar', 'approved', false)}
            <OrderSignatureStrip order={order} visibility="accounting" />
          </div>
        ) : (
          <div>
            {renderTableBlock(order.lines, 'Barcha kontragentlar', 'pending', true)}
            <OrderSignatureStrip order={order} visibility="accounting" />
          </div>
        )}
      </div>
      <ProductOrderDocument order={order} logisticsType={logisticsType} />

      <ConfirmDialog
        open={finalizeConfirmOpen}
        title="Buyurtmani kelishish"
        message={`${order.orderNumber} buyurtmasini belgilangan kontragentlar bo‘yicha kelishilgan deb belgilaysizmi?`}
        confirmLabel="Ha, kelishaman"
        cancelLabel="Bekor qilish"
        loading={finalizing}
        onConfirm={() => { void handleFinalize(); }}
        onCancel={() => {
          if (finalizing) return;
          setFinalizeConfirmOpen(false);
        }}
      />
    </div>
  );
}
