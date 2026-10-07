import {
  type ProductCatalogEntry,
} from '../constants/productTypes';
import type { LogisticsType } from '../constants/logisticsTypes';
import type { MonthlyOrder } from '../types';
import { matchesPeriodRange } from './dates';
import { isOneCOrder } from './oneCSources';

export interface OrderApprovalHubItem extends ProductCatalogEntry {
  pendingCount: number;
  approvedCount: number;
  totalCount: number;
}

const ACCOUNTING_APPROVED_STATUSES = new Set([
  'ReadyForDispatch',
  'PendingDeputyDirector',
  'PendingDispatching',
  'Active',
]);

export function buildAccountingHubItems(
  orders: MonthlyOrder[],
  logisticsType: LogisticsType,
  productEntries: ProductCatalogEntry[],
): OrderApprovalHubItem[] {
  return productEntries
    .map(entry => {
      const productOrders = orders.filter(order =>
        order.logisticsType === logisticsType && order.productType === entry.productType);

      return {
        ...entry,
        pendingCount: productOrders.filter(order => order.status === 'PendingAccounting').length,
        approvedCount: productOrders.filter(order =>
          ACCOUNTING_APPROVED_STATUSES.has(order.status) && !!order.accountingApproverName).length,
        totalCount: 0,
      };
    })
    .map(item => ({
      ...item,
      totalCount: item.pendingCount + item.approvedCount,
    }))
    .sort((a, b) => {
      if (a.pendingCount !== b.pendingCount) return b.pendingCount - a.pendingCount;
      if (a.approvedCount !== b.approvedCount) return b.approvedCount - a.approvedCount;
      return a.title.localeCompare(b.title, 'uz');
    });
}

export function buildDispatchHubItems(
  orders: MonthlyOrder[],
  logisticsType: LogisticsType,
  productEntries: ProductCatalogEntry[],
): OrderApprovalHubItem[] {
  return productEntries
    .map(entry => {
      const productOrders = orders.filter(order =>
        order.logisticsType === logisticsType && order.productType === entry.productType);

      return {
        ...entry,
        pendingCount: productOrders.filter(order => order.status === 'PendingDispatching').length,
        approvedCount: productOrders.filter(order =>
          order.status === 'Active' && !!order.dispatchApproverName).length,
        totalCount: 0,
      };
    })
    .map(item => ({
      ...item,
      totalCount: item.pendingCount + item.approvedCount,
    }))
    .sort((a, b) => {
      if (a.pendingCount !== b.pendingCount) return b.pendingCount - a.pendingCount;
      if (a.approvedCount !== b.approvedCount) return b.approvedCount - a.approvedCount;
      return a.title.localeCompare(b.title, 'uz');
    });
}

export function getHubActivityCount(items: OrderApprovalHubItem[]): number {
  return items.reduce((total, item) => total + item.pendingCount + item.approvedCount, 0);
}

export function findHubItem(
  items: OrderApprovalHubItem[],
  productType: string,
): OrderApprovalHubItem | undefined {
  return items.find(item => item.productType === productType);
}

function sortByNewestFirst(orders: MonthlyOrder[]): MonthlyOrder[] {
  return [...orders].sort((a, b) => {
    const createdDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (createdDiff !== 0) return createdDiff;
    return b.orderNumber.localeCompare(a.orderNumber, undefined, { numeric: true });
  });
}

/** Buxgalteriya: kelishuv kutilayotgan + kelishilgan buyurtmalar. */
export function listAccountingOrdersForPeriod(
  orders: MonthlyOrder[],
  periodFrom: string,
  periodTo: string,
  productType = '',
): MonthlyOrder[] {
  return sortByNewestFirst(
    orders.filter(order =>
      !isOneCOrder(order)
      && matchesPeriodRange(order.year, order.month, periodFrom, periodTo)
      && (!productType || order.productType === productType)
      && (
        order.status === 'PendingAccounting'
        || ACCOUNTING_APPROVED_STATUSES.has(order.status)
      )),
  );
}

/** ICHDX: tasdiqlash kutilayotgan + tasdiqlangan buyurtmalar. */
export function listDispatchOrdersForPeriod(
  orders: MonthlyOrder[],
  periodFrom: string,
  periodTo: string,
  productType = '',
): MonthlyOrder[] {
  return sortByNewestFirst(
    orders.filter(order =>
      !isOneCOrder(order)
      && matchesPeriodRange(order.year, order.month, periodFrom, periodTo)
      && (!productType || order.productType === productType)
      && (
        order.status === 'PendingDispatching'
        || (order.status === 'Active' && !!order.dispatchApproverName)
      )),
  );
}

/** Ishlab chiqarish bo‘yicha o‘rinbosari: kelishuv kutilayotgan + o‘tgan buyurtmalar. */
export function listDeputyOrdersForPeriod(
  orders: MonthlyOrder[],
  periodFrom: string,
  periodTo: string,
  productType = '',
): MonthlyOrder[] {
  return sortByNewestFirst(
    orders.filter(order =>
      !isOneCOrder(order)
      && matchesPeriodRange(order.year, order.month, periodFrom, periodTo)
      && (!productType || order.productType === productType)
      && (
        order.status === 'PendingDeputyDirector'
        || ((order.status === 'PendingDispatching' || order.status === 'Active')
          && !!order.deputyApproverName)
      )),
  );
}
