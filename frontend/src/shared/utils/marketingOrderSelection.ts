import type { MonthlyOrder } from '../types';
import type { ProductCatalogEntry } from '../constants/productTypes';
import { matchesPeriodRange } from './dates';
import { isOneCOrder } from './oneCSources';

const AGREED_STATUSES = new Set([
  'ReadyForDispatch',
  'PendingDeputyDirector',
  'PendingDispatching',
  'Active',
]);

export interface MarketingOrderGroups {
  agreed: MonthlyOrder[];
  pendingAccounting: MonthlyOrder[];
  returned: MonthlyOrder[];
  draft: MonthlyOrder[];
}

export interface MarketingProductHubItem {
  productType: string;
  title: string;
  shortTitle: string;
  totalCount: number;
  draftCount: number;
  pendingCount: number;
  returnedCount: number;
  agreedCount: number;
}

export function getMatchingMarketingOrders(
  orders: MonthlyOrder[],
  periodFrom: string,
  periodTo: string,
  productType: string,
): MonthlyOrder[] {
  return orders.filter(order =>
    matchesPeriodRange(order.year, order.month, periodFrom, periodTo)
    && (!productType || order.productType === productType),
  );
}

/** Davrdagi (yoki barcha davrdagi) buyurtmalar — yangidan eskiga. */
export function listMarketingOrdersForPeriod(
  orders: MonthlyOrder[],
  periodFrom: string,
  periodTo: string,
  productType = '',
): MonthlyOrder[] {
  return sortByNewestFirst(
    getMatchingMarketingOrders(orders, periodFrom, periodTo, productType).filter(order => !isOneCOrder(order)),
  );
}

function sortByNewestFirst(orders: MonthlyOrder[]): MonthlyOrder[] {
  return [...orders].sort((a, b) => {
    const createdDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (createdDiff !== 0) return createdDiff;
    return b.orderNumber.localeCompare(a.orderNumber, undefined, { numeric: true });
  });
}

export function groupMarketingOrders(orders: MonthlyOrder[]): MarketingOrderGroups {
  return {
    agreed: sortByNewestFirst(orders.filter(order => AGREED_STATUSES.has(order.status))),
    pendingAccounting: sortByNewestFirst(orders.filter(order => order.status === 'PendingAccounting')),
    returned: sortByNewestFirst(orders.filter(order => order.status === 'ReturnedToMarketing')),
    draft: sortByNewestFirst(orders.filter(order => order.status === 'Draft')),
  };
}

export function hasVisibleMarketingOrders(groups: MarketingOrderGroups): boolean {
  return groups.agreed.length
    + groups.pendingAccounting.length
    + groups.returned.length
    + groups.draft.length > 0;
}

export function buildMarketingHubItems(
  orders: MonthlyOrder[],
  productEntries: ProductCatalogEntry[],
  periodFrom: string,
  periodTo: string,
): MarketingProductHubItem[] {
  return productEntries
    .map(entry => {
      const productOrders = orders.filter(order =>
        matchesPeriodRange(order.year, order.month, periodFrom, periodTo)
        && order.productType === entry.productType);
      const groups = groupMarketingOrders(productOrders);

      return {
        productType: entry.productType,
        title: entry.title,
        shortTitle: entry.shortTitle,
        totalCount: productOrders.length,
        draftCount: groups.draft.length,
        pendingCount: groups.pendingAccounting.length,
        returnedCount: groups.returned.length,
        agreedCount: groups.agreed.length,
      };
    })
    .sort((a, b) => {
      if (a.totalCount !== b.totalCount) return b.totalCount - a.totalCount;
      return a.title.localeCompare(b.title, 'uz');
    });
}
