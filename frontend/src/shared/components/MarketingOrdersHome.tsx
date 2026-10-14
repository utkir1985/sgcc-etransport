import type { ReactNode } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  Hourglass,
  Layers,
  Plus,
  Search,
  X,
} from 'lucide-react';
import type { ProductCatalogEntry } from '../constants/productTypes';
import { RAILWAY_PRODUCT_TYPE_WIDTH_LABEL } from '../constants/productTypes';
import type { OrderListView } from '../utils/menuNav';
import { HubZoneTabs, type HubZoneTone } from './HubZoneTabs';
import { ProductTypeFilter } from './ProductTypeFilter';

const SEGMENTS: Array<{
  id: OrderListView;
  label: string;
  hint: string;
  icon: typeof ClipboardList;
  tone: HubZoneTone;
}> = [
  {
    id: 'all',
    label: 'Barchasi',
    hint: 'Barcha buyurtmalar',
    icon: Layers,
    tone: 'sky',
  },
  {
    id: 'faol',
    label: 'Tasdiqlangan',
    hint: 'Tasdiqlangan buyurtmalar',
    icon: ClipboardList,
    tone: 'live',
  },
  {
    id: 'tasdiq',
    label: 'Jarayonda',
    hint: 'Kelishuv jarayonida',
    icon: Hourglass,
    tone: 'wait',
  },
  {
    id: 'yakun',
    label: 'Yakunlangan',
    hint: 'Arxiv · davr bo‘yicha',
    icon: CheckCircle2,
    tone: 'done',
  },
];

interface MarketingOrdersHomeProps {
  title: string;
  productEntries: ProductCatalogEntry[];
  filterProductType: string;
  onFilterProductChange: (productType: string) => void;
  periodControl: ReactNode;
  listView?: OrderListView;
  onListViewChange?: (view: OrderListView) => void;
  segmentCounts?: Record<OrderListView, number>;
  searchQuery?: string;
  onSearchQueryChange?: (value: string) => void;
  resultCount?: number;
  showPeriod?: boolean;
  panelTitle?: string;
  canCreate?: boolean;
  onCreate?: () => void;
  createLabel?: string;
  toolbarActions?: ReactNode;
  hideHeader?: boolean;
  children: ReactNode;
}

export function MarketingOrdersHome({
  title,
  productEntries,
  filterProductType,
  onFilterProductChange,
  periodControl,
  listView,
  onListViewChange,
  segmentCounts,
  searchQuery = '',
  onSearchQueryChange,
  resultCount,
  showPeriod,
  panelTitle,
  canCreate = false,
  onCreate,
  createLabel = 'Yangi buyurtma',
  toolbarActions,
  hideHeader = false,
  children,
}: MarketingOrdersHomeProps) {
  const isHubPanel = !!listView && !!onListViewChange && !!segmentCounts;
  const showPeriodField = isHubPanel ? !!showPeriod : periodControl != null;

  const productOptions = productEntries.map(entry => ({
    value: entry.productType,
    label: entry.shortTitle || entry.title,
  }));

  const productFilter = (
    <ProductTypeFilter
      value={filterProductType}
      options={productOptions}
      onChange={onFilterProductChange}
      widthLabel={RAILWAY_PRODUCT_TYPE_WIDTH_LABEL}
      fieldLabel={isHubPanel ? '' : 'Mahsulot turi'}
    />
  );

  if (!isHubPanel) {
    return (
      <div className="marketing-orders-home">
        {!hideHeader ? (
          <header className="marketing-orders-home__header">
            <h1 className="marketing-orders-home__title">{panelTitle || title}</h1>
          </header>
        ) : null}
        <div className="marketing-orders-toolbar">
          <div className="marketing-orders-toolbar__filters">
            {productFilter}
            {showPeriodField ? (
              <div className="marketing-orders-toolbar__field marketing-orders-toolbar__field--period">
                {periodControl}
              </div>
            ) : null}
          </div>
          {(toolbarActions || (canCreate && onCreate)) ? (
            <div className="marketing-orders-toolbar__right">
              <div className="flex flex-nowrap items-center gap-2">
                {toolbarActions}
                {canCreate && onCreate ? (
                  <button type="button" onClick={onCreate} className="btn-primary marketing-orders-home__create whitespace-nowrap">
                    <Plus className="w-4 h-4" strokeWidth={2} />
                    {createLabel}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        <div className="marketing-orders-home__body">{children}</div>
      </div>
    );
  }

  return (
    <div className="thub reestr ohub">
      <section className="thub__main reestr-main">
        <HubZoneTabs
          label="Buyurtma holati"
          columns={4}
          value={listView!}
          onChange={id => onListViewChange?.(id)}
          items={SEGMENTS.map(item => ({
            ...item,
            count: segmentCounts?.[item.id] ?? 0,
          }))}
        />

        <div className="docs-panel">
          <div className="thub__toolbar reestr-toolbar">
            {onSearchQueryChange ? (
              <label className="thub-search">
                <Search className="thub-search__ico" strokeWidth={1.75} aria-hidden />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={e => onSearchQueryChange(e.target.value)}
                  placeholder="Qidiruv…"
                  autoComplete="off"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    className="thub-search__x"
                    onClick={() => onSearchQueryChange('')}
                    aria-label="Tozalash"
                  >
                    <X className="w-3.5 h-3.5" strokeWidth={2} />
                  </button>
                ) : null}
              </label>
            ) : null}

            {productFilter}

            {showPeriodField ? (
              <div className="ohub-period">{periodControl}</div>
            ) : null}

            <div className="ohub-toolbar__right">
              {typeof resultCount === 'number' ? (
                <span className="ohub-count">{resultCount} ta natija</span>
              ) : null}
              <div className="flex flex-nowrap items-center gap-2">
              {toolbarActions}
              {canCreate && onCreate ? (
                <button type="button" onClick={onCreate} className="btn-primary whitespace-nowrap">
                  <Plus className="w-4 h-4" strokeWidth={2} />
                  {createLabel}
                </button>
              ) : null}
              </div>
            </div>
          </div>

          <div className="thub__board">{children}</div>
        </div>
      </section>
    </div>
  );
}
