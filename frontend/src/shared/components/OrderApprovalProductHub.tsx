import { useState, type ReactNode } from 'react';
import { ChevronRight, LayoutGrid, List, BellRing } from 'lucide-react';
import type { OrderApprovalHubItem } from '../utils/orderApprovalNav';
import { ProductTypeIcon } from './ProductTypeIcon';

interface OrderApprovalProductHubProps {
  items: OrderApprovalHubItem[];
  periodControl: ReactNode;
  title?: string;
  description?: string;
  statusMode?: 'accounting' | 'dispatch';
  onSelect: (productType: string) => void;
}

type HubViewMode = 'list' | 'card';

function buildStatusLine(
  item: OrderApprovalHubItem,
  statusMode: 'accounting' | 'dispatch',
): string {
  if (item.totalCount === 0) return 'Bu davrda buyurtma yo\'q';

  const parts: string[] = [];
  if (item.pendingCount) {
    parts.push(statusMode === 'accounting'
      ? `${item.pendingCount} kelishuvda`
      : `${item.pendingCount} ijroga qabulda`);
  }
  if (item.approvedCount) {
    parts.push(statusMode === 'accounting'
      ? `${item.approvedCount} kelishilgan`
      : `${item.approvedCount} ijroga qabul qilingan`);
  }

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

export function OrderApprovalProductHub({
  items,
  periodControl,
  title = 'Buyurtma kelishuvi',
  description = 'Mahsulotlarni tanlang — kelishuv shu turlar bo\'yicha amalga oshiriladi.',
  statusMode = 'accounting',
  onSelect,
}: OrderApprovalProductHubProps) {
  const [viewMode, setViewMode] = useState<HubViewMode>('list');

  const totalPending = items.reduce((sum, item) => sum + item.pendingCount, 0);

  return (
    <div className="marketing-product-hub-page">
      <header className="marketing-product-hub-header">
        <div className="marketing-product-hub-header__intro">
          <h1 className="marketing-product-hub-header__title">{title}</h1>
          <p className="marketing-product-hub-header__desc">{description}</p>
        </div>

        <div className="marketing-product-hub-header__actions">
          <div className="marketing-product-hub-header__period">{periodControl}</div>
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </div>
      </header>

      {/* Elegant, professional top alert bar when new pending orders exist */}
      {totalPending > 0 && (
        <div className="mb-5 p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-800/60 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-blue-900 dark:text-blue-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <BellRing className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm">Yangi buyurtma jarayonda</h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-600 text-white">
                  {totalPending} ta
                </span>
              </div>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
                MS va MX buyurtmani keyingi bosqichga yuborgan.
              </p>
            </div>
          </div>
          <span className="px-3.5 py-1.5 rounded-xl bg-white dark:bg-blue-900 text-blue-700 dark:text-blue-200 font-semibold text-xs border border-blue-200 dark:border-blue-700 shrink-0">
            Ko'rib chiqish lozim
          </span>
        </div>
      )}

      {viewMode === 'list' ? (
        <div className="marketing-product-list space-y-3">
          {items.map(item => {
            const hasActivity = item.totalCount > 0;
            const isPending = item.pendingCount > 0;
            const statusLine = buildStatusLine(item, statusMode);

            return (
              <button
                key={item.productType}
                type="button"
                onClick={() => onSelect(item.productType)}
                className={`marketing-product-row transition-all duration-200 ${
                  isPending
                    ? 'border-2 border-blue-500/80 dark:border-blue-400 bg-blue-50/40 dark:bg-blue-950/20 shadow-sm ring-2 ring-blue-500/15'
                    : ''
                }`}
              >
                <ProductIconBox productType={item.productType} />

                <div className="marketing-product-row__body">
                  <div className="marketing-product-row__main">
                    <div className="flex items-center gap-2">
                      <span className={`marketing-product-row__title ${isPending ? 'font-bold text-blue-950 dark:text-slate-100' : ''}`}>
                        {item.title}
                      </span>
                      {isPending && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 border border-blue-200 dark:border-blue-700">
                          Yangi buyurtma
                        </span>
                      )}
                    </div>
                    <span className={`marketing-product-row__status${hasActivity ? '' : ' marketing-product-row__status--empty'}`}>
                      <span className={`marketing-product-row__status-dot${
                        isPending ? ' marketing-product-row__status-dot--pending' : ''
                      }`} aria-hidden />
                      <span className={isPending ? 'font-semibold text-blue-700 dark:text-blue-300' : undefined}>
                        {statusLine}
                      </span>
                    </span>
                  </div>

                  <div className="marketing-product-row__aside">
                    {isPending ? (
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1.5 rounded-xl bg-blue-600 text-white font-semibold text-xs shadow-sm flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                          {item.pendingCount} buyurtma kelishuvda
                        </span>
                        <ChevronRight className="marketing-product-row__chevron w-5 h-5 text-blue-600 dark:text-blue-400" strokeWidth={2} />
                      </div>
                    ) : (
                      <>
                        <span className={`marketing-product-row__orders${hasActivity ? ' marketing-product-row__orders--active' : ''}`}>
                          {item.totalCount} buyurtma
                        </span>
                        <ChevronRight className="marketing-product-row__chevron w-5 h-5" strokeWidth={1.75} />
                      </>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="marketing-product-grid gap-4">
          {items.map(item => {
            const hasActivity = item.totalCount > 0;
            const isPending = item.pendingCount > 0;
            const statusLine = buildStatusLine(item, statusMode);

            return (
              <button
                key={item.productType}
                type="button"
                onClick={() => onSelect(item.productType)}
                className={`marketing-product-card transition-all duration-200 ${
                  isPending
                    ? 'border-2 border-blue-500/80 dark:border-blue-400 bg-blue-50/40 dark:bg-blue-950/20 shadow-sm ring-2 ring-blue-500/15'
                    : ''
                }`}
              >
                <ProductIconBox productType={item.productType} size="lg" className="marketing-product-card__icon" />

                <div className="marketing-product-card__body">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`marketing-product-card__title ${isPending ? 'font-bold text-blue-950 dark:text-slate-100' : ''}`}>
                      {item.title}
                    </span>
                    {isPending && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 border border-blue-200 dark:border-blue-700">
                        Yangi
                      </span>
                    )}
                  </div>
                  <span className={`marketing-product-row__status${hasActivity ? '' : ' marketing-product-row__status--empty'}`}>
                    <span className={`marketing-product-row__status-dot${
                      isPending ? ' marketing-product-row__status-dot--pending' : ''
                    }`} aria-hidden />
                    <span className={isPending ? 'font-semibold text-blue-700 dark:text-blue-300' : undefined}>
                      {statusLine}
                    </span>
                  </span>
                </div>

                <div className="marketing-product-card__footer">
                  {isPending ? (
                    <span className="px-3 py-1 rounded-xl bg-blue-600 text-white font-semibold text-xs shadow-sm flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                      {item.pendingCount} kelishuvda
                    </span>
                  ) : (
                    <span className={`marketing-product-row__orders${hasActivity ? ' marketing-product-row__orders--active' : ''}`}>
                      {item.totalCount} buyurtma
                    </span>
                  )}
                  <ChevronRight className={`marketing-product-row__chevron w-5 h-5 ${isPending ? 'text-blue-600 dark:text-blue-400' : ''}`} strokeWidth={isPending ? 2 : 1.75} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
