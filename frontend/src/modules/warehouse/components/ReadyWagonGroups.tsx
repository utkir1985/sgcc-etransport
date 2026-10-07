import { useId, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown } from 'lucide-react';
import type { EmptyWagonUnit, LoadingTask } from '../../../shared/types';

type Card = { arrival: LoadingTask; unit: EmptyWagonUnit };
type SortField = 'date' | 'batch' | 'wagonNumber';

function wagonTypeLabel(unit: EmptyWagonUnit): string {
  if (unit.wagonType === 'platform') return 'Fiting platforma';
  if (unit.wagonType === 'covered') return 'Yopiq vagon';
  return 'Vagon-sisterna';
}

export function ReadyWagonGroups({
  cards,
  selectedIds,
  onSelect,
  isSelectable,
  renderActions,
  renderFlag,
  formatDate,
  sortField,
  sortOrder,
  onSort,
}: {
  cards: Card[];
  selectedIds: Set<string>;
  onSelect: (ids: string[], selected: boolean) => void;
  isSelectable: (unit: EmptyWagonUnit) => boolean;
  renderActions: (card: Card) => ReactNode;
  renderFlag: (unit: EmptyWagonUnit) => ReactNode;
  formatDate: (card: Card) => string;
  sortField: SortField | null;
  sortOrder: 'asc' | 'desc';
  onSort: (field: SortField) => void;
}) {
  const id = useId();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const map = new Map<string, { product: string; cards: Card[]; total: number }>();
    for (const card of cards) {
      const product = card.unit.productType?.trim() || card.arrival.productType?.trim() || 'Mahsulot tanlanmagan';
      const key = product.toLocaleLowerCase();
      const group = map.get(key) ?? { product, cards: [], total: 0 };
      group.total++;
      group.cards.push(card);
      map.set(key, group);
    }
    return [...map.entries()].filter(([, group]) => group.cards.length > 0);
  }, [cards]);

  return (
    <div className="space-y-4">

      {groups.length === 0 && (
        <div className="thub-empty" role="status">
          <p className="thub-empty__title">Vagon topilmadi</p>
          <p className="thub-empty__text">Boshqa vagon raqami, hujjat yoki mahsulotni kiriting.</p>
        </div>
      )}

      {/* Mahsulot guruhlari akkordeonlari */}
      {groups.map(([key, group], index) => {
        const open = !collapsed.has(key);
        const available = group.cards.filter(card => isSelectable(card.unit));
        const chosen = available.filter(card => selectedIds.has(card.unit.id)).length;
        const panelId = `${id}-group-${index}`;

        return (
          <section
            key={key}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 shadow-xs"
          >
            {/* Mahsulot sarlavhasi */}
            <div className="flex items-center gap-3 bg-sky-50/70 px-4 py-1 dark:bg-sky-950/30 border-b border-slate-200/80 dark:border-slate-700/80">
              <input
                type="checkbox"
                aria-label={`${group.product}: barcha vagonlarni tanlash`}
                checked={available.length > 0 && chosen === available.length}
                ref={element => {
                  if (element) element.indeterminate = chosen > 0 && chosen < available.length;
                }}
                disabled={!available.length}
                onChange={event => onSelect(available.map(card => card.unit.id), event.target.checked)}
                className="size-4 shrink-0 rounded border-slate-300 accent-blue-600 disabled:opacity-40"
              />
              <h3 className="min-w-0 flex-1">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => {
                    setCollapsed(current => {
                      const next = new Set(current);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    });
                  }}
                  className="flex w-full flex-wrap items-center gap-2.5 py-3 text-left focus-visible:outline-2 focus-visible:outline-blue-600 cursor-pointer"
                >
                  <ChevronDown
                    className={`size-4 shrink-0 text-sky-600 transition-transform duration-200 ${
                      open ? '' : '-rotate-90'
                    }`}
                  />
                  <span className="font-semibold text-slate-900 dark:text-slate-100 text-[15px]">
                    {group.product}
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-sky-700 border border-sky-200/70 dark:bg-slate-800 dark:text-sky-300 dark:border-slate-700">
                    {group.cards.length} ta
                  </span>
                  {chosen > 0 && (
                    <span className="ml-auto text-xs font-semibold text-blue-600 dark:text-blue-300">
                      {chosen} ta tanlandi
                    </span>
                  )}
                </button>
              </h3>
            </div>

            {/* Jadval — Yuklangan jadvali andozasidagi ustunlar va 14px matnlar */}
            <div id={panelId} hidden={!open}>
              <div className="thub-table-wrap reestr-table-wrap !max-h-none !overflow-y-visible">
                <table className="thub-table reestr-table reestr-table--compact docs-hub-table loading-wagons-table">
                  <thead>
                    <tr>
                      <th className="col-check !w-12 text-center">
                        <input
                          type="checkbox"
                          aria-label={`${group.product}: barcha vagonlarni tanlash`}
                          checked={available.length > 0 && chosen === available.length}
                          ref={element => {
                            if (element) element.indeterminate = chosen > 0 && chosen < available.length;
                          }}
                          disabled={!available.length}
                          onChange={event => onSelect(available.map(card => card.unit.id), event.target.checked)}
                          className="size-4 rounded border-slate-300 accent-blue-600 cursor-pointer disabled:opacity-40"
                        />
                      </th>
                      <th className="col-num !w-14 text-center">№</th>
                      <th
                        className="whitespace-nowrap px-3 cursor-pointer select-none hover:text-blue-600 transition-colors text-center"
                        onClick={() => onSort('date')}
                        title="Sana va vaqt bo‘yicha tartiblash"
                      >
                        <span className="inline-flex items-center justify-center gap-1">
                          <span>Sana / vaqt</span>
                          {sortField === 'date' ? (
                            sortOrder === 'asc' ? (
                              <ArrowUp className="size-3.5 text-blue-600 dark:text-blue-400" />
                            ) : (
                              <ArrowDown className="size-3.5 text-blue-600 dark:text-blue-400" />
                            )
                          ) : (
                            <ArrowUpDown className="size-3.5 text-slate-400 opacity-60" />
                          )}
                        </span>
                      </th>
                      <th
                        className="whitespace-nowrap px-3 cursor-pointer select-none hover:text-blue-600 transition-colors text-center"
                        onClick={() => onSort('batch')}
                        title="Hujjat raqami bo‘yicha tartiblash"
                      >
                        <span className="inline-flex items-center justify-center gap-1">
                          <span>Hujjat raqami</span>
                          {sortField === 'batch' ? (
                            sortOrder === 'asc' ? (
                              <ArrowUp className="size-3.5 text-blue-600 dark:text-blue-400" />
                            ) : (
                              <ArrowDown className="size-3.5 text-blue-600 dark:text-blue-400" />
                            )
                          ) : (
                            <ArrowUpDown className="size-3.5 text-slate-400 opacity-60" />
                          )}
                        </span>
                      </th>
                      <th
                        className="whitespace-nowrap px-3 cursor-pointer select-none hover:text-blue-600 transition-colors text-center"
                        onClick={() => onSort('wagonNumber')}
                        title="Vagon raqami bo‘yicha tartiblash"
                      >
                        <span className="inline-flex items-center justify-center gap-1">
                          <span>Vagon raqami</span>
                          {sortField === 'wagonNumber' ? (
                            sortOrder === 'asc' ? (
                              <ArrowUp className="size-3.5 text-blue-600 dark:text-blue-400" />
                            ) : (
                              <ArrowDown className="size-3.5 text-blue-600 dark:text-blue-400" />
                            )
                          ) : (
                            <ArrowUpDown className="size-3.5 text-slate-400 opacity-60" />
                          )}
                        </span>
                      </th>
                      <th className="whitespace-nowrap px-3 text-center">Vagon turi</th>
                      <th className="col-weight !w-20 whitespace-nowrap text-center">Tara, t</th>
                      <th className="whitespace-nowrap px-4 text-center">Amallar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.cards.map((card, idx) => (
                      <tr key={card.unit.id}>
                        <td className="col-check !w-12 text-center">
                          {isSelectable(card.unit) ? (
                            <input
                              type="checkbox"
                              aria-label={`${card.unit.wagonNumber} vagonini tanlash`}
                              checked={selectedIds.has(card.unit.id)}
                              onChange={event => onSelect([card.unit.id], event.target.checked)}
                              className="size-4 rounded border-slate-300 accent-blue-600 cursor-pointer"
                            />
                          ) : null}
                        </td>
                        <td className="col-num thub-mono reestr-num !w-14 text-center text-[14px]">
                          {idx + 1}
                        </td>
                        <td className="whitespace-nowrap tabular-nums px-3 text-slate-600 dark:text-slate-300 text-[14px] text-center">
                          {formatDate(card)}
                        </td>
                        <td className="whitespace-nowrap px-3 text-center">
                          {card.arrival.arrivalNumber ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[13px] font-semibold font-mono bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">
                              {card.arrival.arrivalNumber}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[14px]">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 text-center">
                          <span className="thub-table__code font-mono font-bold text-slate-900 dark:text-white text-[14px]">
                            {card.unit.wagonNumber}
                          </span>
                          {renderFlag(card.unit)}
                        </td>
                        <td className="whitespace-nowrap px-3 text-slate-700 dark:text-slate-300 text-[14px] text-center">
                          {wagonTypeLabel(card.unit)}
                        </td>
                        <td className="col-weight !w-20 tabular-nums text-slate-700 dark:text-slate-200 text-[14px] text-center">
                          {card.unit.tareWeight || '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 text-center">
                          {renderActions(card)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
