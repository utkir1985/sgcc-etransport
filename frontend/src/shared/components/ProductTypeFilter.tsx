import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { RAILWAY_PRODUCT_TYPE_WIDTH_LABEL } from '../constants/productTypes';

export interface ProductTypeFilterOption {
  value: string;
  label: string;
}

interface ProductTypeFilterProps {
  value: string;
  options: ProductTypeFilterOption[];
  onChange: (value: string) => void;
  /** Yuqoridagi yorliq; bo‘sh = yorliq yo‘q */
  fieldLabel?: string;
  /** Bo‘sh qiymat matni / «barcha» bandi */
  emptyLabel?: string;
  /** true bo‘lsa emptyLabel menyuda ham chiqadi */
  allowEmpty?: boolean;
  /** Kenglik andozasi (eng uzun mahsulot nomi) */
  widthLabel?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Mahsulot turi — Marketing andozasi (sizer + Dan/Gacha bilan bir xil balandlik).
 */
export function ProductTypeFilter({
  value,
  options,
  onChange,
  fieldLabel = 'Mahsulot turi',
  emptyLabel = 'Barcha mahsulotlar',
  allowEmpty = true,
  widthLabel = RAILWAY_PRODUCT_TYPE_WIDTH_LABEL,
  disabled = false,
  className = '',
}: ProductTypeFilterProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const selected = options.find(o => o.value === value);
  const display = selected?.label || emptyLabel;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div
      className={`marketing-orders-toolbar__field product-type-filter${className ? ` ${className}` : ''}`}
      ref={rootRef}
    >
      {fieldLabel ? (
        <span className="marketing-orders-toolbar__label">{fieldLabel}</span>
      ) : null}
      <div className="marketing-product-filter-anchor">
        <span
          className="marketing-product-filter marketing-product-filter--sizer"
          aria-hidden="true"
        >
          <span className="marketing-product-filter__text">{widthLabel}</span>
          <ChevronDown className="marketing-product-filter__chevron w-4 h-4" strokeWidth={1.75} />
        </span>
        <button
          type="button"
          disabled={disabled}
          className={`marketing-product-filter marketing-product-filter--trigger${
            open ? ' marketing-product-filter--open' : ''
          }${value ? ' marketing-product-filter--active' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => !disabled && setOpen(o => !o)}
        >
          <span className="marketing-product-filter__text">{display}</span>
          <ChevronDown className="marketing-product-filter__chevron w-4 h-4" strokeWidth={1.75} />
        </button>
      </div>
      {open ? (
        <ul className="marketing-product-filter__menu" role="listbox">
          {allowEmpty ? (
            <li role="option" aria-selected={!value}>
              <button
                type="button"
                className={`marketing-product-filter__item${!value ? ' marketing-product-filter__item--active' : ''}`}
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
              >
                {emptyLabel}
              </button>
            </li>
          ) : null}
          {options.map(opt => (
            <li key={opt.value} role="option" aria-selected={opt.value === value}>
              <button
                type="button"
                className={`marketing-product-filter__item${
                  opt.value === value ? ' marketing-product-filter__item--active' : ''
                }`}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
