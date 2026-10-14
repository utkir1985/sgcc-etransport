import { MapPin, CheckCircle2, AlertCircle } from 'lucide-react';
import { isOrderLoadingOverdue } from './OrderFulfillmentStatus';
import type { MonthlyOrder } from '../types';
import { getTableHeaders, isWagonPlanOrder } from '../constants/productTypes';
import type { LogisticsType } from '../constants/logisticsTypes';
import { buildOrderTableRows } from '../../modules/marketing/utils/orderTable';
import {
  formatTons,
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
  if (header === 'Shartnoma raqami' || header === 'Buyurtma №') return 'order-sheet-contract-col';
  return undefined;
}

function getLineFulfilledTons(line: { wagonCount?: number | null; tonCount?: number | null; fulfilledWagonCount?: number | null; fulfilledNetWeight?: number | null }): number {
  if (line.fulfilledNetWeight != null && Number(line.fulfilledNetWeight) > 0) {
    return Math.round(Number(line.fulfilledNetWeight) * 100) / 100;
  }
  return 0;
}

/**
 * Stansiya katagi: qatorda stansiya bo‘lmasa — yuk xatlarida tanlangan stansiyalar
 * kesimi (vagon soni va og‘irlik); hali yuk xati bo‘lmasa — «Yuk xatida tanlanadi».
 */
