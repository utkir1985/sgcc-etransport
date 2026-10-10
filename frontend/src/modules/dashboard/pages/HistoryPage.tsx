import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ClipboardList,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  History,
  PackageCheck,
  Search,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import { api } from '../../../shared/services/api';
import type { EmptyWagonArrival, LoadingRegistry } from '../../../shared/types';
import { DatePicker } from '../../../shared/components/DatePicker';
import { HubZoneTabs, type HubZoneTone } from '../../../shared/components/HubZoneTabs';
import { ReportsHistoryTabs } from '../components/ReportsHistoryTabs';
import { isOneCArrival } from '../../../shared/utils/oneCSources';
import { subscribeOrdersChanged } from '../../../shared/utils/realtimeSync';
import { exportSheet, todayStamp } from '../../../shared/utils/excelExport';
import {
  buildHistoryTimeline,
  loadedWagonCountOf,
  localDateKey,
  productTitle,
  registryWagonCountOf,
  wagonCountOf,
} from '../utils/sharedPanels';
import {
  DOCS_PERIOD_PRESETS,
  docsPeriodRange,
  type DocsPeriodPreset,
} from '../../../shared/utils/docsHubFilter';
import { parseIsoDate } from '../../../shared/utils/dates';

type Tab = 'timeline' | 'entries' | 'orders' | 'loads' | 'exits' | 'defects';
type PeriodPreset = DocsPeriodPreset;

function parseHistoryTab(value: string | null): Tab {
  return value === 'entries' || value === 'orders' || value === 'loads' || value === 'exits' || value === 'defects'
    ? value
    : 'timeline';
}

function parseHistoryPeriod(value: string | null): Exclude<PeriodPreset, 'custom'> {
  return value === 'today' || value === 'week' || value === 'month' ? value : 'all';
}

function fmtShort(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Tashkent',
  }).formatToParts(d);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || '';
  return `${value('day')}.${value('month')}.${value('year')} ${value('hour')}:${value('minute')}`;
}

function buildPageItems(currentPage: number, totalPages: number): Array<number | 'dots-left' | 'dots-right'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, 'dots-right', totalPages];
  }

  if (currentPage >= totalPages - 3) {
    return [1, 'dots-left', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, 'dots-left', currentPage - 1, currentPage, currentPage + 1, 'dots-right', totalPages];
}

