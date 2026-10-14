import { TablePagination } from './TablePagination';

interface DocsHubPaginationProps {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  unitLabel?: string;
}

/** Hujjatlar hub'lari uchun pagination — umumiy {@link TablePagination} andozasida. */
export function DocsHubPagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  unitLabel = 'yozuv',
}: DocsHubPaginationProps) {
  if (total === 0) return null;

  return (
    <TablePagination
      total={total}
      page={page}
      pageSize={pageSize}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      unitLabel={unitLabel}
      pageSizeOptions={[10, 20, 50]}
    />
  );
}
