import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, FileSpreadsheet, ListTree, X } from 'lucide-react';
import { TablePagination } from '../../../shared/components/TablePagination';
import { exportSheet, todayStamp } from '../../../shared/utils/excelExport';

export interface DrillColumn {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
}

export interface DrillRow {
  id: string;
  cells: Record<string, string | number>;
  /** Bosilganda ochiladigan sahifa (buyurtma, yuk xati, partiya) */
  href?: string;
}

export interface DrillState {
  title: string;
  subtitle?: string;
  columns: DrillColumn[];
  rows: DrillRow[];
}

/** Diagramma bo‘lagi bosilganda pastda ochiladigan tafsilot jadvali. */
export function StatsDrillTable({ drill, onClose }: { drill: DrillState; onClose: () => void }) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  useEffect(() => { setPage(1); }, [drill]);

  const totalPages = Math.max(1, Math.ceil(drill.rows.length / pageSize));
  const current = Math.min(page, totalPages);
  const rows = useMemo(() => drill.rows.slice((current - 1) * pageSize, current * pageSize), [drill.rows, current, pageSize]);

  const exportExcel = () => {
    exportSheet(`Tafsilot_${todayStamp()}`, drill.title.slice(0, 31), [
      drill.columns.map(c => c.label),
      ...drill.rows.map(r => drill.columns.map(c => r.cells[c.key] ?? '')),
    ]);
  };

  return (
    <section className="stat-drill" id="stat-drill">
      <header className="stat-drill__head">
        <span className="stat-drill__icon"><ListTree className="w-4 h-4" /></span>
        <div className="min-w-0">
          <h3>{drill.title}</h3>
          <p>{drill.subtitle ? `${drill.subtitle} · ` : ''}{drill.rows.length} ta yozuv</p>
        </div>
        <div className="stat-drill__actions">
          <button type="button" className="btn-secondary inline-flex items-center gap-1.5" onClick={exportExcel} disabled={drill.rows.length === 0}>
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Excel
          </button>
          <button type="button" className="stat-drill__close" onClick={onClose} aria-label="Yopish">
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>
      {drill.rows.length === 0 ? <div className="stat-empty">Yozuv topilmadi</div> : (
        <>
          <div className="thub-table-wrap reestr-table-wrap">
            <table className="thub-table reestr-table plan-table stat-drill__table w-full">
              <thead>
                <tr>
                  <th className="plan-c">№</th>
                  {drill.columns.map(c => <th key={c.key} className={c.align === 'right' ? 'plan-r' : c.align === 'center' ? 'plan-c' : 'plan-l'}>{c.label}</th>)}
                  <th aria-label="Ochish" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className={r.href ? 'plan-row--link' : undefined} onClick={r.href ? () => navigate(r.href!) : undefined}>
                    <td className="plan-c text-slate-500 tabular-nums">{(current - 1) * pageSize + i + 1}</td>
                    {drill.columns.map(c => (
                      <td key={c.key} className={`${c.align === 'right' ? 'plan-r tabular-nums' : c.align === 'center' ? 'plan-c' : 'plan-l'}`}>
                        {r.cells[c.key] ?? '—'}
                      </td>
                    ))}
                    <td className="plan-c">{r.href ? <ArrowUpRight className="w-4 h-4 text-slate-400" /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination total={drill.rows.length} page={current} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} unitLabel="yozuv" />
        </>
      )}
    </section>
  );
}
