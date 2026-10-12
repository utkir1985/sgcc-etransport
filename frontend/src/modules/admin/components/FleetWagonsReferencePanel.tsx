import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  Container,
  ExternalLink,
  Download,
  FileText,
  Pencil,
  Plus,
  Search,
  Trash2,
  TrainFront,
  Upload,
  X,
} from 'lucide-react';
import { api } from '../../../shared/services/api';
import type { CatalogContainer, CatalogFleetWagon } from '../../../shared/types';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { DatePicker } from '../../../shared/components/DatePicker';
import { OrderSheetMenu } from '../../../shared/components/OrderSheetMenu';
import {
  WAGON_OWNERSHIP,
  normalizeWagonOwnership,
  wagonOwnershipLabel,
  type WagonOwnership,
} from '../../../shared/constants/wagonOwnership';
import {
  exportFleetWagonsToExcel,
  parseFleetWagonExcel,
} from '../../../shared/utils/fleetWagonExcel';
import { normalizeStationName } from '../../../shared/utils/cyrillicToLatin';
import { ContainersReferencePanel } from './ContainersReferencePanel';
import { HubZoneTabs } from '../../../shared/components/HubZoneTabs';
import type { HubZoneTone } from '../../../shared/components/HubZoneTabs';
import { useRbacPermission } from '../../../shared/hooks/useRbacPermission';

type SortKey =
  | 'wagonNumber'
  | 'wagonKind'
  | 'ownership'
  | 'builtAt'
  | 'lastCapitalRepairAt'
  | 'lastDepotRepairAt'
  | 'daysUntilNextDepotRepair'
  | 'destinationStation'
  | 'location'
  | 'sentAt'
  | 'daysInTransit';

type SortDir = 'asc' | 'desc';
type FleetWagonKind = 'sisterna' | 'closed' | 'platform';
type ReestrView = 'wagons' | 'tashqi' | 'containers' | 'majmua' | 'attention';
type KindTab = 'sisterna' | 'closed' | 'container';
type Serviceability = 'yaroqli' | 'eslatma' | 'yaroqsiz';

const SERVICEABILITY_OPTIONS: { value: Serviceability; label: string }[] = [
  { value: 'yaroqli', label: 'Yaroqli' },
  { value: 'eslatma', label: 'Eslatma' },
  { value: 'yaroqsiz', label: 'Yaroqsiz' },
];

function needsAttention(item: CatalogFleetWagon): boolean {
  if (item.serviceability === 'yaroqsiz' || item.serviceability === 'eslatma') return true;
  return typeof item.daysUntilNextDepotRepair === 'number' && item.daysUntilNextDepotRepair <= 30;
}

function containerNeedsAttention(item: CatalogContainer): boolean {
  if (item.serviceability === 'yaroqsiz' || item.serviceability === 'eslatma') return true;
  return typeof item.daysUntilNextInspection === 'number' && item.daysUntilNextInspection <= 30;
}

function resolveServiceability(
  serviceability: string | null | undefined,
  days?: number | null,
): Serviceability {
  const key = (serviceability || '').trim().toLowerCase();
  if (key === 'yaroqli' || key === 'eslatma' || key === 'yaroqsiz') return key;
  if (typeof days === 'number' && days < 0) return 'yaroqsiz';
  if (typeof days === 'number' && days <= 30) return 'eslatma';
  return 'yaroqli';
}

function fleetConditionLabel(item: CatalogFleetWagon): { text: string; tone: 'ok' | 'warn' | 'bad' } {
  const s = resolveServiceability(item.serviceability, item.daysUntilNextDepotRepair);
  if (s === 'yaroqsiz') return { text: 'Yaroqsiz', tone: 'bad' };
  if (s === 'eslatma') return { text: 'Eslatma', tone: 'warn' };
  return { text: 'Yaroqli', tone: 'ok' };
}

/** Holat: yaqin/o‘tgan — kun; yaroqsiz — tire */
function fleetHolatCell(item: CatalogFleetWagon): { text: string; tone: 'ok' | 'warn' | 'bad' } {
  const days = item.daysUntilNextDepotRepair;
  const s = resolveServiceability(item.serviceability, days);
  if (typeof days === 'number' && days < 0) {
    return { text: `${Math.abs(days)} kun o‘tgan`, tone: 'bad' };
  }
  if (typeof days === 'number' && days <= 30) {
    return { text: `${days} kun`, tone: 'warn' };
  }
  if (s === 'yaroqsiz') return { text: '—', tone: 'bad' };
  if (s === 'eslatma') return { text: 'Eslatma', tone: 'warn' };
  return { text: 'Yaroqli', tone: 'ok' };
}

/** Depo muddati: yaqinlashgan (sariq) vs o‘tgan (qizil) */
function fleetAttentionRowClass(item: CatalogFleetWagon): string | undefined {
  const tone = fleetConditionLabel(item).tone;
  if (tone === 'bad') return 'reestr-row--overdue';
  if (tone === 'warn') return 'reestr-row--soon';
  return undefined;
}

const WAGON_KIND_OPTIONS: { value: FleetWagonKind; label: string; short: string }[] = [
  { value: 'sisterna', label: 'Vagon-sisterna', short: 'Sisterna' },
  { value: 'closed', label: 'Yopiq turdagi vagon', short: 'Yopiq' },
  { value: 'platform', label: 'Fiting platforma', short: 'Platforma' },
];

