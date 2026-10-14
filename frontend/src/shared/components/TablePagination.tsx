import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { buildPageItems } from '../utils/docsHubFilter';

export interface TablePaginationProps {
  total: number;
  page: number;
  pageSize: number;
  totalPages?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  unitLabel?: string;
  pageSizeOptions?: number[];
  className?: string;
  /** `kpi` — KPI tizimi andozasi: chapda soni, markazda sahifalar, o‘ngda «Sahifada». */
  variant?: 'default' | 'kpi';
}

/** KPI andozasidagi «Sahifada» tanlovi — brauzer select'i o‘rniga yuqoriga ochiladigan menyu. */
function PageSizeMenu({
  value,
  options,
  onChange,
}: {
  value: number;
  options: number[];
  onChange: (size: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div className="kpi-pagination__size-menu" ref={ref}>
      <button
        type="button"
        className={`kpi-pagination__size-btn${open ? ' kpi-pagination__size-btn--open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{value}</span>
        <ChevronDown className="w-4 h-4" strokeWidth={1.75} />
      </button>
      {open && (
        <div className="kpi-select-menu kpi-select-menu--up" role="listbox">
          {options.map(opt => (
            <button
              key={opt}
              type="button"
              role="option"
              aria-selected={opt === value}
              className={`kpi-select-menu__item${opt === value ? ' kpi-select-menu__item--active' : ''}`}
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Foydalanuvchilar andozasidagi qat'iy yagona pagination komponenti (.admin-table-footer + .admin-pagination)
 */
export function TablePagination({
  total,
  page,
  pageSize,
  totalPages: propTotalPages,
  onPageChange,
  onPageSizeChange,
  unitLabel = 'yozuv',
  pageSizeOptions = [10, 20, 25, 50],
  className = '',
  variant = 'default',
}: TablePaginationProps) {
  const calculatedTotalPages = Math.max(1, Math.ceil(total / pageSize));
  const totalPages = propTotalPages ?? calculatedTotalPages;
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pageItems = buildPageItems(currentPage, totalPages);

  const changePageSize = (size: number) => {
    onPageSizeChange(size);
    onPageChange(1);
  };

  const pagination = (
    <div className="admin-pagination">
      <button
        type="button"
        className="admin-pagination__btn"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        aria-label="Oldingi sahifa"
      >
        <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
      </button>
      {pageItems.map((item, idx) => {
        if (item === 'dots-left' || item === 'dots-right') {
          return (
            <span key={`${item}-${idx}`} className="px-1 text-slate-400 select-none text-xs">
              …
            </span>
          );
        }
        return (
          <button
            key={item}
            type="button"
            className={`admin-pagination__btn${item === currentPage ? ' admin-pagination__btn--active' : ''}`}
            onClick={() => onPageChange(item)}
          >
            {item}
          </button>
        );
      })}
      <button
        type="button"
        className="admin-pagination__btn"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        aria-label="Keyingi sahifa"
      >
        <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
      </button>
    </div>
  );

  if (variant === 'kpi') {
    return (
      <div className={`kpi-pagination${className ? ` ${className}` : ''}`}>
        <p className="kpi-pagination__count">
          <strong>{total}</strong> ta {unitLabel}
        </p>
        {pagination}
        <div className="kpi-pagination__size">
          <span>Sahifada:</span>
          <PageSizeMenu value={pageSize} options={pageSizeOptions} onChange={changePageSize} />
        </div>
      </div>
    );
  }

  return (
    <div className={`admin-table-footer${className ? ` ${className}` : ''}`}>
      <p className="admin-table-footer__count">
        Jami {total} ta {unitLabel}
      </p>
      <div className="admin-table-footer__controls">
        <label className="admin-table-footer__pagesize">
          <span>Sahifadagi qatorlar:</span>
          <select
            value={pageSize}
            onChange={e => changePageSize(Number(e.target.value))}
          >
            {pageSizeOptions.map(opt => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
        {pagination}
      </div>
    </div>
  );
}