function WagonsGrid({ wagons, partyTitle }: { wagons: string[]; partyTitle?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(wagons.join(', '));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="hist-wagons-card">
      <div className="hist-wagons-card__header">
        <div className="flex items-center gap-2">
          <span className="hist-wagons-card__title">
            Vagonlar ro‘yxati:
          </span>
          <span className="hist-wagons-card__count">
            {wagons.length} ta vagon
          </span>
          {partyTitle && (
            <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
              ({partyTitle})
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="hist-wagons-card__copy-btn"
          title="Barcha vagon raqamlarini nusxalash"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">Nusxalandi!</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
              <span>Nusxalash</span>
            </>
          )}
        </button>
      </div>

      <div className="hist-wagons-grid">
        {wagons.map((wagon, idx) => (
          <div key={wagon + idx} className="hist-wagon-item" title={`Vagon № ${wagon}`}>
            <span className="hist-wagon-item__index">
              {String(idx + 1).padStart(2, '0')}
            </span>
            <span className="hist-wagon-item__number font-mono">
              {wagon}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Tarix qatorining jarayon nomi — jadval va Excel uchun bir xil. */
function processLabel(item: { kind: string; detail: string; documentNumber?: string; stageName?: string }): string {
  if (item.stageName) return item.stageName;
  if (item.kind === 'entry') return 'Kirish';
  if (item.kind === 'order') return 'Buyurtma';
  if (item.kind === 'load') return 'Yuklash';
  if (item.kind === 'exit') return 'Chiqish';
  if (/qaytar/i.test(item.detail)) return 'Qaytarish';
  if (item.documentNumber || /dalolatnoma/i.test(item.detail)) return 'Dalolatnoma';
  return 'Nomuvofiqlik';
}

export default function HistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = parseHistoryTab(searchParams.get('tab'));
  const requestedPeriod = parseHistoryPeriod(searchParams.get('period'));
  const initialPeriod = docsPeriodRange(requestedPeriod);
  // Statistikadan "Jarayonlar tarixida ko'rish" orqali kelganda aynan o'sha davr
  // (Dan/Gacha) ochilishi uchun — bo'lsa, davr tugmalaridan ustun turadi.
  const requestedFrom = searchParams.get('from') || '';
  const requestedTo = searchParams.get('to') || '';
  const hasCustomRange = Boolean(parseIsoDate(requestedFrom) || parseIsoDate(requestedTo));
  const [tab, setTab] = useState<Tab>(() => requestedTab);
  const [search, setSearch] = useState('');
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>(() => hasCustomRange ? 'custom' : requestedPeriod);
  const [from, setFrom] = useState(() => hasCustomRange ? requestedFrom : initialPeriod.from);
  const [to, setTo] = useState(() => hasCustomRange ? requestedTo : initialPeriod.to);
  const skipNextPeriodReset = useRef(hasCustomRange);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [arrivals, setArrivals] = useState<EmptyWagonArrival[]>([]);
  const [registries, setRegistries] = useState<LoadingRegistry[]>([]);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const load = (silent = false) => {
    if (!silent) setLoading(true);
    // Ulanish xatosi bo‘sh tarix ko‘rinishida yashirilmasligi kerak: operator «yozuv yo‘q»
    // bilan «ma’lumot olinmadi»ni ajrata olishi shart, avvalgi ma’lumot esa saqlanadi.
    Promise.all([api.getEmptyWagonArrivals(), api.getLoadingRegistries()])
      .then(([a, r]) => {
        setArrivals(a.data ?? []);
        setRegistries(r.data ?? []);
        setLoadError('');
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : 'Ma’lumotlarni serverdan olishda xatolik');
      })
      .finally(() => {
        if (!silent) setLoading(false);
      });
  };

  useEffect(() => {
    load();
    return subscribeOrdersChanged(() => load(true));
  }, []);

  const inDateRange = (iso?: string | null) => {
    if (!iso) return false;
    const key = localDateKey(iso);
    if (from && key < from) return false;
    if (to && key > to) return false;
    return true;
  };

  const entries = useMemo(
    () => arrivals.filter(a => !a.arrivalNumber?.startsWith('1C-') && !isOneCArrival(a)),
    [arrivals],
  );

  const completedLoads = useMemo(
    () =>
      arrivals.filter(a => !a.arrivalNumber?.startsWith('1C-') && !isOneCArrival(a) && !!a.loadingCompletedAt && loadedWagonCountOf(a) > 0),
    [arrivals],
  );

  const exits = useMemo(() => {
    const arrivalById = new Map(arrivals.map(a => [a.id, a]));
    return registries
      .filter(r => r.exitedToKengsoyAt && !(r.registryNumber || '').includes('-1C-'))
      .map(r => ({ registry: r, arrival: arrivalById.get(r.emptyWagonArrivalId) }))
      .filter(x => !(x.arrival && (isOneCArrival(x.arrival) || x.arrival.arrivalNumber?.startsWith('1C-'))));
  }, [arrivals, registries]);

  const timeline = useMemo(() => buildHistoryTimeline(arrivals, registries), [arrivals, registries]);

  const q = search.trim().toLowerCase();

  const filteredTimeline = useMemo(
    () =>
      timeline.filter(item => {
        if (!inDateRange(item.at)) return false;
        if (!q) return true;
        return [
          item.title,
          item.detail,
          item.summary,
          item.productLabel,
          item.issueArea,
          item.reason,
          item.documentNumber,
          item.actor,
          item.stageName,
          item.department,
          item.statusBadge,
          item.extraInfo,
          ...(item.subEvents?.flatMap(e => [e.stage, e.summary, e.actor, e.documentNumber || '', e.documentFileName || '']) || []),
          ...item.wagonNumbers,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q);
      }),
    [timeline, q, from, to],
  );

  const filteredDefects = useMemo(
    () => filteredTimeline.filter(item => item.kind === 'defect'),
    [filteredTimeline],
  );

  const totalDefectRecords = useMemo(
    () => filteredDefects.reduce((acc, d) => acc + (d.subEvents?.length || 1), 0),
    [filteredDefects],
  );

  const filteredEntries = useMemo(
    () =>
      entries.filter(a => {
        const stamp = a.arrivalDate || a.createdAt;
        if (!inDateRange(stamp)) return false;
        if (!q) return true;
        return [a.arrivalNumber, productTitle(a.productType), a.createdByName].join(' ').toLowerCase().includes(q);
      }),
    [entries, q, from, to],
  );

  const filteredLoads = useMemo(
    () =>
      completedLoads.filter(a => {
        const stamp = a.loadingCompletedAt || a.createdAt;
        if (!inDateRange(stamp)) return false;
        if (!q) return true;
        return [a.arrivalNumber, productTitle(a.productType), a.loadingCompletedByName].join(' ').toLowerCase().includes(q);
      }),
    [completedLoads, q, from, to],
  );

  const filteredExits = useMemo(
    () =>
      exits.filter(({ registry, arrival }) => {
        if (!inDateRange(registry.exitedToKengsoyAt)) return false;
        if (!q) return true;
        return [registry.registryNumber, registry.arrivalNumber, productTitle(registry.productType || arrival?.productType || '')].join(' ').toLowerCase().includes(q);
      }),
    [exits, q, from, to],
  );

  const entryWagons = useMemo(() => filteredEntries.reduce((s, a) => s + wagonCountOf(a), 0), [filteredEntries]);
  const loadWagons = useMemo(() => filteredLoads.reduce((s, a) => s + loadedWagonCountOf(a), 0), [filteredLoads]);
  const exitWagons = useMemo(() => filteredExits.reduce((s, x) => s + registryWagonCountOf(x.registry), 0), [filteredExits]);

  useEffect(() => {
    setTab(requestedTab);
    setPage(1);
  }, [requestedTab]);

  useEffect(() => {
    // Birinchi montajda URL'dagi aniq "from/to" (masalan Statistikadan kelgan
    // havola) davr tugmasi bilan chalkashib ketmasligi uchun bitta marta o'tkazamiz.
    if (skipNextPeriodReset.current) {
      skipNextPeriodReset.current = false;
      return;
    }
    const range = docsPeriodRange(requestedPeriod);
    setPeriodPreset(requestedPeriod);
    setFrom(range.from);
    setTo(range.to);
    setPage(1);
  }, [requestedPeriod]);

  const pickPreset = (preset: Exclude<PeriodPreset, 'custom'>) => {
    setPeriodPreset(preset);
    const range = docsPeriodRange(preset);
    setFrom(range.from);
    setTo(range.to);
  };

  const onFromChange = (value: string) => {
    setFrom(value);
    setPeriodPreset('custom');
    setPage(1);
  };

  const onToChange = (value: string) => {
    setTo(value);
    setPeriodPreset('custom');
    setPage(1);
  };

  useEffect(() => {
    setPage(1);
  }, [search, periodPreset, pageSize]);

  const categoryTabs: Array<{
    id: Tab;
    label: string;
    hint: string;
    count: number;
    icon: typeof History;
    tone: HubZoneTone;
  }> = [
    {
      id: 'timeline',
      label: 'Barchasi',
      hint: 'Barcha jarayonlar',
      count: filteredTimeline.length,
      icon: History,
      tone: 'sky',
    },
    {
      id: 'entries',
      label: 'Kirish',
      hint: 'Vagonlarni kiritish',
      count: filteredTimeline.filter(item => item.kind === 'entry').length,
      icon: ArrowDownToLine,
      tone: 'amber',
    },
    {
      id: 'orders',
      label: 'Buyurtma shakllantirish',
      hint: 'Tarkib yig‘ish, yuk xati, 1C',
      count: filteredTimeline.filter(item => item.kind === 'order').length,
      icon: ClipboardList,
      tone: 'sisterna',
    },
    {
      id: 'loads',
      label: 'Yuklash va Muhrlash',
      hint: 'TM va XA quyish, brutto, plomba',
      count: filteredTimeline.filter(item => item.kind === 'load').length,
      icon: PackageCheck,
      tone: 'live',
    },
    {
      id: 'exits',
      label: 'Vagon chiqarish',
      hint: 'Zavoddan chiqarilgan vagonlar',
      count: filteredTimeline.filter(item => item.kind === 'exit').length,
      icon: ArrowUpFromLine,
      tone: 'emerald',
    },
    {
      id: 'defects',
      label: 'Nosozliklar (GU-23)',
      hint: totalDefectRecords > filteredDefects.length
        ? `${filteredDefects.length} ta vagon · ${totalDefectRecords} ta qayd`
        : 'Kamchilik va dalolatnomalar',
      count: filteredDefects.length,
      icon: AlertTriangle,
      tone: 'rose',
    },
  ];

  const activeTimeline = tab === 'timeline'
    ? filteredTimeline
    : tab === 'entries'
      ? filteredTimeline.filter(item => item.kind === 'entry')
      : tab === 'orders'
        ? filteredTimeline.filter(item => item.kind === 'order')
        : tab === 'loads'
          ? filteredTimeline.filter(item => item.kind === 'load')
          : tab === 'exits'
            ? filteredTimeline.filter(item => item.kind === 'exit')
            : filteredDefects;

  const activeTotal = activeTimeline.length;
  const totalPages = Math.max(1, Math.ceil(activeTotal / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = buildPageItems(currentPage, totalPages);
  const pagedHistory = activeTimeline.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const selectTab = (nextTab: Tab) => {
    setTab(nextTab);
    setPage(1);
    setExpandedRow(null);
    setSearchParams(previous => {
      const params = new URLSearchParams(previous);
      if (nextTab === 'timeline') params.delete('tab');
      else params.set('tab', nextTab);
      return params;
    }, { replace: true });
  };

  const emptyCopy: Record<Tab, { title: string; text: string }> = {
    timeline: {
      title: 'Xronologiya bo‘sh',
      text: 'Yakunlangan jarayonlar va kamchiliklar shu yerda xronologik ko‘rinadi.',
    },
    entries: {
      title: 'Kirish tarixi yo‘q',
      text: 'Zavodga kirgan vagonlar shu yerda ko‘rinadi.',
    },
    orders: {
      title: 'Buyurtmalar tarixi yo‘q',
      text: 'Shakllantirilgan yuk xatlari va buyurtmalar shu yerda ko‘rinadi.',
    },
    loads: {
      title: 'Yuklash tarixi yo‘q',
      text: 'Yuklangan vagonlar shu yerda ko‘rinadi.',
    },
    exits: {
      title: 'Chiqish tarixi yo‘q',
      text: 'Zavoddan chiqqan vagonlar shu yerda ko‘rinadi.',
    },
    defects: {
      title: 'Nosozlik yoki qaytarish yo‘q',
      text: 'Aniqlangan kamchiliklar, rad etish va qaytarishlar shu yerda ko‘rinadi.',
    },
  };

  /** Ekranda ko'rinayotgan tanlov (barcha sahifalari) Excelga chiqadi. */
  const exportExcel = () => {
    const tabName = categoryTabs.find(t => t.id === tab)?.label ?? 'Tarix';
    exportSheet(`tarix_${tab}_${todayStamp()}.xlsx`, tabName, [
      ['Tarix', `${tabName} · ${periodLabel}`],
      [],
      ['Vaqt', 'Jarayon', 'Hujjat raqami / Obyekt', 'Vagon №', 'Vagon soni', 'Mahsulot / Dalolatnoma', 'Mas’ul'],
      ...activeTimeline.map(item => {
        const wagons = [...new Set(item.wagonNumbers.filter(Boolean))];
        return [
          fmtShort(item.at),
          processLabel(item),
          item.title,
          wagons.join(', '),
          wagons.length || item.wagonCount || 0,
          item.documentNumber || item.productLabel || item.mainTitle || item.summary || '—',
          item.actor || '—',
        ];
      }),
    ]);
  };

  const board = () => {
    if (loading) {
      return (
        <div className="thub-empty">
          <p className="thub-empty__title">Yuklanmoqda…</p>
        </div>
      );
    }

    if (loadError && activeTimeline.length === 0) {
      return (
        <div className="thub-empty">
          <p className="thub-empty__title">Ma’lumot serverdan olinmadi</p>
          <p className="thub-empty__text">{loadError} — bu «tarix yo‘q» degani emas. Sahifani yangilang.</p>
          <button
            type="button"
            onClick={() => load()}
            className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Qayta urinish
          </button>
        </div>
      );
    }

    if (activeTimeline.length === 0) {
      return (
        <div className="thub-empty">
          <p className="thub-empty__title">{emptyCopy[tab].title}</p>
          <p className="thub-empty__text">{emptyCopy[tab].text}</p>
        </div>
      );
    }

    const currentTableColumns = [
      'Vaqt',
      'Yo‘nalish',
      'Aniq bosqich',
      'Hujjat / Partiya',
      'Vagon № / Soni',
      'Mahsulot / Parametr',
      'Mas’ul xodim (F.I.Sh.)',
      'Sex / Bo‘lim',
      'Holat',
      '',
    ];

    return (
      <div className="thub-table-wrap reestr-table-wrap">
        <table className="thub-table reestr-table hist-table">
          <thead>
            <tr>
              {currentTableColumns.map((col, index) => (
                <th key={col || 'details'} className="text-center">
                  {col || (index === currentTableColumns.length - 1 ? <span className="sr-only">Batafsil</span> : null)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedHistory.map(item => {
              const isReturn = item.kind === 'defect' && /qaytar/i.test(item.detail);
              const isAct = item.kind === 'defect' && (Boolean(item.documentNumber) || /dalolatnoma/i.test(item.detail));
              const jarayon = item.kind === 'entry'
                ? 'Kirish'
                : item.kind === 'order'
                  ? 'Buyurtma'
                  : item.kind === 'load'
                    ? 'Yuklash'
                    : item.kind === 'exit'
                      ? 'Chiqish'
                      : isReturn
                        ? 'Qaytarish'
                        : isAct
                          ? 'Dalolatnoma'
                          : 'Nomuvofiqlik';

              const jarayonTone = item.kind === 'entry'
                ? 'entry'
                : item.kind === 'order'
                  ? 'order'
                  : item.kind === 'load'
                    ? 'load'
                    : item.kind === 'exit'
                      ? 'exit'
                      : isReturn
                        ? 'return'
                        : isAct
                          ? 'act'
                          : 'defect';

              const uniqueWagons = [...new Set(item.wagonNumbers.filter(Boolean))];
              const wagonLabel = uniqueWagons.length === 1
                ? uniqueWagons[0]
                : uniqueWagons.length > 1
                  ? `${uniqueWagons.length} ta vagon`
                  : item.wagonCount > 0
                    ? `${item.wagonCount} ta vagon`
                    : 'Partiya bo‘yicha';
              const hasSubEvents = Boolean(item.subEvents && item.subEvents.length > 1);
              const hasDetails = uniqueWagons.length > 1
                || Boolean(item.documentNumber)
                || Boolean(item.documentFileName)
                || hasSubEvents;
              const expanded = hasDetails && expandedRow === item.id;

              return (
                <Fragment key={item.id}>
                  <tr className={`hist-table__row${expanded ? ' is-expanded' : ''}`}>
                    {/* 1. Vaqt */}
                    <td className="hist-table__time tabular-nums whitespace-nowrap text-[13.5px] font-semibold text-center">
                      {fmtShort(item.at)}
                    </td>

                    {/* 2. Yo‘nalish */}
                    <td className="hist-table__status-cell text-center">
                      <span className={`thub-chip hist-status-chip hist-status-chip--${jarayonTone} text-[13px] font-semibold`}>
                        {jarayon}
                      </span>
                    </td>

                    {/* 3. Aniq bosqich */}
                    <td className="text-center whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                        {item.stageName || jarayon}
                      </span>
                    </td>

                    {/* 4. Hujjat / Partiya */}
                    <td className="thub-table__code text-[13.5px] font-semibold font-mono text-center">
                      {item.title}
                    </td>

                    {/* 5. Vagon № / Soni */}
                    <td className="hist-table__wagons text-[13.5px] font-semibold text-center font-mono" title={uniqueWagons.join(', ') || wagonLabel}>
                      {wagonLabel}
                    </td>

                    {/* 6. Mahsulot / Parametr */}
                    <td className="hist-table__summary text-slate-800 dark:text-slate-100 text-[13.5px] font-semibold text-center">
                      <div className="flex flex-col items-center">
                        <span className="truncate max-w-[200px]" title={item.productLabel || item.mainTitle || item.summary}>
                          {item.productLabel || item.mainTitle || item.summary}
                        </span>
                        {item.extraInfo && (
                          <span className="text-[11.5px] text-slate-500 dark:text-slate-400 font-normal">
                            {item.extraInfo}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 7. Mas’ul xodim (F.I.Sh.) */}
                    <td className="hist-table__actor text-[13.5px] font-semibold text-slate-800 dark:text-slate-100 text-center">
                      {item.actor || '—'}
                    </td>

                    {/* 8. Sex / Bo‘lim */}
                    <td className="text-center text-xs text-slate-600 dark:text-slate-300 font-medium">
                      {item.department || '—'}
                    </td>

                    {/* 9. Holat */}
                    <td className="text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11.5px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">
                        {item.statusBadge || 'Bajarildi'}
                      </span>
                    </td>

                    {/* 10. Amallar */}
                    <td className="hist-table__action-cell text-center">
                      {hasDetails ? (
                        <button
                          type="button"
                          className={`hist-table__detail-btn${expanded ? ' is-open' : ''}`}
                          onClick={() => setExpandedRow(current => current === item.id ? null : item.id)}
                          aria-expanded={expanded}
                          aria-label={`${item.title} tafsilotlarini ${expanded ? 'yopish' : 'ochish'}`}
                          title={expanded ? 'Tafsilotni yopish' : 'Batafsil ko‘rish'}
                        >
                          <ChevronRight strokeWidth={2} aria-hidden />
                        </button>
                      ) : (
                        <span className="hist-table__no-detail" aria-hidden>—</span>
                      )}
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className="hist-table__detail-row">
                      <td colSpan={currentTableColumns.length}>
                        <div className="hist-event-detail hist-event-detail--compact">
                          {hasSubEvents ? (
                            <div className="hist-stepper-wrap">
                              <div className="hist-stepper">
                                {[...item.subEvents!].sort((a, b) => a.at.localeCompare(b.at)).map((evt, idx, arr) => (
                                  <div key={evt.id || idx} className="hist-stepper__item">
                                    <div className="hist-stepper__track">
                                      <div className={`hist-stepper__node hist-stepper__node--${evt.tone}`}>
                                        {idx + 1}
                                      </div>
                                      {idx < arr.length - 1 ? <div className="hist-stepper__connector" /> : null}
                                    </div>
                                    <div className="hist-stepper__box">
                                      <div className="hist-step-grid">
                                        {/* 1. Nomuvofiqlik / Dalolatnoma yozuvi */}
                                        <div className="hist-step-grid__col hist-step-grid__col--badge">
                                          <span className={`thub-chip hist-status-chip hist-status-chip--${evt.tone} text-[12.5px] font-normal`}>
                                            {evt.stage}
                                          </span>
                                        </div>

                                        {/* 2. Sanasi */}
                                        <div className="hist-step-grid__col hist-step-grid__col--time">
                                          <span className="hist-step-grid__label">Sanasi</span>
                                          <span className="hist-step-grid__val font-mono font-normal text-[13px] text-slate-700 dark:text-slate-300">
                                            {fmtShort(evt.at)}
                                          </span>
                                        </div>

                                        {/* 3. Vagon nomeri */}
                                        <div className="hist-step-grid__col hist-step-grid__col--wagon">
                                          <span className="hist-step-grid__label">Vagon №</span>
                                          <span className="hist-step-grid__val font-mono font-normal text-[13px] text-slate-700 dark:text-slate-300">
                                            {uniqueWagons[0] || item.wagonNumbers[0] || '—'}
                                          </span>
                                        </div>

                                        {/* 4. Izohi */}
                                        <div className="hist-step-grid__col hist-step-grid__col--desc">
                                          <span className="hist-step-grid__label">Izoh</span>
                                          <div className="hist-step-grid__val font-normal text-[13px]">
                                            {evt.documentNumber ? (
                                              <span className="text-slate-700 dark:text-slate-300 font-normal">
                                                <span className="font-mono">{evt.documentNumber}</span> rasmiylashtirildi
                                              </span>
                                            ) : (
                                              <span className="text-slate-700 dark:text-slate-300 font-normal">{evt.summary}</span>
                                            )}
                                          </div>
                                        </div>

                                        {/* 5. Mas'ul ism-familiyasi */}
                                        <div className="hist-step-grid__col hist-step-grid__col--actor">
                                          <span className="hist-step-grid__label">Mas’ul</span>
                                          <span className="hist-step-grid__val font-normal text-[13px] text-slate-700 dark:text-slate-300">
                                            {evt.actor}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <>
                              {uniqueWagons.length > 0 ? (
                                <WagonsGrid wagons={uniqueWagons} partyTitle={item.title} />
                              ) : null}
                              {item.documentNumber ? (
                                <div className="hist-event-detail__item">
                                  <span>Hujjat raqami</span>
                                  <strong>{item.documentNumber}</strong>
                                </div>
                              ) : null}
                              {item.documentFileName ? (
                                <div className="hist-event-detail__item">
                                  <span>Fayl</span>
                                  <strong>{item.documentFileName}</strong>
                                </div>
                              ) : null}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const recordLabel =
    tab === 'timeline'
      ? `${filteredTimeline.length} ta yozuv`
      : tab === 'entries'
        ? `${filteredEntries.length} ta · ${entryWagons} vagon`
        : tab === 'loads'
          ? `${filteredLoads.length} ta · ${loadWagons} vagon`
          : tab === 'exits'
            ? `${filteredExits.length} ta · ${exitWagons} vagon`
            : totalDefectRecords > filteredDefects.length
              ? `${filteredDefects.length} ta vagon (${totalDefectRecords} ta yozuv)`
              : `${filteredDefects.length} ta vagon`;

  const periodLabel = periodPreset === 'all'
    ? 'Barcha davr'
    : periodPreset === 'today'
      ? 'Kunlik'
      : periodPreset === 'week'
        ? 'Haftalik'
        : periodPreset === 'month'
          ? 'Oylik'
          : 'Tanlangan davr';

  return (
    <div className="thub reestr thub-history">
      <section className="thub__main reestr-main">
        <ReportsHistoryTabs active="history" />
        <HubZoneTabs
          label="Jarayon turi"
          columns={5}
          value={tab}
          onChange={selectTab}
          items={categoryTabs}
        />

        <div className="thub__toolbar reestr-toolbar">
          <div className="thub-pills" role="group" aria-label="Davr turi">
            {DOCS_PERIOD_PRESETS.map(p => (
              <button key={p.id} type="button" className={periodPreset === p.id ? 'is-on' : undefined} onClick={() => pickPreset(p.id)}>
                {p.label}
              </button>
            ))}
          </div>

          <label className="thub-search">
            <Search className="thub-search__ico" strokeWidth={1.75} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Partiya, vagon, yuk xati yoki xodim" />
            {search ? (
              <button type="button" className="thub-search__x" onClick={() => setSearch('')} aria-label="Tozalash">
                <X className="w-3.5 h-3.5" />
              </button>
            ) : null}
          </label>

          <div className="thub-date">
            <span className="thub-date__lbl">Dan</span>
            <DatePicker value={from} onChange={onFromChange} variant="compact" placeholder="dd.mm.yyyy" />
            <span className="thub-date__lbl">Gacha</span>
            <DatePicker value={to} onChange={onToChange} variant="compact" placeholder="dd.mm.yyyy" />
          </div>

          <span className="thub-history__meta">
            {loading ? '…' : (
              <>
                {periodLabel} · {recordLabel}
              </>
            )}
          </span>

          <button
            type="button"
            className="btn-secondary flex items-center gap-1.5"
            onClick={exportExcel}
            disabled={loading || activeTimeline.length === 0}
            title="Tanlangan davr va bo‘lim bo‘yicha Excel yuklash"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Excel yuklash</span>
          </button>
        </div>

        {loadError && activeTimeline.length > 0 && (
          <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-200">
            Ma’lumot yangilanmadi: {loadError}. Ko‘rsatilayotgan tarix oxirgi muvaffaqiyatli holat.
          </div>
        )}
        {board()}

        <div className="thub-history-pagination">
          <p className="thub-history-pagination__count">
            {tab === 'defects'
              ? `Jami ${activeTotal} ta vagon${totalDefectRecords > activeTotal ? ` (${totalDefectRecords} ta yozuv)` : ''}`
              : `Jami ${activeTotal} ta yozuv`}
          </p>
          <div className="thub-history-pagination__pages">
            <button
              type="button"
              className="admin-pagination__btn"
              disabled={currentPage <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
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
                  onClick={() => setPage(item)}
                >
                  {item}
                </button>
              );
            })}
            <button
              type="button"
              className="admin-pagination__btn"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              aria-label="Keyingi sahifa"
            >
              <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </div>
          <label className="admin-table-footer__pagesize thub-history-pagination__size">
              <span>Sahifadagi qatorlar:</span>
              <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))}>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </label>
        </div>
      </section>
    </div>
  );
}
