import { useEffect, useMemo, useState } from 'react';
import { exportSheet, todayStamp } from '../../../shared/utils/excelExport';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle, AlertTriangle, ArrowDownToLine,
  Clock, FileText, PackageCheck, RotateCw, Scale, Search,
  TrainFront, X, FileSpreadsheet,
} from 'lucide-react';
import { api } from '../../../shared/services/api';
import type { EmptyWagonArrival, LoadingRegistry } from '../../../shared/types';
import { normalizeWagonOwnership, WAGON_OWNERSHIP } from '../../../shared/constants/wagonOwnership';
import { subscribeOrdersChanged } from '../../../shared/utils/realtimeSync';
import { formatDateDisplay } from '../../../shared/utils/dates';
import { ProductTypeFilter } from '../../../shared/components/ProductTypeFilter';
import { DocsHubPagination } from '../../../shared/components/DocsHubPagination';
import { useDocsHubQuery } from '../../../shared/hooks/useDocsHubQuery';
import {
  docsDateKey,
  docsMatchesSearch,
  paginateItems,
} from '../../../shared/utils/docsHubFilter';
import {
  buildDefectiveFlowRows,
  buildReadyToExitFlowRows,
  buildTaredFlowRows,
  buildLoadingFlowRows,
  buildLoadedFlowRows,
  kindLabel,
  resolveWagonKind,
  type TransportFlowRow,
} from '../utils/transportHub';

type ZoneId = 'tared' | 'loading' | 'loaded' | 'ready' | 'entered' | 'defective';

const ZONE_META: Array<{
  id: ZoneId;
  search: string;
  title: string;
  description: string;
  icon: typeof AlertCircle;
  emptyTitle: string;
  emptyText: string;
}> = [
  {
    id: 'tared',
    search: 'Partiya, mahsulot, vagon…',
    title: 'Yuklashga tayyor vagonlar',
    description: 'Tarasi o‘lchangan, yuklashga tayyor bo‘sh vagonlar',
    icon: Scale,
    emptyTitle: 'Yuklashga tayyor vagon yo‘q',
    emptyText: 'Hozir yuklashga tayyor bo‘sh vagon yo‘q.',
  },
  {
    id: 'loading',
    search: 'Vagon, partiya, mahsulot…',
    title: 'Yuklanayotgan vagonlar',
    description: 'Estakadada mahsulot quyish jarayonidagi vagonlar',
    icon: Clock,
    emptyTitle: 'Yuklanayotgan vagon yo‘q',
    emptyText: 'Hozir estakadada yuklanayotgan vagon yo‘q.',
  },
  {
    id: 'loaded',
    search: 'Vagon, partiya, mahsulot…',
    title: 'Yuklangan vagonlar',
    description: 'Yuklash tugagan; brutto/netto va plomba jarayonidagi vagonlar',
    icon: PackageCheck,
    emptyTitle: 'Yuklangan vagon yo‘q',
    emptyText: 'Hozir estakadadan chiqqan vagon yo‘q.',
  },
  {
    id: 'ready',
    search: 'Vagon, partiya, plomba, mahsulot…',
    title: 'Chiqishga tayyor vagonlar',
    description: 'Yuklangan, tarozidan o‘tgan va jo‘natishga tayyor vagonlar monitoringi',
    icon: TrainFront,
    emptyTitle: 'Chiqishga tayyor vagon yo‘q',
    emptyText: 'Hozir jo‘natishga tayyor vagonlar mavjud emas.',
  },
  {
    id: 'defective',
    search: 'Nosozlik sababi, vagon, partiya…',
    title: 'Nosoz vagonlar',
    description: 'Kirishda yoki jarayonda nuqson aniqlangan vagonlar',
    icon: AlertTriangle,
    emptyTitle: 'Nosoz vagon yo‘q',
    emptyText: 'Ayni paytda shikoyat yoki kamchilik qayd etilmagan.',
  },
  {
    id: 'entered',
    search: 'Partiya, mahsulot, vagon…',
    title: 'Majmuaga kirgan vagonlar',
    description: 'Zavod hududiga kirib kelgan, tara tortilgan vagonlar',
    icon: ArrowDownToLine,
    emptyTitle: 'Kirgan vagon yo‘q',
    emptyText: 'Hozir hududda faol vagon yo‘q.',
  },
];

function parseZone(raw?: string): ZoneId {
  if (raw === 'tared' || raw === 'scale' || raw === 'tara') return 'tared';
  if (raw === 'loading' || raw === 'estakada') return 'loading';
  if (raw === 'loaded' || raw === 'yuklangan') return 'loaded';
  if (raw === 'ready' || raw === 'dispatched' || raw === 'outgoing') return 'ready';
  if (raw === 'defective' || raw === 'kamchilik' || raw === 'nosoz') return 'defective';
  if (raw === 'entered' || raw === 'incoming') return 'tared';
  return 'tared';
}

