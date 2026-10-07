import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buildPageItems } from '../utils/docsHubFilter';

interface DocsHubPaginationProps {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  unitLabel?: string;
}

export function DocsHubPagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  unitLabel = 'yozuv',
}: DocsHubPaginationProps) {
  if (total === 0) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = buildPageItems(currentPage, totalPages);
  const from = (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, total);

  return (
    <div className="thub-history-pagination docs-hub-pagination">
      <p className="thub-history-pagination__count docs-hub-pagination__count">
        <b>{total}</b>
        <span>ta {unitLabel}</span>
        {totalPages > 1 ? <em>· {from}–{to}</em> : null}
      </p>
      <div className="thub-history-pagination__pages">
        <button
          type="button"
          className="admin-pagination__btn"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          aria-label="Oldingi sahifa"
        >
          <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
        </button>
        {pageItems.map(item => {
          if (item === 'dots-left' || item === 'dots-right') {
            return (
              <span key={item} className="thub-history-pagination__dots">…</span>
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
      <label className="admin-table-footer__pagesize thub-history-pagination__size">
        <span>Sahifada:</span>
        <select value={pageSize} onChange={e => onPageSizeChange(Number(e.target.value))}>
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
        </select>
      </label>
    </div>
  );
}
