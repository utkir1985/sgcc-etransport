import { useState, type ReactNode } from 'react';
import { ChevronRight, LayoutGrid, List } from 'lucide-react';
import { ProductTypeIcon } from './ProductTypeIcon';

export interface PlansHubItem {
  productType: string;
  title: string;
  shortTitle: string;
  /** Umumiy vagon soni (buyurtma / taqsimot bo‘yicha). */
  totalWagons: number;
  /** Taqsimlangan (rejalashtirilgan) vagonlar. */
  allocatedWagons: number;
  remainingWagons: number;
  /** Estakadaga qo‘yilgan, hali yuklashga biriktirilmagan. */
  tareReadyWagons: number;
  /** Taqsimotga ochiq (estakada − boshqa taqsimot bandi). */
  availableToAllocate: number;
  activeOrderCount: number;
  pendingPlanCount: number;
  planCount: number;
}

type HubViewMode = 'list' | 'card';
type StatusTone = 'empty' | 'waiting' | 'progress' | 'done';

function statusMeta(item: PlansHubItem): { text: string; tone: StatusTone } {
  if (item.activeOrderCount === 0 && item.planCount === 0 && item.totalWagons === 0) {
    return { text: 'Tanlangan davrda buyurtma mavjud emas', tone: 'empty' };
  }

  const allocated = Math.max(0, item.allocatedWagons);
  const remaining = Math.max(0, item.remainingWagons);
  const open = Math.max(0, item.availableToAllocate);
  const tare = Math.max(0, item.tareReadyWagons);

  if (tare === 0 && remaining > 0) {
    return {
      text: `Estakadaga qo‘yilgan bo‘sh vagon yo‘q · buyurtmada ${remaining} ta qoldi`,
      tone: 'waiting',
    };
  }

  if (allocated > 0 && remaining > 0) {
    return {
      text: `${allocated} ta taqsimlangan · hozir ajratish mumkin: ${open} ta`,
      tone: 'progress',
    };
  }

  if (allocated > 0 && remaining === 0) {
    return {
      text: `${allocated} ta vagon taqsimlangan · hozir ajratish mumkin: ${open} ta`,
      tone: 'done',
    };
  }

  if (remaining > 0) {
    return {
      text: `Hozir ajratish mumkin: ${open} ta · buyurtmada ${remaining} ta qoldi`,
      tone: 'waiting',
    };
  }

  return { text: 'Tanlangan davrda buyurtma mavjud emas', tone: 'empty' };
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

interface PlansProductHubProps {
  items: PlansHubItem[];
  periodControl: ReactNode;
  onSelect: (productType: string) => void;
}

export function PlansProductHub({ items, periodControl, onSelect }: PlansProductHubProps) {
  const [viewMode, setViewMode] = useState<HubViewMode>('list');

  return (
    <div className="marketing-product-hub-page">
      <header className="marketing-product-hub-header">
        <div className="marketing-product-hub-header__intro">
          <h1 className="marketing-product-hub-header__title">Yuklash taqsimoti</h1>
          <p className="marketing-product-hub-header__desc">
            Mahsulotlarni tanlang — ICHDX yuklash taqsimoti shu turlar bo‘yicha shakllantiriladi.
          </p>
        </div>

        <div className="marketing-product-hub-header__actions !flex-nowrap !items-end !w-auto">
          <div className="marketing-product-hub-header__period !flex-none !w-auto shrink-0">
            {periodControl}
          </div>
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </div>
      </header>

      {viewMode === 'list' ? (
        <div className="marketing-product-list space-y-3">
          {items.map(item => {
            const { text, tone } = statusMeta(item);
            const hasActivity = item.totalWagons > 0;

            return (
              <button
                key={item.productType}
                type="button"
                onClick={() => onSelect(item.productType)}
                className="marketing-product-row transition-all duration-200"
              >
                <ProductTypeIcon
                  productType={item.productType}
                  size="md"
                  className="marketing-product-row__icon"
                />
                <div className="marketing-product-row__body">
                  <div className="marketing-product-row__main">
                    <span className="marketing-product-row__title">{item.title}</span>
                    <span
                      className={`marketing-product-row__status${
                        tone === 'empty' ? ' marketing-product-row__status--empty' : ''
                      }`}
                    >
                      <span
                        className={[
                          'marketing-product-row__status-dot',
                          tone === 'waiting' ? 'marketing-product-row__status-dot--waiting' : '',
                          tone === 'progress' || tone === 'done'
                            ? 'marketing-product-row__status-dot--progress'
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        aria-hidden
                      />
                      <span
                        className={
                          tone === 'waiting'
                            ? 'font-medium text-amber-700 dark:text-amber-300'
                            : tone === 'progress' || tone === 'done'
                              ? 'font-medium text-emerald-700 dark:text-emerald-300'
                              : undefined
                        }
                      >
                        {text}
                      </span>
                    </span>
                  </div>
                  <div className="marketing-product-row__aside">
                    <span
                      className={`marketing-product-row__orders${
                        hasActivity ? ' marketing-product-row__orders--active' : ''
                      }`}
                    >
                      {item.availableToAllocate > 0
                        ? `Ajratish mumkin: ${item.availableToAllocate} ta`
                        : `${item.totalWagons} ta vagon`}
                    </span>
                    <ChevronRight className="marketing-product-row__chevron w-5 h-5" strokeWidth={1.75} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="marketing-product-grid gap-4">
          {items.map(item => {
            const { text, tone } = statusMeta(item);
            const hasActivity = item.totalWagons > 0;

            return (
              <button
                key={item.productType}
                type="button"
                onClick={() => onSelect(item.productType)}
                className="marketing-product-card transition-all duration-200"
              >
                <ProductTypeIcon
                  productType={item.productType}
                  size="lg"
                  className="marketing-product-card__icon marketing-product-row__icon"
                />
                <div className="marketing-product-card__body">
                  <span className="marketing-product-card__title">{item.title}</span>
                  <span
                    className={`marketing-product-row__status${
                      tone === 'empty' ? ' marketing-product-row__status--empty' : ''
                    }`}
                  >
                    <span
                      className={[
                        'marketing-product-row__status-dot',
                        tone === 'waiting' ? 'marketing-product-row__status-dot--waiting' : '',
                        tone === 'progress' || tone === 'done'
                          ? 'marketing-product-row__status-dot--progress'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      aria-hidden
                    />
                    <span
                      className={
                        tone === 'waiting'
                          ? 'font-medium text-amber-700 dark:text-amber-300'
                          : tone === 'progress' || tone === 'done'
                            ? 'font-medium text-emerald-700 dark:text-emerald-300'
                            : undefined
                      }
                    >
                      {text}
                    </span>
                  </span>
                </div>
                <div className="marketing-product-card__footer">
                  <span
                    className={`marketing-product-row__orders${
                      hasActivity ? ' marketing-product-row__orders--active' : ''
                    }`}
                  >
                    {item.availableToAllocate > 0
                      ? `Ajratish mumkin: ${item.availableToAllocate} ta`
                      : `${item.totalWagons} ta vagon`}
                  </span>
                  <ChevronRight className="marketing-product-row__chevron w-5 h-5" strokeWidth={1.75} />
                </div>
              </button>
            );
          })}
        </div>
      )}

      <p className="text-sm text-gray-500 dark:text-slate-400 pt-1">
        Jami: {items.length} ta mahsulot
      </p>
    </div>
  );
}