function fmtStamp(iso?: string | null): string {
  const key = docsDateKey(iso);
  const day = (key && formatDateDisplay(key)) || '';
  if (!day) return '—';
  if (!iso || /^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) return day;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return day;
  const time = date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tashkent',
  });
  return time && time !== '00:00' ? `${day} ${time}` : day;
}

export default function TransportVehiclesPage() {
  const { zone: zoneParam } = useParams<{ zone?: string }>();
  const navigate = useNavigate();
  const zone = parseZone(zoneParam);

  const [arrivals, setArrivals] = useState<EmptyWagonArrival[]>([]);
  const [registries, setRegistries] = useState<LoadingRegistry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const hub = useDocsHubQuery();

  useEffect(() => {
    if (zoneParam && zoneParam !== zone) {
      navigate(`/transport/${zone}`, { replace: true });
    }
  }, [zone, zoneParam, navigate]);

  const load = (silent = false) => {
    if (!silent) setLoading(true);
    if (!silent) setLoadError('');
    Promise.all([
      api.getEmptyWagonArrivals(),
      api.getLoadingRegistries(),
    ])
      .then(([a, r]) => {
        setArrivals(a.data ?? []);
        setRegistries(r.data ?? []);
      })
      .catch(() => {
        if (!silent) {
          setArrivals([]);
          setRegistries([]);
          setLoadError('Transport ma’lumotlarini yuklab bo‘lmadi. Internet yoki server holatini tekshirib, qayta urinib ko‘ring.');
        }
      })
      .finally(() => {
        if (!silent) setLoading(false);
      });
  };

  useEffect(() => {
    load();
    return subscribeOrdersChanged(() => load(true));
  }, []);

  useEffect(() => {
    hub.setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone]);

  const taredRows = useMemo(() => buildTaredFlowRows(arrivals, registries), [arrivals, registries]);
  const loadingRowsAll = useMemo(() => buildLoadingFlowRows(arrivals, registries), [arrivals, registries]);
  const loadedRows = useMemo(() => buildLoadedFlowRows(arrivals, registries), [arrivals, registries]);
  const readyRows = useMemo(() => buildReadyToExitFlowRows(arrivals, registries), [arrivals, registries]);
  const defectiveRows = useMemo(() => buildDefectiveFlowRows(arrivals), [arrivals]);

  const byZone: Record<ZoneId, TransportFlowRow[]> = {
    tared: taredRows,
    loading: loadingRowsAll,
    loaded: loadedRows,
    ready: readyRows,
    entered: taredRows,
    defective: defectiveRows,
  };

  const rawSourceRows = byZone[zone] || [];
  const sourceRows = useMemo(() => {
    if (!hub.product) return rawSourceRows;
    return rawSourceRows.filter(r => (r.product || '').trim() === hub.product.trim());
  }, [rawSourceRows, hub.product]);

  const productOptions = useMemo(() => {
    const set = new Set<string>();
    rawSourceRows.forEach(r => {
      const p = (r.product || '').trim();
      if (p) set.add(p);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'uz')).map(p => ({ value: p, label: p }));
  }, [rawSourceRows]);

  const filteredRows = useMemo(() => {
    return sourceRows.filter(r => {
      if (!hub.search) return true;
      return (
        docsMatchesSearch(hub.search, r.wagonNumber) ||
        docsMatchesSearch(hub.search, r.cisternNumber || '') ||
        docsMatchesSearch(hub.search, r.arrivalNumber) ||
        docsMatchesSearch(hub.search, r.product) ||
        docsMatchesSearch(hub.search, r.sealNumber || '') ||
        docsMatchesSearch(hub.search, r.issue || '')
      );
    });
  }, [sourceRows, hub.search]);

  const paged = useMemo(
    () => paginateItems(filteredRows, hub.page, hub.pageSize),
    [filteredRows, hub.page, hub.pageSize],
  );

  /** Filtr va qidiruv qo'llangan barcha qatorlar Excelga chiqadi (faqat joriy sahifa emas). */
  const exportExcel = () => {
    exportSheet(`vagonlar_${zone}_${todayStamp()}.xlsx`, meta.title.slice(0, 31), [
      ['Majmuadagi vagonlar', meta.title],
      [],
      ['№', 'Hujjat raqami', 'Vagon', 'Sisterna', 'Vagon turi', 'Mahsulot', 'Tegishlilik', 'Holat', 'Nosozlik tafsiloti', 'Vaqt'],
      ...filteredRows.map((row, index) => [
        index + 1,
        row.arrivalNumber || '—',
        row.wagonNumber,
        row.cisternNumber || '',
        kindLabel(resolveWagonKind(row.wagonKind)),
        row.product || '—',
        normalizeWagonOwnership(row.ownership) === WAGON_OWNERSHIP.Majmua ? 'Majmuaga tegishli' : 'Tashqi vagon',
        row.isDefective ? 'Nomuvofiq' : row.stage,
        row.issue || '',
        fmtStamp(row.at),
      ]),
    ]);
  };

  const zoneStats = useMemo(() => {
    const total = filteredRows.length;
    const majmua = filteredRows.filter(
      r => normalizeWagonOwnership(r.ownership) === WAGON_OWNERSHIP.Majmua,
    ).length;
    const tashqi = total - majmua;
    return { total, majmua, tashqi };
  }, [filteredRows]);

  const meta = ZONE_META.find(item => item.id === zone) ?? ZONE_META[0];
  const ZoneIcon = meta.icon;
  const filtersActive = Boolean(hub.search || hub.product);
  const clearFilters = () => {
    hub.setSearch('');
    hub.setProduct('');
  };

  return (
    <div className="thub reestr tvhub">
      <section className="thub__main reestr-main">
        <header className={'tvhub-pagehead tvhub-pagehead--' + zone}>
          <span className="tvhub-pagehead__icon" aria-hidden><ZoneIcon /></span>
          <div className="tvhub-pagehead__copy">
            <h1>{meta.title}</h1>
            <p>{meta.description}</p>
          </div>
          <div className="tvhub-pagehead__live">
            <span><i /> Jonli holat</span>
            <strong>{loading ? '—' : sourceRows.length}</strong>
            <small>ta vagon</small>
          </div>
        </header>

        <div className="docs-panel">
          <div className="tvhub-toolbar">
            <label className="thub-search tvhub-toolbar__search">
              <Search className="thub-search__ico" strokeWidth={1.75} />
              <input
                value={hub.search}
                onChange={event => hub.setSearch(event.target.value)}
                placeholder={meta.search}
                aria-label="Vagonlarni qidirish"
              />
              {hub.search ? (
                <button type="button" className="thub-search__x" onClick={() => hub.setSearch('')} aria-label="Qidiruvni tozalash">
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </label>

            <ProductTypeFilter
              value={hub.product}
              options={productOptions}
              onChange={hub.setProduct}
              fieldLabel=""
              emptyLabel="Barcha mahsulotlar"
              disabled={productOptions.length === 0}
              className="tvhub-product-filter"
            />

            <div className="tvhub-toolbar__actions">
              {filtersActive ? (
                <button type="button" className="tvhub-toolbar__clear" onClick={clearFilters}>
                  <X className="h-3.5 w-3.5" aria-hidden />
                  Tozalash
                </button>
              ) : null}
              <span className="tvhub-toolbar__result" aria-live="polite">
                {filteredRows.length} / {sourceRows.length} vagon
              </span>
              <button
                type="button"
                className="tvhub-toolbar__refresh"
                onClick={() => load()}
                disabled={loading}
                title="Ma’lumotlarni yangilash"
                aria-label="Ma’lumotlarni yangilash"
              >
                <RotateCw className={loading ? 'is-spinning' : ''} aria-hidden />
              </button>
            </div>
          </div>

          <div className="thub__board">
            {loading ? (
              <div className="tvhub-skeleton" aria-label="Ma’lumotlar yuklanmoqda" aria-busy="true">
                <div className="tvhub-skeleton__summary" />
                <div className="tvhub-skeleton__head" />
                {Array.from({ length: 8 }, (_, index) => (
                  <div className="tvhub-skeleton__row" key={index} />
                ))}
              </div>
            ) : loadError ? (
              <div className="thub-empty tvhub-error" role="alert">
                <span className="tvhub-error__icon"><AlertCircle aria-hidden /></span>
                <p className="thub-empty__title">Ma’lumotlarni olib bo‘lmadi</p>
                <p className="thub-empty__text">{loadError}</p>
                <button type="button" className="btn-secondary tvhub-error__retry" onClick={() => load()}>
                  <RotateCw className="h-4 w-4" aria-hidden />
                  Qayta urinish
                </button>
              </div>
            ) : rawSourceRows.length === 0 ? (
              <div className="thub-empty tvhub-empty">
                <span className="tvhub-empty__icon"><ZoneIcon aria-hidden /></span>
                <p className="thub-empty__title">{meta.emptyTitle}</p>
                <p className="thub-empty__text">{meta.emptyText}</p>
                <span className="tvhub-empty__live"><i /> Ma’lumotlar avtomatik yangilanadi</span>
              </div>
            ) : (
              /* =========================================================================
               * ODATIY JADVAL: BARCHA ZONALAR UCHUN (TARED, LOADING, LOADED, READY, DEFECTIVE)
               * ========================================================================= */
              <div className="thub-table-wrap reestr-table-wrap">
                <div className="tvhub-table-summary flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 dark:text-slate-400">Jami:</span>
                      <strong className="font-extrabold text-gray-900 dark:text-slate-100">{zoneStats.total} ta vagon</strong>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 font-bold border border-blue-200/80 dark:border-blue-800/60 shadow-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        Majmua: {zoneStats.majmua} ta
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-bold border border-amber-200/80 dark:border-amber-800/60 shadow-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        Tashqi: {zoneStats.tashqi} ta
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    className="btn-secondary !text-xs !py-1.5 !px-3.5 flex items-center gap-1.5"
                    onClick={exportExcel}
                    disabled={filteredRows.length === 0}
                    title="Ushbu bo‘limdagi barcha vagonlarni Excel fayliga yuklash"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Excel yuklash</span>
                  </button>
                  {zone === 'ready' && (
                    <button
                      type="button"
                      onClick={() => navigate('/registry/create')}
                      className="btn-primary !text-xs !py-1.5 !px-3.5 flex items-center gap-2 shadow-xs cursor-pointer"
                      title="Yuk xatini shakllantirish bo‘limiga o‘tish"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Yuk xati shakllantirishga o‘tish</span>
                    </button>
                  )}
                  </div>
                </div>

                <table className="thub-table reestr-table docs-hub-table tvhub-table">
                  <thead>
                    <tr>
                      <th>№</th>
                      <th>Hujjat raqami</th>
                      <th>Vagon</th>
                      {zone !== 'defective' ? <th>Vagon turi</th> : null}
                      <th>Mahsulot</th>
                      {zone !== 'defective' ? <th>Tegishlilik</th> : null}
                      <th>Holat</th>
                      {zone === 'defective' ? <th>Nosozlik tafsiloti</th> : null}
                      <th>Vaqt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.slice.map(((row, index) => {
                      const rowNumber = (paged.page - 1) * hub.pageSize + index + 1;
                      const ownership = normalizeWagonOwnership(row.ownership);
                      const isMajmua = ownership === WAGON_OWNERSHIP.Majmua;
                      const kind = resolveWagonKind(row.wagonKind);

                      return (
                        <tr key={row.id}>
                          <td className="thub-row-num">{rowNumber}</td>
                          <td className="thub-mono font-semibold">{row.arrivalNumber || '—'}</td>
                          <td>
                            <div className="tvhub-wagon-cell">
                              <span className="tvhub-wagon-num">{row.wagonNumber}</span>
                              {row.cisternNumber ? (
                                <span className="tvhub-cistern-num">/ {row.cisternNumber}</span>
                              ) : null}
                            </div>
                          </td>
                          {zone !== 'defective' ? (
                            <td>
                              <span className="thub-chip thub-chip--kind">{kindLabel(kind)}</span>
                            </td>
                          ) : null}
                          <td>{row.product || '—'}</td>
                          {zone !== 'defective' ? (
                            <td>
                              {row.ownership ? (
                                <span className={`thub-chip thub-chip--ownership thub-chip--ownership-${ownership}`}>
                                  {isMajmua ? (
                                    <span className="inline-flex items-center gap-1 font-bold text-blue-700 dark:text-blue-300">
                                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                      Majmuaga tegishli
                                    </span>
                                  ) : (
                                    <span className="text-amber-800 dark:text-amber-300">
                                      Tashqi vagon
                                    </span>
                                  )}
                                </span>
                              ) : '—'}
                            </td>
                          ) : null}
                          <td>
                            {row.isDefective ? (
                              <span className="thub-chip thub-chip--stage bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800">
                                Nomuvofiq
                              </span>
                            ) : (
                              <span className={"thub-chip thub-chip--stage tvhub-stage tvhub-stage--" + zone}>{row.stage}</span>
                            )}
                          </td>
                          {zone === 'defective' ? (
                            <td className="reestr-notes" title={row.issue}>{row.issue || '—'}</td>
                          ) : null}
                          <td className="thub-mono whitespace-nowrap">{fmtStamp(row.at)}</td>
                        </tr>
                      );
                    }))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <DocsHubPagination
            total={filteredRows.length}
            page={paged.page}
            pageSize={hub.pageSize}
            onPageChange={hub.setPage}
            onPageSizeChange={hub.setPageSize}
            unitLabel="vagon"
          />
        </div>
      </section>
    </div>
  );
}
