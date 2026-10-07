import { FileDown, Package } from 'lucide-react';
import type { ReactNode } from 'react';
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
import { OrderSheetMenu } from './OrderSheetMenu';
import { downloadOrderPdf } from '../utils/orderSheetPrint';
import { ProductOrderDocument, isProductOrderPrintReady } from './ProductOrderDocument';
import { PRINT_LOCKED_TITLE } from '../utils/documentPrintGuard';
import {
  LINE_ACCOUNTING_STATUSES,
  normalizeLineAccountingStatus,
} from '../constants/lineAccountingStatuses';

function getOrderSheetHeaderClass(header: string): string | undefined {
  if (header === 'Yuklash oxirgi sanasi') return 'order-sheet-date-col';
  if (header === 'Shartnoma raqami') return 'order-sheet-contract-col';
  return undefined;
}

interface OrderDispatchSheetProps {
  order: MonthlyOrder;
  logisticsType: LogisticsType;
  metaExtra?: ReactNode;
  signatureFooterActions?: ReactNode;
}

export function OrderDispatchSheet({
  order,
  logisticsType,
  metaExtra,
  signatureFooterActions,
}: OrderDispatchSheetProps) {
  const headers = getTableHeaders(logisticsType);
  const dispatchLines = order.lines.filter(line => {
    const status = normalizeLineAccountingStatus(line.accountingStatus);
    return status === LINE_ACCOUNTING_STATUSES.PendingDispatch
      || status === LINE_ACCOUNTING_STATUSES.PendingDeputy;
  });
  const displayRows = buildOrderTableRows(dispatchLines.length > 0 ? dispatchLines : order.lines);
  const quantityTotals = summarizeOrderQuantities(
    dispatchLines.length > 0 ? dispatchLines : order.lines,
  );

  return (
    <div className="order-sheet-card" data-order-id={order.id}>
      <div className="order-sheet-meta">
        <div className="order-sheet-meta-info">
          <Package className="order-sheet-meta-icon" strokeWidth={1.75} />
          <span className="order-sheet-meta-product">{order.productType}</span>
          <span className="order-sheet-meta-sep" aria-hidden="true">·</span>
          <span className="order-sheet-meta-tag">{order.orderNumber}</span>
          <OrderStatusBadge status={order.status} />
        </div>
        <div className="order-sheet-meta-actions">
          {metaExtra}
          <OrderAttachmentsPanel orderId={order.id} attachments={order.attachments} />
          <OrderSheetMenu items={[{
            key: 'pdf', label: 'PDF yuklash', icon: FileDown,
            disabled: !isProductOrderPrintReady(order),
            title: isProductOrderPrintReady(order) ? 'PDF yuklash' : PRINT_LOCKED_TITLE,
            onClick: () => downloadOrderPdf(order.id),
          }]} />
        </div>
      </div>
      <div className="order-sheet-body">
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
              {displayRows.map(({ line, groupNumber, isFirstInGroup, isFirstInTable, groupRowSpan, totalRows }) => (
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
                  <td className="order-sheet-destination">{line.destinationStation}</td>
                </tr>
              ))}
              <tr className="order-sheet-total">
                <td colSpan={2} className="order-sheet-total-label">JAMI</td>
                <td className="order-sheet-center order-sheet-qty order-sheet-qty--total">{quantityTotals.wagonTotal}</td>
                <td className="order-sheet-center order-sheet-qty order-sheet-qty--total">{quantityTotals.tonTotal}</td>
                <td className="order-sheet-contract order-sheet-center" />
                <td className="order-sheet-destination" />
              </tr>
            </tbody>
          </table>
        </div>
        {signatureFooterActions && (
          <OrderSheetTableFooter>{signatureFooterActions}</OrderSheetTableFooter>
        )}
        </div>

        <OrderSignatureStrip order={order} visibility="dispatch" />
      </div>
      <ProductOrderDocument order={order} logisticsType={logisticsType} />
    </div>
  );
}
