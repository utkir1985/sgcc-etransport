import { isWagonKind, WAGON_KIND_LABEL, type WagonKind } from '../utils/wagonKinds';

export type PartySummaryRow = {
  wagonType: WagonKind | '';
  productType: string;
  isDefective?: boolean;
};

const KIND_ORDER: WagonKind[] = ['sisterna', 'closed', 'platform'];

function kindStatsFromRows(rows: PartySummaryRow[]) {
  const stats: Record<WagonKind | 'unknown', number> = {
    sisterna: 0,
    closed: 0,
    platform: 0,
    unknown: 0,
  };
  for (const row of rows) {
    if (row.wagonType) stats[row.wagonType] += 1;
    else stats.unknown += 1;
  }
  return stats;
}

/** Vagon partiyasi jadvallari uchun yagona, kesilmaydigan qisqa ko'rinish. */
export function PartyProductsSummary({ rows }: { rows: PartySummaryRow[] }) {
  const healthyRows = rows.filter(row => !row.isDefective);
  const defectiveCount = rows.filter(row => row.isDefective).length;

  const productNames = [...new Set(healthyRows.map(row => row.productType?.trim()).filter(Boolean) as string[])];
  const noProductCount = healthyRows.filter(row => !row.productType?.trim()).length;

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-sm leading-5 text-slate-700 dark:text-slate-200">
      {productNames.map((name, index) => (
        <span key={name} className="whitespace-nowrap font-medium">
          {name}{' '}
          <b className="font-semibold tabular-nums text-violet-600 dark:text-violet-300">
            ({healthyRows.filter(row => row.productType?.trim() === name).length})
          </b>
          {index < productNames.length - 1 || noProductCount > 0 || defectiveCount > 0 ? (
            <span className="ml-1.5 text-slate-300 dark:text-slate-600">•</span>
          ) : null}
        </span>
      ))}
      {noProductCount > 0 ? (
        <span className="whitespace-nowrap font-medium text-amber-700 dark:text-amber-300">
          Mahsulotsiz <b>({noProductCount})</b>
          {defectiveCount > 0 ? <span className="ml-1.5 text-slate-300 dark:text-slate-600">•</span> : null}
        </span>
      ) : null}
      {defectiveCount > 0 ? (
        <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300 shadow-xs whitespace-nowrap">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
          Nomuvofiq <b>({defectiveCount})</b>
        </span>
      ) : null}
    </div>
  );
}

export function PartyWagonKindsSummary({ rows }: { rows: PartySummaryRow[] }) {
  const stats = kindStatsFromRows(rows);
  const kinds = KIND_ORDER.filter(kind => stats[kind] > 0);

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-sm leading-5 text-slate-700 dark:text-slate-200">
      {kinds.map((kind, index) => (
        <span key={kind} className="inline-flex whitespace-nowrap items-center gap-1 font-medium">
          {WAGON_KIND_LABEL[kind]}{' '}
          <b className="font-semibold tabular-nums text-slate-900 dark:text-slate-50">({stats[kind]})</b>
          {index < kinds.length - 1 || stats.unknown > 0 ? (
            <span className="ml-1.5 text-slate-300 dark:text-slate-600">•</span>
          ) : null}
        </span>
      ))}
      {stats.unknown > 0 ? (
        <span className="whitespace-nowrap font-medium text-slate-500 dark:text-slate-400">
          Noma&apos;lum <b>({stats.unknown})</b>
        </span>
      ) : null}
    </div>
  );
}

export function partySummaryRowsFromWagons(
  rows: Array<{
    wagonType?: string | null;
    product?: string | null;
    productType?: string | null;
    status?: string | null;
    isDefective?: boolean | null;
    defectActNumber?: string | null;
    defectActFileName?: string | null;
  }>,
): PartySummaryRow[] {
  return rows.map(row => ({
    wagonType: isWagonKind(row.wagonType) ? row.wagonType : '',
    productType: (row.productType || row.product || '').trim(),
    isDefective: Boolean(row.isDefective || row.status === 'Returned' || row.defectActNumber || row.defectActFileName),
  }));
}
