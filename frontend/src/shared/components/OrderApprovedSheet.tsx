import { FileDown, MapPin } from 'lucide-react';
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
import { OrderSignatureStrip } from './OrderSignatureStrip';
import { OrderAttachmentsPanel } from './OrderAttachmentsPanel';
import { ProductTypeIcon } from './ProductTypeIcon';
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

interface OrderApprovedSheetProps {
  order: MonthlyOrder;
  logisticsType: LogisticsType;
}

export function OrderApprovedSheet({
  order,
  logisticsType,
}: OrderApprovedSheetProps) {
  const headers = getTableHeaders(logisticsType);
  const approvedLines = order.lines.filter(line => {
    const status = normalizeLineAccountingStatus(line.accountingStatus);
    return status === LINE_ACCOUNTING_STATUSES.Approved
      || status === LINE_ACCOUNTING_STATUSES.PendingDeputy
      || status === LINE_ACCOUNTING_STATUSES.PendingDispatch
      || status === LINE_ACCOUNTING_STATUSES.DispatchApproved;
  });
  const displayRows = buildOrderTableRows(approvedLines);
  const quantityTotals = summarizeOrderQuantities(approvedLines);

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
                    <td className="order-sheet-destination">
                      <span className="order-sheet-destination__inner">
                        <MapPin className="order-sheet-destination__icon" strokeWidth={1.75} />
                        <span>{line.destinationStation}</span>
                      </span>
                    </td>
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
        </div>

        <OrderSignatureStrip order={order} visibility="accounting" />
      </div>
      <ProductOrderDocument order={order} logisticsType={logisticsType} />
    </div>
  );
}