function normalizeWagonKind(value?: string | null): FleetWagonKind {
  const norm = (value ?? 'sisterna').toLowerCase();
  if (norm === 'closed' || norm === 'platform') return norm;
  return 'sisterna';
}

function kindLabel(value?: string | null): string {
  const k = normalizeWagonKind(value);
  return WAGON_KIND_OPTIONS.find(o => o.value === k)?.label || 'Vagon-sisterna';
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getUTCFullYear()}`;
}

function printFleetWagonsPdf(title: string, items: CatalogFleetWagon[]) {
  const iframe = document.createElement('iframe');
  iframe.style.cssText =
    'position:fixed;left:0;top:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none;z-index:-1';
  document.body.appendChild(iframe);
  const idoc = iframe.contentDocument;
  const iwin = iframe.contentWindow;
  if (!idoc || !iwin) {
    iframe.remove();
    return;
  }
  const rows = items.map((item, idx) => `
    <tr>
      <td class="center">${idx + 1}</td>
      <td class="number">${item.wagonNumber}</td>
      <td>${kindLabel(item.wagonKind)}</td>
      <td>${wagonOwnershipLabel(item.ownership)}</td>
      <td>${item.destinationStation || '—'}</td>
      <td>${isShgkm(item.destinationStation) ? 'Zavod hududida' : 'Zavoddan tashqarida'}</td>
      <td>${fleetHolatCell(item).text}</td>
    </tr>`).join('');
  idoc.open();
  idoc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
    @page{size:A4 portrait;margin:12mm}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#0f172a;margin:0;padding:12px}
    header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0284c7;padding-bottom:8px;margin-bottom:14px}
    h1{font-size:16px;color:#0369a1;margin:0}.date{font-size:11px;color:#64748b}table{width:100%;border-collapse:collapse;font-size:10.5px}
    th{background:#f1f5f9;color:#334155;text-align:left;padding:7px 8px;border:1px solid #cbd5e1}td{padding:7px 8px;border:1px solid #e2e8f0}
    tr:nth-child(even){background:#f8fafc}.center{text-align:center}.number{font-weight:700;font-family:monospace}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body><header><h1>${title}</h1><span class="date">Sana: ${new Date().toLocaleDateString('uz-UZ')}</span></header>
  <table><thead><tr><th class="center">№</th><th>Vagon raqami</th><th>Tur</th><th>Tegishlilik</th><th>Manzil</th><th>Joylashuv</th><th>Holat</th></tr></thead><tbody>${rows}</tbody></table>
  </body></html>`);
  idoc.close();
  setTimeout(() => {
    try { iwin.focus(); iwin.print(); }
    finally { setTimeout(() => iframe.remove(), 1000); }
  }, 250);
}

