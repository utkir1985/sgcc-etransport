import { ChevronLeft, ChevronRight } from 'lucide-react';
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
        <label className="kpi-pagination__size">
          <span>Sahifada:</span>
          <select value={pageSize} onChange={e => changePageSize(Number(e.target.value))}>
            {pageSizeOptions.map(opt => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
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