function LineDestination({ line, showShipped }: { line: MonthlyOrder['lines'][number]; showShipped: boolean }) {
  const fixedStation = line.destinationStation?.trim();
  // Qatorda stansiya belgilangan bo‘lsa — barcha vagonlar o‘sha stansiyaga ketgan (qator yig‘indisidan);
  // aks holda yuk xatlarida tanlangan stansiyalar kesimi (serverda hisoblanadi).
  const shipments = !showShipped ? [] : fixedStation
    ? ((line.fulfilledWagonCount ?? 0) > 0
      ? [{ station: fixedStation, wagons: line.fulfilledWagonCount ?? 0, netTons: Number(line.fulfilledNetWeight ?? 0) }]
      : [])
    : (line.stationShipments ?? []);
  if (shipments.length === 0) {
    return (
      <span className="order-sheet-destination__inner">
        <MapPin className="order-sheet-destination__icon" strokeWidth={1.75} />
        {fixedStation
          ? <span>{fixedStation}</span>
          : <span className="text-slate-400 dark:text-slate-500 italic">Yuk xatida tanlanadi</span>}
      </span>
    );
  }
  return (
    <ul className="order-sheet-station-shipments">
      {shipments.map(item => (
        <li key={item.station || '—'}>
          <MapPin className="order-sheet-destination__icon" strokeWidth={1.75} />
          <span className="order-sheet-station-shipments__name">{item.station || '—'}</span>
          <span className="order-sheet-station-shipments__meta">
            {item.wagons} ta{item.netTons > 0 ? ` · ${formatTons(item.netTons)} t` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
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
                        // Vagonlar soni yuk xatlaridan shakllanadi — qoldiq vagon ko‘rsatilmaydi
                        <div className="text-[11px] whitespace-nowrap mt-0.5 text-slate-500 dark:text-slate-400 font-semibold">
                          Jo‘natildi: {line.fulfilledWagonCount ?? 0} ta
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
                            className="text-[11px] whitespace-nowrap mt-0.5"
                            title={`Jo‘natildi: ${formatTons(lineDoneT)} t · Qoldiq: ${formatTons(lineRemT)} t${pctStr}`}
                          >
                            {isTonDone ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                {wagonPlan ? '✓ To‘liq jo‘natildi' : '✓ Yopildi'}
                              </span>
                            ) : wagonPlan ? (
                              <span className="font-semibold">
                                <span className="text-emerald-600 dark:text-emerald-400">Jo‘natildi: {formatTons(lineDoneT)} t</span>
                                <span className="text-slate-400"> · </span>
                                <span className="text-amber-600 dark:text-amber-400">Qoldiq: {formatTons(lineRemT)} t</span>
                              </span>
                            ) : (
                              // Yangi buyurtma: jo‘natilgan miqdor stansiya ustunida — bu yerda faqat qoldiq
                              <span className="font-semibold text-amber-600 dark:text-amber-400">Qoldiq: {formatTons(lineRemT)} t</span>
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
                      <>
                        <td className="order-sheet-contract order-sheet-center">{line.customerOrderNumber || '—'}</td>
                        <td className="order-sheet-contract order-sheet-center">{line.contractNumber || '—'}</td>
                      </>
                    )}
                    <td className="order-sheet-destination">
                      <LineDestination line={line} showShipped={!wagonPlan} />
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
              {(wagonPlan || lines.length > 1) && (
              <tr className="order-sheet-total">
                <td colSpan={2} className="order-sheet-total-label">JAMI</td>
                <td className="order-sheet-center order-sheet-qty order-sheet-qty--total">
                  {wagonPlan ? <div>{totals.wagonTotal}</div> : null}
                  {wagonPlan && (targetOrder.status === 'Active' || targetOrder.status === 'Completed') && (
                    <div className="text-[10px] font-normal whitespace-nowrap mt-0.5 text-slate-500 dark:text-slate-400">
                      {wagonPlan
                        ? `Jo‘natildi: ${lines.reduce((s, l) => s + (l.fulfilledWagonCount ?? 0), 0)} ta`
                        : `Jo‘natildi: ${lines.reduce((s, l) => s + (l.fulfilledWagonCount ?? 0), 0)} ta`}
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
                        {wagonPlan ? `Jo‘natildi: ${formatTons(totalDoneT)} t · ` : ''}Qoldiq: {formatTons(totalRemT)} t
                      </div>
                    );
                  })()}
                </td>
                <td className="order-sheet-contract order-sheet-center" />
                {!wagonPlan && <td className="order-sheet-contract order-sheet-center" />}
                <td className="order-sheet-destination">
                  {!wagonPlan && (targetOrder.status === 'Active' || targetOrder.status === 'Completed') ? (
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      Jo‘natildi: {lines.reduce((s, l) => s + (l.fulfilledWagonCount ?? 0), 0)} ta · {formatTons(lines.reduce((s, l) => s + getLineFulfilledTons(l), 0))} t
                    </span>
                  ) : null}
                </td>
                {showDeadline && <td className="order-sheet-center" />}
              </tr>
              )}
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
                        // Vagonlar soni yuk xatlaridan shakllanadi — qoldiq vagon ko‘rsatilmaydi
                        <div className="text-[11px] whitespace-nowrap mt-0.5 text-slate-500 dark:text-slate-400 font-semibold">
                          Jo‘natildi: {line.fulfilledWagonCount ?? 0} ta
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
                            className="text-[11px] whitespace-nowrap mt-0.5"
                            title={`Jo‘natildi: ${formatTons(lineDoneT)} t · Qoldiq: ${formatTons(lineRemT)} t${pctStr}`}
                          >
                            {isTonDone ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                {wagonPlan ? '✓ To‘liq jo‘natildi' : '✓ Yopildi'}
                              </span>
                            ) : wagonPlan ? (
                              <span className="font-semibold">
                                <span className="text-emerald-600 dark:text-emerald-400">Jo‘natildi: {formatTons(lineDoneT)} t</span>
                                <span className="text-slate-400"> · </span>
                                <span className="text-amber-600 dark:text-amber-400">Qoldiq: {formatTons(lineRemT)} t</span>
                              </span>
                            ) : (
                              // Yangi buyurtma: jo‘natilgan miqdor stansiya ustunida — bu yerda faqat qoldiq
                              <span className="font-semibold text-amber-600 dark:text-amber-400">Qoldiq: {formatTons(lineRemT)} t</span>
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
                      <>
                        <td className="order-sheet-contract order-sheet-center">{line.customerOrderNumber || '—'}</td>
                        <td className="order-sheet-contract order-sheet-center">{line.contractNumber || '—'}</td>
                      </>
                    )}
                    <td className="order-sheet-destination">
                      <LineDestination line={line} showShipped={!wagonPlan} />
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
              {(wagonPlan || lines.length > 1) && (
              <tr className="order-sheet-total">
                <td colSpan={2} className="order-sheet-total-label">JAMI</td>
                <td className="order-sheet-center order-sheet-qty order-sheet-qty--total">
                  {wagonPlan ? <div>{totals.wagonTotal}</div> : null}
                  {wagonPlan && (targetOrder.status === 'Active' || targetOrder.status === 'Completed') && (
                    <div className="text-[10px] font-normal whitespace-nowrap mt-0.5 text-slate-500 dark:text-slate-400">
                      {wagonPlan
                        ? `Jo‘natildi: ${lines.reduce((s, l) => s + (l.fulfilledWagonCount ?? 0), 0)} ta`
                        : `Jo‘natildi: ${lines.reduce((s, l) => s + (l.fulfilledWagonCount ?? 0), 0)} ta`}
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
                        {wagonPlan ? `Jo‘natildi: ${formatTons(totalDoneT)} t · ` : ''}Qoldiq: {formatTons(totalRemT)} t
                      </div>
                    );
                  })()}
                </td>
                <td className="order-sheet-contract order-sheet-center" />
                {!wagonPlan && <td className="order-sheet-contract order-sheet-center" />}
                <td className="order-sheet-destination">
                  {!wagonPlan && (targetOrder.status === 'Active' || targetOrder.status === 'Completed') ? (
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      Jo‘natildi: {lines.reduce((s, l) => s + (l.fulfilledWagonCount ?? 0), 0)} ta · {formatTons(lines.reduce((s, l) => s + getLineFulfilledTons(l), 0))} t
                    </span>
                  ) : null}
                </td>
                {showDeadline && <td className="order-sheet-center" />}
              </tr>
              )}
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
