import { MapPin, CheckCircle2, AlertCircle } from 'lucide-react';
import { isOrderLoadingOverdue } from './OrderFulfillmentStatus';
import type { MonthlyOrder } from '../types';
import { getTableHeaders, isWagonPlanOrder } from '../constants/productTypes';
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

function getLineFulfilledTons(line: { wagonCount?: number | null; tonCount?: number | null; fulfilledWagonCount?: number | null; fulfilledNetWeight?: number | null }): number {
  if (line.fulfilledNetWeight != null && Number(line.fulfilledNetWeight) > 0) {
    return Math.round(Number(line.fulfilledNetWeight) * 100) / 100;
  }
  return 0;
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
  const isPolyethylene = order.productType?.toLowerCase().includes('polietilen')
    || order.productType?.toLowerCase().includes('полиэтилен');
  const wagonPlan = isWagonPlanOrder(order.lines);
  const baseHeaders = getTableHeaders(logisticsType, wagonPlan);
  // Yangi buyurtmalarda muddat ustuni har doim (ixtiyoriy); eski buyurtmalarda — polietilenda yoki sana bo‘lsa.
  const showDeadline = isPolyethylene || !wagonPlan || order.lines.some(l => Boolean(l.lastLoadingDate));
  const headers = showDeadline
    ? [...baseHeaders, 'Yuklash oxirgi sanasi']
    : baseHeaders;
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
                      <div className="font-semibold">{wagonPlan ? lineWagonCount(line) : (line.productGrade || '—')}</div>
                      {wagonPlan && (targetOrder.status === 'Active' || targetOrder.status === 'Completed') && (
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
                      <div className="font-semibold">{lineTonCount(line)}</div>
                      {(targetOrder.status === 'Active' || targetOrder.status === 'Completed') && (() => {
                        const linePlanT = lineTonCount(line);
                        const lineDoneT = getLineFulfilledTons(line);
                        const lineRemT = Math.max(0, Math.round((linePlanT - lineDoneT) * 100) / 100);
                        // Tonna ijrosi FAQAT haqiqiy yuklangan tonna rejaga yetganda yopilgan hisoblanadi.
                        // Vagonlar soni to'lgan bo'lsa ham, agar yuklangan og'irlik yetmasa, qoldiq tonna ko'rsatiladi.
                        const isTonDone = linePlanT > 0 && lineDoneT >= linePlanT;
                        const pctStr = linePlanT > 0 ? ` (${Math.min(100, Math.round((lineDoneT / linePlanT) * 100))}%)` : '';
                        return (
                          <div
                            className="text-[10px] whitespace-nowrap mt-0.5"
                            title={lineDoneT > 0 ? `Yuklandi: ${lineDoneT.toLocaleString('uz-UZ', { maximumFractionDigits: 1 })} t · Qoldiq: ${lineRemT.toLocaleString('uz-UZ', { maximumFractionDigits: 1 })} t${pctStr}` : `Qoldiq: ${lineRemT.toLocaleString('uz-UZ', { maximumFractionDigits: 1 })} t`}
                          >
                            {isTonDone ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓ 100% yopilgan</span>
                            ) : (
                              <span className="text-rose-600 dark:text-rose-400 font-semibold">
                                Qoldiq: {lineRemT.toLocaleString('uz-UZ', { maximumFractionDigits: 1 })} t
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    {wagonPlan ? (isFirstInTable && (
                      <td rowSpan={totalRows} className="order-sheet-contract order-sheet-center">
                        {order.contractNumber}
                      </td>
                    )) : (
                      <td className="order-sheet-contract order-sheet-center">{line.contractNumber || '—'}</td>
                    )}
                    <td className="order-sheet-destination">
                      <span className="order-sheet-destination__inner">
                        <MapPin className="order-sheet-destination__icon" strokeWidth={1.75} />
                        <span>{line.destinationStation || '—'}</span>
                      </span>
                    </td>
                    {showDeadline && (() => {
                      const lineDeadline = line.lastLoadingDate || (wagonPlan ? order.deadline : null);
                      const isOverdue = lineDeadline ? new Date(lineDeadline).getTime() < new Date().setHours(0, 0, 0, 0) : false;
                      return (
                        <td className="order-sheet-center px-2 py-1">
                          <div className="text-xs font-semibold tabular-nums">
                            {lineDeadline ? new Date(lineDeadline).toLocaleDateString('ru-RU') : '—'}
                          </div>
                          {isOverdue && (
                            <span className="mt-0.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-700 whitespace-nowrap">
                              ⛔ Srok o‘tgan (Taqiq)
                            </span>
                          )}
                        </td>
                      );
                    })()}
                  </tr>
                );
              })}
              <tr className="order-sheet-total">
                <td colSpan={2} className="order-sheet-total-label">JAMI</td>
                <td className="order-sheet-center order-sheet-qty order-sheet-qty--total">
                  {wagonPlan ? <div>{totals.wagonTotal}</div> : null}
                  {(targetOrder.status === 'Active' || targetOrder.status === 'Completed') && (
                    <div className="text-[10px] font-normal whitespace-nowrap mt-0.5 text-slate-500 dark:text-slate-400">
                      {wagonPlan
                        ? `Yuklandi: ${lines.reduce((s, l) => s + (l.fulfilledWagonCount ?? 0), 0)} · Qoldiq: ${Math.max(0, totals.wagonTotal - lines.reduce((s, l) => s + (l.fulfilledWagonCount ?? 0), 0))} ta`
                        : `Yuklandi: ${lines.reduce((s, l) => s + (l.fulfilledWagonCount ?? 0), 0)} vagon`}
                    </div>
                  )}
                </td>
                <td className="order-sheet-center order-sheet-qty order-sheet-qty--total">
                  <div>{totals.tonTotal}</div>
                  {(targetOrder.status === 'Active' || targetOrder.status === 'Completed') && (() => {
                    const totalDoneT = Math.round(lines.reduce((s, l) => s + getLineFulfilledTons(l), 0) * 100) / 100;
                    const totalRemT = Math.max(0, Math.round((totals.tonTotal - totalDoneT) * 100) / 100);
                    return (
                      <div className="text-[10px] font-normal whitespace-nowrap mt-0.5 text-slate-500 dark:text-slate-400">
                        Yuklandi: {totalDoneT.toLocaleString('uz-UZ', { maximumFractionDigits: 1 })} · Qoldiq: {totalRemT.toLocaleString('uz-UZ', { maximumFractionDigits: 1 })} t
                      </div>
                    );
                  })()}
                </td>
                <td className="order-sheet-contract order-sheet-center" />
                <td className="order-sheet-destination" />
                {showDeadline && <td className="order-sheet-center" />}
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
                      <div className="font-semibold">{wagonPlan ? lineWagonCount(line) : (line.productGrade || '—')}</div>
                      {wagonPlan && (targetOrder.status === 'Active' || targetOrder.status === 'Completed') && (
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
                      <div className="font-semibold">{lineTonCount(line)}</div>
                      {(targetOrder.status === 'Active' || targetOrder.status === 'Completed') && (() => {
                        const linePlanT = lineTonCount(line);
                        const lineDoneT = getLineFulfilledTons(line);
                        const lineRemT = Math.max(0, Math.round((linePlanT - lineDoneT) * 100) / 100);
                        // Tonna ijrosi FAQAT haqiqiy yuklangan tonna rejaga yetganda yopilgan hisoblanadi.
                        // Vagonlar soni to'lgan bo'lsa ham, agar yuklangan og'irlik yetmasa, qoldiq tonna ko'rsatiladi.
                        const isTonDone = linePlanT > 0 && lineDoneT >= linePlanT;
                        const pctStr = linePlanT > 0 ? ` (${Math.min(100, Math.round((lineDoneT / linePlanT) * 100))}%)` : '';
                        return (
                          <div
                            className="text-[10px] whitespace-nowrap mt-0.5"
                            title={lineDoneT > 0 ? `Yuklandi: ${lineDoneT.toLocaleString('uz-UZ', { maximumFractionDigits: 1 })} t · Qoldiq: ${lineRemT.toLocaleString('uz-UZ', { maximumFractionDigits: 1 })} t${pctStr}` : `Qoldiq: ${lineRemT.toLocaleString('uz-UZ', { maximumFractionDigits: 1 })} t`}
                          >
                            {isTonDone ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓ 100% yopilgan</span>
                            ) : (
                              <span className="text-rose-600 dark:text-rose-400 font-semibold">
                                Qoldiq: {lineRemT.toLocaleString('uz-UZ', { maximumFractionDigits: 1 })} t
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    {wagonPlan ? (isFirstInTable && (
                      <td rowSpan={totalRows} className="order-sheet-contract order-sheet-center">
                        {order.contractNumber}
                      </td>
                    )) : (
                      <td className="order-sheet-contract order-sheet-center">{line.contractNumber || '—'}</td>
                    )}
                    <td className="order-sheet-destination">
                      <span className="order-sheet-destination__inner">
                        <MapPin className="order-sheet-destination__icon" strokeWidth={1.75} />
                        <span>{line.destinationStation || '—'}</span>
                      </span>
                    </td>
                    {showDeadline && (() => {
                      const lineDeadline = line.lastLoadingDate || (wagonPlan ? order.deadline : null);
                      const isOverdue = lineDeadline ? new Date(lineDeadline).getTime() < new Date().setHours(0, 0, 0, 0) : false;
                      return (
                        <td className="order-sheet-center px-2 py-1">
                          <div className="text-xs font-semibold tabular-nums">
                            {lineDeadline ? new Date(lineDeadline).toLocaleDateString('ru-RU') : '—'}
                          </div>
                          {isOverdue && (
                            <span className="mt-0.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-700 whitespace-nowrap">
                              ⛔ Srok o‘tgan (Taqiq)
                            </span>
                          )}
                        </td>
                      );
                    })()}
                  </tr>
                );
              })}
              <tr className="order-sheet-total">
                <td colSpan={2} className="order-sheet-total-label">JAMI</td>
                <td className="order-sheet-center order-sheet-qty order-sheet-qty--total">
                  {wagonPlan ? <div>{totals.wagonTotal}</div> : null}
                  {(targetOrder.status === 'Active' || targetOrder.status === 'Completed') && (
                    <div className="text-[10px] font-normal whitespace-nowrap mt-0.5 text-slate-500 dark:text-slate-400">
                      {wagonPlan
                        ? `Yuklandi: ${lines.reduce((s, l) => s + (l.fulfilledWagonCount ?? 0), 0)} · Qoldiq: ${Math.max(0, totals.wagonTotal - lines.reduce((s, l) => s + (l.fulfilledWagonCount ?? 0), 0))} ta`
                        : `Yuklandi: ${lines.reduce((s, l) => s + (l.fulfilledWagonCount ?? 0), 0)} vagon`}
                    </div>
                  )}
                </td>
                <td className="order-sheet-center order-sheet-qty order-sheet-qty--total">
                  <div>{totals.tonTotal}</div>
                  {(targetOrder.status === 'Active' || targetOrder.status === 'Completed') && (() => {
                    const totalDoneT = Math.round(lines.reduce((s, l) => s + getLineFulfilledTons(l), 0) * 100) / 100;
                    const totalRemT = Math.max(0, Math.round((totals.tonTotal - totalDoneT) * 100) / 100);
                    return (
                      <div className="text-[10px] font-normal whitespace-nowrap mt-0.5 text-slate-500 dark:text-slate-400">
                        Yuklandi: {totalDoneT.toLocaleString('uz-UZ', { maximumFractionDigits: 1 })} · Qoldiq: {totalRemT.toLocaleString('uz-UZ', { maximumFractionDigits: 1 })} t
                      </div>
                    );
                  })()}
                </td>
                <td className="order-sheet-contract order-sheet-center" />
                <td className="order-sheet-destination" />
                {showDeadline && <td className="order-sheet-center" />}
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
            <div className="order-sheet-header__title-row flex items-center gap-2 flex-wrap">
              <span className="order-sheet-header__product">
                {order.productType}
                {order.productGrade ? (
                  <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300 border border-violet-200 dark:border-violet-700/50">
                    {order.productGrade}
                  </span>
                ) : null}
              </span>
              <OrderStatusBadge status={order.status} />
              {(() => {
                if (!isOrderLoadingOverdue(order)) return null;
                return (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-700 shadow-sm animate-pulse">
                    ⛔ Yuklash muddati o‘tgan (Taqiq)
                  </span>
                );
              })()}
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
