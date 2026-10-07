import { useState, type ReactNode } from 'react';
import { ChevronRight, LayoutGrid, List } from 'lucide-react';
import type { MarketingProductHubItem } from '../utils/marketingOrderSelection';
import { ProductTypeIcon } from './ProductTypeIcon';

interface MarketingProductHubProps {
  items: MarketingProductHubItem[];
  periodControl: ReactNode;
  onSelect: (productType: string) => void;
}

type HubViewMode = 'list' | 'card';

function buildStatusLine(item: MarketingProductHubItem): string {
  if (item.totalCount === 0) return 'Bu davrda buyurtma yo\'q';

  const parts: string[] = [];
  if (item.draftCount) parts.push(`${item.draftCount} qoralama`);
  if (item.pendingCount) parts.push(`${item.pendingCount} kelishuvda`);
  if (item.returnedCount) parts.push(`${item.returnedCount} qaytarilgan`);
  if (item.agreedCount) parts.push(`${item.agreedCount} kelishilgan`);

  return parts.join(' · ');
}

function ViewModeToggle({
  value,
  onChange,
}: {
  value: HubViewMode;
  onChange: (mode: HubViewMode) => void;
}) {
  return (
    <div className="marketing-view-toggle" role="group" aria-label="Ko'rinish rejimi">
      <button
        type="button"
        aria-pressed={value === 'list'}
        aria-label="Ro'yxat"
        onClick={() => onChange('list')}
        className={`marketing-view-toggle__btn${value === 'list' ? ' marketing-view-toggle__btn--active' : ''}`}
      >
        <List className="w-4 h-4" strokeWidth={1.75} />
        <span className="marketing-view-toggle__text">Ro&apos;yxat</span>
      </button>
      <button
        type="button"
        aria-pressed={value === 'card'}
        aria-label="Kartochka"
        onClick={() => onChange('card')}
        className={`marketing-view-toggle__btn${value === 'card' ? ' marketing-view-toggle__btn--active' : ''}`}
      >
        <LayoutGrid className="w-4 h-4" strokeWidth={1.75} />
        <span className="marketing-view-toggle__text">Kartochka</span>
      </button>
    </div>
  );
}

function ProductIconBox({
  productType,
  size = 'md',
  className = '',
}: {
  productType: string;
  size?: 'md' | 'lg';
  className?: string;
}) {
  return (
    <ProductTypeIcon
      productType={productType}
      size={size}
      className={`marketing-product-row__icon ${className}`.trim()}
    />
  );
}

export function MarketingProductHub({ items, periodControl, onSelect }: MarketingProductHubProps) {
  const [viewMode, setViewMode] = useState<HubViewMode>('list');

  return (
    <div className="marketing-product-hub-page">
      <header className="marketing-product-hub-header">
        <div className="marketing-product-hub-header__intro">
          <h1 className="marketing-product-hub-header__title">Mahsulot turlari</h1>
          <p className="marketing-product-hub-header__desc">
            Mahsulotlarni tanlang — buyurtmalar shu turlar bo&apos;yicha qabul qilinadi.
          </p>
        </div>

        <div className="marketing-product-hub-header__actions">
          <div className="marketing-product-hub-header__period">{periodControl}</div>
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </div>
      </header>

      {viewMode === 'list' ? (
        <div className="marketing-product-list">
          {items.map(item => {
            const hasActivity = item.totalCount > 0;
            const statusLine = buildStatusLine(item);

            return (
              <button
                key={item.productType}
                type="button"
                onClick={() => onSelect(item.productType)}
                className="marketing-product-row"
              >
                <ProductIconBox productType={item.productType} />

                <div className="marketing-product-row__body">
                  <div className="marketing-product-row__main">
                    <span className="marketing-product-row__title">{item.title}</span>
                    <span className={`marketing-product-row__status${hasActivity ? '' : ' marketing-product-row__status--empty'}`}>
                      <span className="marketing-product-row__status-dot" aria-hidden />
                      {statusLine}
                    </span>
                  </div>

                  <div className="marketing-product-row__aside">
                    <span className={`marketing-product-row__orders${hasActivity ? ' marketing-product-row__orders--active' : ''}`}>
                      {item.totalCount} buyurtma
                    </span>
                    <ChevronRight className="marketing-product-row__chevron w-5 h-5" strokeWidth={1.75} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="marketing-product-grid">
          {items.map(item => {
            const hasActivity = item.totalCount > 0;
            const statusLine = buildStatusLine(item);

            return (
              <button
                key={item.productType}
                type="button"
                onClick={() => onSelect(item.productType)}
                className="marketing-product-card"
              >
                <ProductIconBox productType={item.productType} size="lg" className="marketing-product-card__icon" />

                <div className="marketing-product-card__body">
                  <span className="marketing-product-card__title">{item.title}</span>
                  <span className={`marketing-product-row__status${hasActivity ? '' : ' marketing-product-row__status--empty'}`}>
                    <span className="marketing-product-row__status-dot" aria-hidden />
                    {statusLine}
                  </span>
                </div>

                <div className="marketing-product-card__footer">
                  <span className={`marketing-product-row__orders${hasActivity ? ' marketing-product-row__orders--active' : ''}`}>
                    {item.totalCount} buyurtma
                  </span>
                  <ChevronRight className="marketing-product-row__chevron w-5 h-5" strokeWidth={1.75} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
