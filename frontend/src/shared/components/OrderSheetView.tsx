import { MapPin, CheckCircle2, AlertCircle } from 'lucide-react';
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
import { ProductOrderDocument } from './ProductOrderDocument';
import {
  LINE_ACCOUNTING_STATUSES,
  normalizeLineAccountingStatus,
} from '../constants/lineAccountingStatuses';
import type { ReactNode } from 'react';

function getOrderSheetHeaderClass(header: string): string | undefined {
  if (header === 'Yuklash oxirgi sanasi') return 'order-sheet-date-col';
  if (header === 'Shartnoma raqami') return 'order-sheet-contract-col';
  return undefined;
}

interface OrderSheetViewProps {
  order: MonthlyOrder;
  logisticsType: LogisticsType;
  menuItems?: OrderSheetMenuItem[];
  signatureOrder?: MonthlyOrder;
  signatureFooterActions?: ReactNode;
}

export function OrderSheetView({
  order,
  logisticsType,
  menuItems = [],
  signatureOrder,
  signatureFooterActions,
}: OrderSheetViewProps) {
  const headers = getTableHeaders(logisticsType);
  const targetOrder = signatureOrder ?? order;

  const approvedLines = targetOrder.lines.filter(l =>
    normalizeLineAccountingStatus(l.accountingStatus) === LINE_ACCOUNTING_STATUSES.Approved ||
    normalizeLineAccountingStatus(l.accountingStatus) === LINE_ACCOUNTING_STATUSES.PendingDeputy ||
    normalizeLineAccountingStatus(l.accountingStatus) === LINE_ACCOUNTING_STATUSES.PendingDispatch ||
    normalizeLineAccountingStatus(l.accountingStatus) === LINE_ACCOUNTING_STATUSES.DispatchApproved
  );

  const unapprovedLines = targetOrder.lines.filter(l =>
    normalizeLineAccountingStatus(l.accountingStatus) !== LINE_ACCOUNTING_STATUSES.Approved &&
    normalizeLineAccountingStatus(l.accountingStatus) !== LINE_ACCOUNTING_STATUSES.PendingDeputy &&
    normalizeLineAccountingStatus(l.accountingStatus) !== LINE_ACCOUNTING_STATUSES.PendingDispatch &&
    normalizeLineAccountingStatus(l.accountingStatus) !== LINE_ACCOUNTING_STATUSES.DispatchApproved
  );

  const isSplitView = approvedLines.length > 0 && unapprovedLines.length > 0;

  const renderPlainTable = (lines: typeof order.lines, showFooter = false) => {
    const displayRows = buildOrderTableRows(lines);
    const totals = summarizeOrderQuantities(lines);

    return (
      <div className="order-sheet-table-box">
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
                return (
                  <tr
                    key={line.id}
                    className={lineStatus === LINE_ACCOUNTING_STATUSES.Rejected ? 'order-sheet-row--rejected' : undefined}
                  >
                    {isFirstInGroup && (
                      <td rowSpan={groupRowSpan} className="order-sheet-num">{groupNumber}</td>
                    )}
                    {isFirstInGroup && (
                      <td rowSpan={groupRowSpan} className="order-sheet-contractor">
                        {line.contractor}
                      </td>
                    )}
                    <td className="order-sheet-center order-sheet-qty">
                      <div className="font-semibold">{lineWagonCount(line)}</div>
                      {(targetOrder.status === 'Active' || targetOrder.status === 'Completed') && (
                        <div className="text-[10px] whitespace-nowrap mt-0.5">
                          {line.wagonCount > 0 && (line.fulfilledWagonCount ?? 0) >= line.wagonCount ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓ 100% yopilgan</span>
                          ) : (
                            <span className="text-rose-600 dark:text-rose-400 font-semibold">
                              Qoldiq: {Math.max(0, line.wagonCount - (line.fulfilledWagonCount ?? 0))} ta
                            </span>
                          )}
                        </div>
                      )}
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
                  </tr>
                );
              })}
              <tr className="order-sheet-total">
                <td colSpan={2} className="order-sheet-total-label">JAMI</td>
                <td className="order-sheet-center order-sheet-qty order-sheet-qty--total">
                  <div>{totals.wagonTotal}</div>
                  {(targetOrder.status === 'Active' || targetOrder.status === 'Completed') && (
                    <div className="text-[10px] font-normal whitespace-nowrap mt-0.5 text-slate-500 dark:text-slate-400">
                      Yuklandi: {lines.reduce((s, l) => s + (l.fulfilledWagonCount ?? 0), 0)} · Qoldiq: {Math.max(0, totals.wagonTotal - lines.reduce((s, l) => s + (l.fulfilledWagonCount ?? 0), 0))} ta
                    </div>
                  )}
                </td>
                <td className="order-sheet-center order-sheet-qty order-sheet-qty--total">{totals.tonTotal}</td>
                <td className="order-sheet-contract order-sheet-center" />
                <td className="order-sheet-destination" />
              </tr>
            </tbody>
          </table>
        </div>
        {showFooter && signatureFooterActions ? (
          <OrderSheetTableFooter>{signatureFooterActions}</OrderSheetTableFooter>
        ) : null}
      </div>
    );
  };

  const renderSplitTableBlock = (
    lines: typeof order.lines,
    tableTitle: string,
    badgeVariant: 'approved' | 'pending',
    showFooterAction = false,
  ) => {
    const displayRows = buildOrderTableRows(lines);
    const totals = summarizeOrderQuantities(lines);

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
                return (
                  <tr
                    key={line.id}
                    className={lineStatus === LINE_ACCOUNTING_STATUSES.Rejected ? 'order-sheet-row--rejected' : undefined}
                  >
                    {isFirstInGroup && (
                      <td rowSpan={groupRowSpan} className="order-sheet-num">{groupNumber}</td>
                    )}
                    {isFirstInGroup && (
                      <td rowSpan={groupRowSpan} className="order-sheet-contractor">
                        {line.contractor}
                      </td>
                    )}
                    <td className="order-sheet-center order-sheet-qty">
                      <div className="font-semibold">{lineWagonCount(line)}</div>
                      {(targetOrder.status === 'Active' || targetOrder.status === 'Completed') && (
                        <div className="text-[10px] whitespace-nowrap mt-0.5">
                          {line.wagonCount > 0 && (line.fulfilledWagonCount ?? 0) >= line.wagonCount ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓ 100% yopilgan</span>
                          ) : (
                            <span className="text-rose-600 dark:text-rose-400 font-semibold">
                              Qoldiq: {Math.max(0, line.wagonCount - (line.fulfilledWagonCount ?? 0))} ta
                            </span>
                          )}
                        </div>
                      )}
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
                  </tr>
                );
              })}
              <tr className="order-sheet-total">
                <td colSpan={2} className="order-sheet-total-label">JAMI</td>
                <td className="order-sheet-center order-sheet-qty order-sheet-qty--total">
                  <div>{totals.wagonTotal}</div>
                  {(targetOrder.status === 'Active' || targetOrder.status === 'Completed') && (
                    <div className="text-[10px] font-normal whitespace-nowrap mt-0.5 text-slate-500 dark:text-slate-400">
                      Yuklandi: {lines.reduce((s, l) => s + (l.fulfilledWagonCount ?? 0), 0)} · Qoldiq: {Math.max(0, totals.wagonTotal - lines.reduce((s, l) => s + (l.fulfilledWagonCount ?? 0), 0))} ta
                    </div>
                  )}
                </td>
                <td className="order-sheet-center order-sheet-qty order-sheet-qty--total">{totals.tonTotal}</td>
                <td className="order-sheet-contract order-sheet-center" />
                <td className="order-sheet-destination" />
              </tr>
            </tbody>
          </table>
        </div>
        {showFooterAction && signatureFooterActions && (
          <OrderSheetTableFooter>{signatureFooterActions}</OrderSheetTableFooter>
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
            <div className="order-sheet-header__title-row">
              <span className="order-sheet-header__product">{order.productType}</span>
              <OrderStatusBadge status={order.status} />
            </div>
            <span className="order-sheet-header__code">{order.orderNumber}</span>
          </div>
        </div>

        <div className="order-sheet-header__aside">
          <OrderAttachmentsPanel
            orderId={targetOrder.id}
            attachments={targetOrder.attachments}
          />
          <OrderSheetMenu items={menuItems} />
        </div>
      </div>

      <div className="order-sheet-body">
        {isSplitView ? (
          <div className="space-y-6">
            <div>
              {renderSplitTableBlock(approvedLines, 'Kelishilgan kontragentlar', 'approved', true)}
              <OrderSignatureStrip
                order={targetOrder}
                visibility="marketing"
              />
            </div>
            <div>
              {renderSplitTableBlock(unapprovedLines, 'Kelishilmagan kontragentlar — Shartnoma hujjatlari kutilmoqda', 'pending', false)}
            </div>
          </div>
        ) : (
          <>
            {renderPlainTable(approvedLines.length > 0 ? approvedLines : order.lines, true)}
            <OrderSignatureStrip
              order={targetOrder}
              visibility="marketing"
            />
          </>
        )}
      </div>
      <ProductOrderDocument order={order} logisticsType={logisticsType} />
    </div>
  );
}
