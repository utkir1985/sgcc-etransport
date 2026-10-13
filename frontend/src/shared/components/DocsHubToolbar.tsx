import { Search, X } from 'lucide-react';
import { DatePicker } from './DatePicker';
import { ProductTypeFilter, type ProductTypeFilterOption } from './ProductTypeFilter';
import { DOCS_PERIOD_PRESETS, type DocsPeriodPreset } from '../utils/docsHubFilter';

interface DocsHubToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  preset: DocsPeriodPreset;
  onPreset: (preset: Exclude<DocsPeriodPreset, 'custom'>) => void;
  from: string;
  to: string;
  onFromChange: (iso: string) => void;
  onToChange: (iso: string) => void;
  product?: string;
  productOptions?: ProductTypeFilterOption[];
  onProductChange?: (value: string) => void;
  meta?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

export function DocsHubToolbar({
  search,
  onSearchChange,
  searchPlaceholder = 'Partiya, vagon, hujjat №…',
  preset,
  onPreset,
  from,
  to,
  onFromChange,
  onToChange,
  product = '',
  productOptions,
  onProductChange,
  meta,
  actions,
  children,
}: DocsHubToolbarProps) {
  return (
    <div className="thub__toolbar reestr-toolbar docs-hub-toolbar">
      <div className="thub-pills" role="group" aria-label="Davr">
        {DOCS_PERIOD_PRESETS.map(item => (
          <button
            key={item.id}
            type="button"
            className={preset === item.id ? 'is-on' : undefined}
            onClick={() => onPreset(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <label className="thub-search">
        <Search className="thub-search__ico" strokeWidth={1.75} />
        <input
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
        />
        {search ? (
          <button type="button" className="thub-search__x" onClick={() => onSearchChange('')} aria-label="Tozalash">
            <X className="w-3.5 h-3.5" />
          </button>
        ) : null}
      </label>

      {productOptions && onProductChange ? (
        <ProductTypeFilter
          value={product}
          options={productOptions}
          onChange={onProductChange}
          fieldLabel=""
          emptyLabel="Barcha mahsulotlar"
        />
      ) : null}

      <div className="thub-date">
        <span className="thub-date__lbl">Dan</span>
        <DatePicker value={from} onChange={onFromChange} variant="compact" placeholder="dd.mm.yyyy" />
        <span className="thub-date__lbl">Gacha</span>
        <DatePicker value={to} onChange={onToChange} variant="compact" placeholder="dd.mm.yyyy" />
      </div>

      {actions ? (
        <div className="docs-hub-toolbar__actions sm:ml-auto flex items-center gap-2">
          {actions}
        </div>
      ) : null}
      {children}

      {meta ? <span className="thub-history__meta">{meta}</span> : null}
    </div>
  );
}