function toDateInput(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function timeOrNull(iso?: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

function isShgkm(station?: string | null): boolean {
  return (station || '').toLowerCase().includes('shgkm');
}

function compareFleet(a: CatalogFleetWagon, b: CatalogFleetWagon, key: SortKey, dir: SortDir): number {
  const mul = dir === 'asc' ? 1 : -1;
  let cmp = 0;
  if (key === 'wagonNumber') {
    cmp = a.wagonNumber.localeCompare(b.wagonNumber, undefined, { numeric: true });
  } else if (key === 'wagonKind') {
    cmp = normalizeWagonKind(a.wagonKind).localeCompare(normalizeWagonKind(b.wagonKind));
  } else if (key === 'ownership') {
    cmp = normalizeWagonOwnership(a.ownership).localeCompare(normalizeWagonOwnership(b.ownership));
  } else if (key === 'destinationStation') {
    cmp = (a.destinationStation || '').localeCompare(b.destinationStation || '', 'uz');
  } else if (key === 'location') {
    const al = isShgkm(a.destinationStation) ? 1 : 0;
    const bl = isShgkm(b.destinationStation) ? 1 : 0;
    cmp = bl - al;
  } else if (key === 'daysInTransit' || key === 'daysUntilNextDepotRepair') {
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) cmp = 0;
    else if (av == null) cmp = 1;
    else if (bv == null) cmp = -1;
    else cmp = av - bv;
  } else {
    const av = timeOrNull(a[key]);
    const bv = timeOrNull(b[key]);
    if (av == null && bv == null) cmp = 0;
    else if (av == null) cmp = 1;
    else if (bv == null) cmp = -1;
    else cmp = av - bv;
  }
  if (cmp !== 0) return cmp * mul;
  return a.wagonNumber.localeCompare(b.wagonNumber, undefined, { numeric: true });
}

function SortTh({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === column;
  return (
    <th>
      <button type="button" className="reestr-sort" onClick={() => onSort(column)}>
        <span>{label}</span>
        {active ? (
          sortDir === 'asc' ? (
            <ArrowUp className="w-3 h-3" strokeWidth={2} />
          ) : (
            <ArrowDown className="w-3 h-3" strokeWidth={2} />
          )
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-35" strokeWidth={2} />
        )}
      </button>
    </th>
  );
}

export function FleetWagonsReferencePanel() {
  const { canFleetWagonsCreate, canFleetWagonsUpdate, canFleetWagonsDelete } = useRbacPermission();
  const [items, setItems] = useState<CatalogFleetWagon[]>([]);
  const [containers, setContainers] = useState<CatalogContainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ReestrView>('wagons');
  const [search, setSearch] = useState('');
  const [kindTab, setKindTab] = useState<KindTab>('sisterna');
  const [sortKey, setSortKey] = useState<SortKey>('wagonNumber');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [dialog, setDialog] = useState<'create' | 'edit' | null>(null);
  const [editScope, setEditScope] = useState<'full' | 'holat'>('full');
  const [selected, setSelected] = useState<CatalogFleetWagon | null>(null);
  const [wagonNumber, setWagonNumber] = useState('');
  const [ownership, setOwnership] = useState<WagonOwnership>(WAGON_OWNERSHIP.Majmua);
  const [wagonKind, setWagonKind] = useState<FleetWagonKind>('sisterna');
  const [notes, setNotes] = useState('');
  const [serviceability, setServiceability] = useState<Serviceability>('yaroqli');
  const [builtAt, setBuiltAt] = useState('');
  const [lastCapitalRepairAt, setLastCapitalRepairAt] = useState('');
  const [lastDepotRepairAt, setLastDepotRepairAt] = useState('');
  const [daysUntilNextDepotRepair, setDaysUntilNextDepotRepair] = useState('');
  const [destinationStation, setDestinationStation] = useState('');
  const [sentAt, setSentAt] = useState('');
  const [daysInTransit, setDaysInTransit] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.getFleetWagons(undefined, true).then(res => setItems(res.data ?? [])).catch(() => setItems([])),
      api.getContainers(true).then(res => setContainers(res.data ?? [])).catch(() => setContainers([])),
    ]).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const onSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const activeItems = useMemo(
    () => items.filter(item => item.isActive !== false),
    [items],
  );

  const majmuaFleetWagons = useMemo(
    () => activeItems.filter(item => normalizeWagonOwnership(item.ownership) === WAGON_OWNERSHIP.Majmua),
    [activeItems],
  );

  // Tashqi vagonlar Majmuaga tegishli emas, shuning uchun ular faqat zavod hududida bo'lgandagina (ShGKM) reestrda turadi. Chiqib ketgach avtomatik chiqadi.
  const tashqiFleetWagons = useMemo(
    () => activeItems.filter(item => normalizeWagonOwnership(item.ownership) !== WAGON_OWNERSHIP.Majmua && isShgkm(item.destinationStation)),
    [activeItems],
  );

  const attentionItems = useMemo(
    () => activeItems.filter(needsAttention),
    [activeItems],
  );

  const majmuaItems = useMemo(
    () => activeItems.filter(w => isShgkm(w.destinationStation)),
    [activeItems],
  );

  const activeContainers = useMemo(
    () => containers.filter(c => c.isActive !== false),
    [containers],
  );

  const attentionContainers = useMemo(
    () => activeContainers.filter(containerNeedsAttention),
    [activeContainers],
  );

  const majmuaContainers = useMemo(
    () => activeContainers.filter(c => isShgkm(c.destinationStation)),
    [activeContainers],
  );

  const attentionSisterna = useMemo(
    () => attentionItems.filter(w => normalizeWagonKind(w.wagonKind) === 'sisterna'),
    [attentionItems],
  );

  const majmuaByKind = useMemo(() => {
    const c = { sisterna: [] as CatalogFleetWagon[], closed: [] as CatalogFleetWagon[], platform: [] as CatalogFleetWagon[] };
    for (const w of majmuaItems) c[normalizeWagonKind(w.wagonKind)].push(w);
    return c;
  }, [majmuaItems]);

  const attentionTotal = attentionSisterna.length + attentionContainers.length;
  const majmuaTotal =
    majmuaByKind.sisterna.length + majmuaByKind.closed.length + majmuaContainers.length;

  const kindTabCounts = useMemo(() => {
    if (view === 'attention') {
      return { sisterna: attentionSisterna.length, closed: 0, container: attentionContainers.length };
    }
    return {
      sisterna: majmuaByKind.sisterna.length,
      closed: majmuaByKind.closed.length,
      container: majmuaContainers.length,
    };
  }, [
    view,
    attentionSisterna.length,
    attentionContainers.length,
    majmuaByKind.sisterna.length,
    majmuaByKind.closed.length,
    majmuaContainers.length,
  ]);

  const visible = useMemo(() => {
    const base =
      view === 'attention'
        ? kindTab === 'container' || kindTab === 'closed'
          ? []
          : attentionSisterna
        : view === 'majmua'
          ? kindTab === 'container'
            ? []
            : kindTab === 'closed'
              ? majmuaByKind.closed
              : majmuaByKind.sisterna
          : view === 'tashqi'
            ? tashqiFleetWagons
            : view === 'wagons'
              ? majmuaFleetWagons
              : activeItems;
    const q = search.trim().toLowerCase();
    const filtered = base.filter(item => {
      if (!q) return true;
      return [
        item.wagonNumber,
        item.wagonKind,
        kindLabel(item.wagonKind),
        item.ownership,
        wagonOwnershipLabel(item.ownership),
        item.destinationStation,
        isShgkm(item.destinationStation) ? 'zavod hududida ichida' : 'zavoddan tashqarida yo‘lda',
        item.notes,
      ].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
    return [...filtered].sort((a, b) => compareFleet(a, b, sortKey, sortDir));
  }, [activeItems, attentionSisterna, majmuaByKind, majmuaFleetWagons, tashqiFleetWagons, kindTab, search, sortKey, sortDir, view]);

  const resetForm = () => {
    setSelected(null);
    setWagonNumber('');
    setOwnership(WAGON_OWNERSHIP.Majmua);
    setWagonKind('sisterna');
    setNotes('');
    setServiceability('yaroqli');
    setBuiltAt('');
    setLastCapitalRepairAt('');
    setLastDepotRepairAt('');
    setDaysUntilNextDepotRepair('');
    setDestinationStation('');
    setSentAt('');
    setDaysInTransit('');
    setIsActive(true);
    setError('');
  };

  const openCreate = () => {
    resetForm();
    if (view === 'tashqi') {
      setOwnership(WAGON_OWNERSHIP.Tashqi);
    }
    setEditScope('full');
    setDialog('create');
  };

  const openEdit = (item: CatalogFleetWagon, scope: 'full' | 'holat' = 'full') => {
    setSelected(item);
    setWagonNumber(item.wagonNumber);
    setOwnership(normalizeWagonOwnership(item.ownership));
    setWagonKind(normalizeWagonKind(item.wagonKind));
    setNotes(item.notes ?? '');
    setServiceability(resolveServiceability(item.serviceability, item.daysUntilNextDepotRepair));
    setBuiltAt(toDateInput(item.builtAt));
    setLastCapitalRepairAt(toDateInput(item.lastCapitalRepairAt));
    setLastDepotRepairAt(toDateInput(item.lastDepotRepairAt));
    setDaysUntilNextDepotRepair(
      item.daysUntilNextDepotRepair != null ? String(item.daysUntilNextDepotRepair) : '',
    );
    setDestinationStation(normalizeStationName(item.destinationStation) || item.destinationStation || '');
    setSentAt(toDateInput(item.sentAt));
    setDaysInTransit(item.daysInTransit != null ? String(item.daysInTransit) : '');
    setIsActive(item.isActive);
    setError('');
    setEditScope(scope);
    setDialog('edit');
  };

  const payloadFields = () => ({
    wagonKind,
    notes: notes.trim() || undefined,
    serviceability,
    builtAt: builtAt || undefined,
    lastCapitalRepairAt: lastCapitalRepairAt || undefined,
    lastDepotRepairAt: lastDepotRepairAt || undefined,
    daysUntilNextDepotRepair:
      daysUntilNextDepotRepair.trim() === '' ? undefined : Number(daysUntilNextDepotRepair),
    destinationStation: normalizeStationName(destinationStation.trim()) || destinationStation.trim() || undefined,
    sentAt: sentAt || undefined,
    daysInTransit: daysInTransit.trim() === '' ? undefined : Number(daysInTransit),
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (dialog === 'edit' && editScope === 'holat' && selected) {
      setSaving(true);
      setError('');
      try {
        const res = await api.updateFleetWagon(selected.id, {
          wagonNumber: selected.wagonNumber,
          ownership: selected.ownership,
          wagonKind: selected.wagonKind ?? undefined,
          notes: selected.notes ?? undefined,
          serviceability,
          isActive: selected.isActive,
          builtAt: selected.builtAt ? selected.builtAt.slice(0, 10) : undefined,
          lastCapitalRepairAt: selected.lastCapitalRepairAt
            ? selected.lastCapitalRepairAt.slice(0, 10)
            : undefined,
          lastDepotRepairAt: selected.lastDepotRepairAt
            ? selected.lastDepotRepairAt.slice(0, 10)
            : undefined,
          daysUntilNextDepotRepair: selected.daysUntilNextDepotRepair ?? undefined,
          destinationStation: selected.destinationStation ?? undefined,
          sentAt: selected.sentAt ? selected.sentAt.slice(0, 10) : undefined,
          daysInTransit: selected.daysInTransit ?? undefined,
        });
        if (!res.success) throw new Error(res.message || 'Saqlashda xatolik');
        setDialog(null);
        load();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Xatolik');
      } finally {
        setSaving(false);
      }
      return;
    }
    const number = wagonNumber.replace(/\D/g, '').slice(0, 8);
    if (number.length !== 8) {
      setError('Vagon nomeri 8 xonali bo‘lishi kerak');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (dialog === 'create') {
        const res = await api.createFleetWagon({
          wagonNumber: number,
          ownership,
          ...payloadFields(),
        });
        if (!res.success) throw new Error(res.message || 'Saqlashda xatolik');
      } else if (dialog === 'edit' && selected) {
        const res = await api.updateFleetWagon(selected.id, {
          wagonNumber: number,
          ownership,
          isActive,
          ...payloadFields(),
        });
        if (!res.success) throw new Error(res.message || 'Saqlashda xatolik');
      }
      setDialog(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteId) return;
    setSaving(true);
    try {
      await api.deleteFleetWagon(deleteId);
      setDeleteId(null);
      load();
    } catch {
      setError('O‘chirishda xatolik');
    } finally {
      setSaving(false);
    }
  };

  const onExport = () => {
    exportFleetWagonsToExcel(visible, 'vagonlar-reestri.xlsx');
  };

  const onImportFile = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    setError('');
    setInfo('');
    try {
      const rows = await parseFleetWagonExcel(file);
      if (rows.length === 0) {
        setError(
          'Excelda 8 xonali vagon raqami topilmadi. «Vagon nomer» ustunini tekshiring yoki shablonni yuklab oling.',
        );
        return;
      }
      const res = await api.importFleetWagons(rows, WAGON_OWNERSHIP.Majmua);
      if (!res.success || !res.data) {
        setError(res.message || 'Import xatosi');
        return;
      }
      const { created, updated, skipped, errors } = res.data;
      setInfo(
        `Import: ${created} yangi, ${updated} yangilandi` +
          (skipped ? `, ${skipped} o‘tkazib yuborildi` : ''),
      );
      if (errors?.length) setError(errors.slice(0, 5).join('; '));
      setSortKey('wagonNumber');
      setSortDir('asc');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Excel o‘qishda xatolik');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const clearFilters = () => {
    setSearch('');
  };

  const goView = (next: ReestrView) => {
    setView(next);
    setSearch('');
    if (next === 'majmua' || next === 'attention') setKindTab('sisterna');
  };

  const emptyTitle =
    view === 'attention'
      ? attentionSisterna.length === 0
        ? 'Eslatma talab qiladigan vagon-sisterna yo‘q'
        : 'Filtr bo‘yicha topilmadi'
      : view === 'majmua'
        ? (kindTab === 'closed' ? majmuaByKind.closed : majmuaByKind.sisterna).length === 0
          ? kindTab === 'closed'
            ? 'Majmua hududida yopiq turdagi vagon yo‘q'
            : 'Majmua hududida (SHGKM) vagon-sisterna yo‘q'
          : 'Filtr bo‘yicha topilmadi'
        : view === 'tashqi'
          ? tashqiFleetWagons.length === 0
            ? 'Tashqi vagonlar yo‘q'
            : 'Filtr bo‘yicha topilmadi'
          : majmuaFleetWagons.length === 0
            ? 'Majmua vagonlari yo‘q'
            : 'Filtr bo‘yicha topilmadi';

  const emptyText =
    view === 'attention'
      ? attentionSisterna.length === 0
        ? 'Depo muddati 30 kundan kam yoki o‘tgan vagon-sisternalar shu yerda chiqadi.'
        : `${attentionSisterna.length} ta eslatmali vagon bor, filtrga mos kelmadi.`
      : view === 'majmua'
        ? (kindTab === 'closed' ? majmuaByKind.closed : majmuaByKind.sisterna).length === 0
          ? 'Manzili SHGKM bo‘lgan (zavod hududida turgan) vagonlar shu yerda ko‘rinadi.'
          : `${(kindTab === 'closed' ? majmuaByKind.closed : majmuaByKind.sisterna).length} ta hududdagi vagon bor, filtrga mos kelmadi.`
        : view === 'tashqi'
          ? tashqiFleetWagons.length === 0
            ? 'Zavodga kirgan yoki kiritilgan tashqi va ijara vagonlari shu yerda alohida yuritiladi.'
            : `${tashqiFleetWagons.length} ta tashqi vagon bor, filtrga mos kelmadi.`
          : majmuaFleetWagons.length === 0
            ? 'Import qiling yoki qo‘lda qo‘shing.'
            : `${majmuaFleetWagons.length} ta vagon bor, filtrga mos kelmadi.`;

  const renderWagonBoard = (
    rows: CatalogFleetWagon[],
    opts?: {
      forceAttentionMark?: boolean;
      emptyTitle?: string;
      emptyText?: string;
      compact?: boolean;
      showOwnership?: boolean;
    },
  ) => {
    const compact = Boolean(opts?.compact);
    const showOwnership = Boolean(opts?.showOwnership);
    return (
    <div className="thub__board">
      {loading ? (
        <div className="thub-empty">Yuklanmoqda…</div>
      ) : rows.length === 0 ? (
        <div className="thub-empty">
          <p className="thub-empty__title">{opts?.emptyTitle || emptyTitle}</p>
          <p className="thub-empty__text">{opts?.emptyText || emptyText}</p>
        </div>
      ) : (
        <div className="thub-table-wrap reestr-table-wrap">
          <table className={`thub-table reestr-table${compact ? ' reestr-table--compact' : ''}`}>
            <thead>
              <tr>
                <th>№</th>
                <SortTh label="Vagon raqami" column="wagonNumber" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                {compact ? (
                  <>
                    <SortTh label="Tur" column="wagonKind" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    {showOwnership ? (
                      <SortTh label="Tegishlilik" column="ownership" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    ) : null}
                    <SortTh label="Joylashuv" column="location" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <th>Holat</th>
                  </>
                ) : (
                  <>
                    <SortTh label="Tur" column="wagonKind" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    {showOwnership ? (
                      <SortTh label="Tegishlilik" column="ownership" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    ) : null}
                    <SortTh label="Ishlab chiq." column="builtAt" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortTh label="Kapital ta’mir" column="lastCapitalRepairAt" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortTh label="Depo ta’mir" column="lastDepotRepairAt" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortTh label="Qolgan kun" column="daysUntilNextDepotRepair" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortTh label="Manzil" column="destinationStation" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortTh label="Joylashuv" column="location" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortTh label="Yuborilgan" column="sentAt" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortTh label="Yo‘lda" column="daysInTransit" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <th>Izoh</th>
                  </>
                )}
                <th className="!text-center">Amallar</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item, index) => {
                const remain = item.daysUntilNextDepotRepair;
                const overduePast = remain != null && remain < 0;
                const overdueSoon = remain != null && remain >= 0 && remain <= 30;
                const attn = opts?.forceAttentionMark || needsAttention(item);
                const dest =
                  normalizeStationName(item.destinationStation) || item.destinationStation || '—';
                const kind = normalizeWagonKind(item.wagonKind);
                const condition = fleetConditionLabel(item);
                const holat = fleetHolatCell(item);
                const rowClass = fleetAttentionRowClass(item);
                return (
                  <tr key={item.id} className={rowClass}>
                    <td className="thub-mono reestr-num">{index + 1}</td>
                    <td>
                      <span className="reestr-code-cell">
                        {attn && !compact ? (
                          <span
                            className={`reestr-attn${condition.tone === 'bad' ? ' reestr-attn--overdue' : ''}`}
                            title={
                              condition.tone === 'bad'
                                ? 'Depo muddati o‘tgan'
                                : 'Depo muddati yaqinlashmoqda'
                            }
                          >
                            <AlertTriangle className="w-3.5 h-3.5" strokeWidth={2} />
                          </span>
                        ) : null}
                        <span className="thub-table__code">{item.wagonNumber}</span>
                      </span>
                    </td>
                    <td>
                      <span className={`thub-chip thub-chip--${kind}`}>{kindLabel(item.wagonKind)}</span>
                    </td>
                    {compact ? (
                      <>
                        {showOwnership ? (
                          <td>{wagonOwnershipLabel(item.ownership)}</td>
                        ) : null}
                        <td>
                          {isShgkm(dest) ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60 whitespace-nowrap">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Zavod hududida
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-600 whitespace-nowrap">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                              Zavoddan tashqarida
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={`reestr-status reestr-status--${holat.tone}`}>
                            {holat.text}
                          </span>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="thub-mono whitespace-nowrap">{fmtDate(item.builtAt)}</td>
                        <td className="thub-mono whitespace-nowrap">{fmtDate(item.lastCapitalRepairAt)}</td>
                        <td className="thub-mono whitespace-nowrap">{fmtDate(item.lastDepotRepairAt)}</td>
                        <td className={overduePast ? 'thub-warn-num' : overdueSoon ? 'reestr-warn' : 'thub-mono'}>
                          {remain != null ? remain : '—'}
                        </td>
                        <td>
                          <span className={isShgkm(dest) ? 'thub-home' : undefined}>{dest}</span>
                        </td>
                        <td>
                          {isShgkm(dest) ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60 whitespace-nowrap">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Zavod hududida
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-600 whitespace-nowrap">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                              Zavoddan tashqarida
                            </span>
                          )}
                        </td>
                        <td className="thub-mono whitespace-nowrap">{fmtDate(item.sentAt)}</td>
                        <td className="thub-mono">{item.daysInTransit != null ? item.daysInTransit : '—'}</td>
                        <td className="reestr-notes" title={item.notes || ''}>
                          {item.notes?.trim() || '—'}
                        </td>
                      </>
                    )}
                    <td className="!text-center">
                      <div className="inline-flex items-center gap-1.5">
                        {canFleetWagonsUpdate && (
                          <button
                            type="button"
                            className="p-1.5 rounded-lg border border-blue-200/80 bg-blue-50/80 text-blue-600 hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-950/50 dark:text-blue-400 dark:hover:bg-blue-900/60 transition-all hover:scale-110 shadow-2xs cursor-pointer"
                            onClick={() => openEdit(item, compact ? 'holat' : 'full')}
                            aria-label="Tahrirlash"
                            title="Tahrirlash"
                          >
                            <Pencil className="w-4 h-4 stroke-[2]" />
                          </button>
                        )}
                        {canFleetWagonsDelete && !compact && (
                          <button
                            type="button"
                            className="p-1.5 rounded-lg border border-rose-200/80 bg-rose-50/80 text-rose-600 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/50 dark:text-rose-400 dark:hover:bg-rose-900/60 transition-all hover:scale-110 shadow-2xs cursor-pointer"
                            onClick={() => setDeleteId(item.id)}
                            aria-label="O‘chirish"
                            title="O‘chirish"
                          >
                            <Trash2 className="w-4 h-4 stroke-[2]" />
                          </button>
                        )}
                        {!canFleetWagonsUpdate && (!canFleetWagonsDelete || compact) && (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
    );
  };

  const renderWagonToolbar = (
    placeholder: string,
    opts?: { showKindTabs?: boolean; showActions?: boolean },
  ) => {
    const showKindTabs = Boolean(opts?.showKindTabs);
    const showActions = Boolean(opts?.showActions);
    return (
      <div className="thub__toolbar">
        <label className="thub-search">
          <Search className="thub-search__ico" strokeWidth={1.75} aria-hidden />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
          />
          {search ? (
            <button type="button" className="thub-search__x" onClick={() => setSearch('')} aria-label="Tozalash">
              <X className="w-3.5 h-3.5" strokeWidth={2} />
            </button>
          ) : null}
        </label>

        {showKindTabs ? (
          <div className="thub-pills" role="group" aria-label="Tur">
            <button
              type="button"
              className={kindTab === 'sisterna' ? 'is-on' : undefined}
              onClick={() => setKindTab('sisterna')}
            >
              Vagon-sisterna <em>{kindTabCounts.sisterna}</em>
            </button>
            {view === 'majmua' ? (
              <button
                type="button"
                className={kindTab === 'closed' ? 'is-on' : undefined}
                onClick={() => setKindTab('closed')}
              >
                Yopiq turdagi vagon <em>{kindTabCounts.closed}</em>
              </button>
            ) : null}
            <button
              type="button"
              className={kindTab === 'container' ? 'is-on' : undefined}
              onClick={() => setKindTab('container')}
            >
              Konteyner-sisterna <em>{kindTabCounts.container}</em>
            </button>
          </div>
        ) : null}

        {search ? (
          <button type="button" className="fleet__reset" onClick={clearFilters}>
            Filtrni tozalash
          </button>
        ) : null}

        {showActions ? (
          <div className="reestr-actions">
            {canFleetWagonsCreate && (
              <button type="button" className="btn-primary" onClick={openCreate}>
                <Plus className="w-4 h-4" strokeWidth={1.75} />
                Qo‘shish
              </button>
            )}
            <OrderSheetMenu
              items={[
                {
                  key: 'pdf',
                  label: 'PDF saqlash',
                  icon: FileText,
                  disabled: !visible.length,
                  onClick: () => printFleetWagonsPdf('Vagonlar reestri', visible),
                },
                {
                  key: 'export',
                  label: 'Export (Excel)',
                  icon: Download,
                  disabled: !visible.length,
                  onClick: onExport,
                },
                {
                  key: 'import',
                  label: importing ? 'Import...' : 'Import (Excel)',
                  icon: Upload,
                  disabled: importing,
                  onClick: () => fileInputRef.current?.click(),
                },
              ]}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={e => void onImportFile(e.target.files?.[0])}
            />
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="thub reestr">
      <section className="thub__main reestr-main">
        <HubZoneTabs
          label="Park reestri"
          columns={5}
          value={view}
          onChange={goView}
          items={(
            [
              {
                id: 'wagons' as const,
                label: 'Majmua vagonlari',
                hint: 'O‘zimizning park vagonlari',
                icon: TrainFront,
                tone: 'sisterna' as HubZoneTone,
                count: loading ? '—' : majmuaFleetWagons.length,
              },
              {
                id: 'tashqi' as const,
                label: 'Tashqi vagonlar',
                hint: 'Ijara va tashqi vagonlar',
                icon: ExternalLink,
                tone: 'amber' as HubZoneTone,
                count: loading ? '—' : tashqiFleetWagons.length,
              },
              {
                id: 'containers' as const,
                label: 'Konteynerlar',
                hint: 'Barcha konteynerlar',
                icon: Container,
                tone: 'container' as HubZoneTone,
                count: loading ? '—' : activeContainers.length,
              },
              {
                id: 'majmua' as const,
                label: 'Zavod hududida',
                hint: majmuaContainers.length > 0 ? `Jami ${majmuaTotal} ta (${majmuaContainers.length} kon.)` : 'SHGKM — zavod hududida',
                icon: Building2,
                tone: 'closed' as HubZoneTone,
                count: loading ? '—' : majmuaItems.length,
              },
              {
                id: 'attention' as const,
                label: 'Eslatma',
                hint: 'Muddat yaqin / o‘tgan',
                icon: AlertTriangle,
                tone: (attentionTotal > 0 ? 'rose' : 'platform') as HubZoneTone,
                count: loading ? '—' : attentionTotal,
              },
            ]
          )}
        />

        {view === 'containers' ? (
          <ContainersReferencePanel embedded />
        ) : view === 'majmua' || view === 'attention' ? (
          <div className="reestr-attention-stack">
            {renderWagonToolbar(
              view === 'attention'
                ? kindTab === 'container'
                  ? 'Eslatmadagi konteyner…'
                  : 'Eslatmadagi vagon…'
                : kindTab === 'container'
                  ? 'SHGKM dagi konteyner…'
                  : 'SHGKM dagi vagon…',
              { showKindTabs: true },
            )}
            {error && !dialog ? <p className="text-sm text-rose-600">{error}</p> : null}

            {kindTab === 'container' ? (
              <ContainersReferencePanel
                embedded
                slim
                onsiteOnly={view === 'majmua'}
                attentionOnly={view === 'attention'}
                filterQuery={search}
              />
            ) : (
              renderWagonBoard(visible, {
                compact: true,
                showOwnership: true,
                forceAttentionMark: view === 'attention',
                emptyTitle:
                  view === 'attention'
                    ? 'Eslatmadagi vagon-sisterna yo‘q'
                    : kindTab === 'closed'
                      ? 'Yopiq turdagi vagon yo‘q'
                      : 'Vagon-sisterna yo‘q',
                emptyText:
                  view === 'attention'
                    ? 'Depo muddati yaqin yoki o‘tgan vagon-sisternalar shu yerda chiqadi.'
                    : 'SHGKM hududida bu turdagi yuk tashish vositasi hozircha yo‘q.',
              })
            )}
          </div>
        ) : view === 'tashqi' ? (
          <>
            {renderWagonToolbar('Tashqi vagon raqami, manzil, egasi…', { showActions: true })}
            {info ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{info}</p> : null}
            {error && !dialog ? <p className="text-sm text-rose-600">{error}</p> : null}
            {renderWagonBoard(visible, {
              showOwnership: true,
              emptyTitle: 'Tashqi vagonlar yo‘q',
              emptyText: 'Hozircha tizimda tashqi yoki ijara vagonlari mavjud emas.',
            })}
          </>
        ) : (
          <>
            {renderWagonToolbar('Majmua vagoni, manzil, izoh…', { showActions: true })}
            {info ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{info}</p> : null}
            {error && !dialog ? <p className="text-sm text-rose-600">{error}</p> : null}
            {renderWagonBoard(visible)}
          </>
        )}
      </section>

      {dialog ? (
        <div className="reestr-sheet-root" role="presentation">
          <button
            type="button"
            className="reestr-sheet-backdrop"
            aria-label="Yopish"
            onClick={() => !saving && setDialog(null)}
          />
          <div
            className={`reestr-sheet${editScope === 'holat' && dialog === 'edit' ? ' reestr-sheet--sm' : ''}`}
            role="dialog"
            aria-modal="true"
          >
            <div className="reestr-sheet__head">
              <div className="reestr-sheet__icon">
                <TrainFront className="w-5 h-5" strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="reestr-sheet__title">
                  {dialog === 'create'
                    ? 'Parkga vagon qo‘shish'
                    : editScope === 'holat'
                      ? 'Holatni tahrirlash'
                      : 'Vagonni tahrirlash'}
                </h2>
                <p className="reestr-sheet__sub">
                  {dialog === 'edit' && selected ? (
                    <>
                      № <strong>{selected.wagonNumber}</strong>
                      {editScope === 'holat' ? ' · faqat holat' : ' · reestr yozuvi'}
                    </>
                  ) : (
                    'Yangi park yozuvi'
                  )}
                </p>
              </div>
              <button
                type="button"
                className="reestr-sheet__close"
                aria-label="Yopish"
                onClick={() => !saving && setDialog(null)}
              >
                <X className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>

            <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
              <div className="reestr-sheet__body">
                {error ? <p className="reestr-sheet__error">{error}</p> : null}

                {editScope === 'holat' && dialog === 'edit' ? (
                  <div className="space-y-3">
                    <span className="reestr-field__label">Holat</span>
                    <div className="reestr-seg reestr-seg--3">
                      {SERVICEABILITY_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setServiceability(opt.value)}
                          className={`reestr-seg__btn${
                            serviceability === opt.value
                              ? opt.value === 'yaroqsiz'
                                ? ' is-on is-on--bad'
                                : opt.value === 'eslatma'
                                  ? ' is-on is-on--warn'
                                  : ' is-on is-on--ok'
                              : ''
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="reestr-fields">
                    <label className="reestr-field reestr-field--full">
                      <span className="reestr-field__label">Vagon raqami</span>
                      <input
                        required
                        inputMode="numeric"
                        maxLength={8}
                        value={wagonNumber}
                        onChange={e => setWagonNumber(e.target.value.replace(/\D/g, '').slice(0, 8))}
                        className="reestr-field__input reestr-field__input--code"
                        placeholder="12345678"
                      />
                    </label>

                    <label className="reestr-field">
                      <span className="reestr-field__label">Vagon turi</span>
                      <select
                        value={wagonKind}
                        onChange={e => setWagonKind(e.target.value as FleetWagonKind)}
                        className="reestr-field__input"
                      >
                        {WAGON_KIND_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="reestr-field">
                      <span className="reestr-field__label">Ishlab chiqarilgan</span>
                      <DatePicker
                        value={builtAt}
                        onChange={setBuiltAt}
                        placeholder="dd.mm.yyyy"
                      />
                    </label>

                    <label className="reestr-field">
                      <span className="reestr-field__label">Kapital ta’mir</span>
                      <DatePicker
                        value={lastCapitalRepairAt}
                        onChange={setLastCapitalRepairAt}
                        placeholder="dd.mm.yyyy"
                      />
                    </label>

                    <label className="reestr-field">
                      <span className="reestr-field__label">Depo ta’mir</span>
                      <DatePicker
                        value={lastDepotRepairAt}
                        onChange={setLastDepotRepairAt}
                        placeholder="dd.mm.yyyy"
                      />
                    </label>

                    <label className="reestr-field">
                      <span className="reestr-field__label">Qolgan kun</span>
                      <input
                        type="number"
                        value={daysUntilNextDepotRepair}
                        onChange={e => setDaysUntilNextDepotRepair(e.target.value)}
                        className="reestr-field__input"
                        placeholder="120 yoki -5"
                      />
                    </label>

                    <label className="reestr-field">
                      <span className="reestr-field__label">Manzil</span>
                      <input
                        value={destinationStation}
                        onChange={e => setDestinationStation(e.target.value)}
                        className="reestr-field__input"
                        placeholder="Stansiya"
                      />
                    </label>

                    <label className="reestr-field">
                      <span className="reestr-field__label">Yuborilgan</span>
                      <DatePicker
                        value={sentAt}
                        onChange={setSentAt}
                        placeholder="dd.mm.yyyy"
                      />
                    </label>

                    <label className="reestr-field">
                      <span className="reestr-field__label">Yo‘lda (kun)</span>
                      <input
                        type="number"
                        min={0}
                        value={daysInTransit}
                        onChange={e => setDaysInTransit(e.target.value)}
                        className="reestr-field__input"
                      />
                    </label>

                    <label className="reestr-field reestr-field--full">
                      <span className="reestr-field__label">Izoh</span>
                      <input
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        className="reestr-field__input"
                        placeholder="Ixtiyoriy"
                      />
                    </label>

                    {dialog === 'edit' && editScope === 'full' ? (
                      <div className="reestr-field reestr-field--full">
                        <button
                          type="button"
                          className="reestr-toggle w-full text-left"
                          onClick={() => setIsActive(v => !v)}
                        >
                          <span>
                            <span className="reestr-toggle__text">Faol</span>
                            <span className="reestr-toggle__hint">O‘chirilsa, reestrda nofaol bo‘ladi</span>
                          </span>
                          <span className={`reestr-toggle__switch${isActive ? ' is-on' : ''}`} aria-hidden>
                            <span className="reestr-toggle__knob" />
                          </span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="reestr-sheet__foot">
                <button type="button" className="btn-secondary" disabled={saving} onClick={() => setDialog(null)}>
                  Bekor
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Park yozuvini o‘chirish"
        message="Bu vagon raqami parkdan olib tashlanadi. Keyingi kiritishda qayta tanlash kerak bo‘ladi."
        confirmLabel="O‘chirish"
        variant="danger"
        loading={saving}
        onConfirm={() => void remove()}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
