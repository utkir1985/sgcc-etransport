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
}: TablePaginationProps) {
  const calculatedTotalPages = Math.max(1, Math.ceil(total / pageSize));
  const totalPages = propTotalPages ?? calculatedTotalPages;
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pageItems = buildPageItems(currentPage, totalPages);

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
            onChange={e => {
              onPageSizeChange(Number(e.target.value));
              onPageChange(1);
            }}
          >
            {pageSizeOptions.map(opt => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
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
      </div>
    </div>
  );
}
