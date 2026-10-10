import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import {
  Calculator,
  FileCheck2,
  FileSpreadsheet,
  FileX,
  Flame,
  Lock,
  Plug,
  Scale,
  TrainFront,
  Truck,
  Unlock,
  Edit3,
  X,
  Search,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { AdminSectionDetail, AdminSectionHub } from '../../../shared/components/AdminSectionHub';
import { HubZoneTabs, type HubZoneTone } from '../../../shared/components/HubZoneTabs';
import { DatePicker } from '../../../shared/components/DatePicker';
import { api } from '../../../shared/services/api';
import type { OneCCredentialsView, OneCWeighingItem, OneCWeighingsResult } from '../../../shared/types';
import { toLatinProductName, toPersonNameCase, toPersonShortName } from '../../../shared/utils/cyrillicToLatin';

const SECTIONS = {
  '1c': {
    title: '1C',
    description: '1C buxgalteriya tizimi bilan integratsiya sozlamalari.',
  },
  'e-gaz': {
    title: 'e-Gaz',
    description: 'e-Gaz tizimi ulanishi va API parametrlari.',
  },
  'e-nakl': {
    title: 'e-Nakl',
    description: 'Elektron nakladnoy (e-Nakl) integratsiyasi.',
  },
  didox: {
    title: 'Didox',
    description: 'Didox elektron hujjat aylanishi.',
  },
  api: {
    title: 'API sozlamalari',
    description: 'Tashqi tizimlar login/paroli — parol hech qachon ochiq ko‘rsatilmaydi.',
  },
} as const;

type SectionKey = keyof typeof SECTIONS;

const HUB_ITEMS = [
  {
    key: '1c',
    title: '1C',
    description: 'Buxgalteriya tizimi · tarozi',
    path: '/admin/integrations/1c',
    icon: Calculator,
    tone: 'blue' as const,
  },
  {
    key: 'e-gaz',
    title: 'e-Gaz',
    description: 'Gaz tizimi integratsiyasi',
    path: '/admin/integrations/e-gaz',
    icon: Flame,
    tone: 'amber' as const,
  },
  {
    key: 'e-nakl',
    title: 'e-Nakl',
    description: 'Elektron nakladnoy',
    path: '/admin/integrations/e-nakl',
    icon: FileSpreadsheet,
    tone: 'emerald' as const,
  },
  {
    key: 'didox',
    title: 'Didox',
    description: 'Elektron hujjat aylanishi',
    path: '/admin/integrations/didox',
    icon: FileCheck2,
    tone: 'violet' as const,
  },
  {
    key: 'api',
    title: 'API sozlamalari',
    description: 'Kalitlar · parollar (xavfsiz)',
    path: '/admin/integrations/api',
    icon: Plug,
    tone: 'cyan' as const,
  },
];

const REFRESH_MS = 30_000;

function toInputDate(yyyyMMdd?: string): string {
  if (!yyyyMMdd || yyyyMMdd.length !== 8) {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  }
  return `${yyyyMMdd.slice(0, 4)}-${yyyyMMdd.slice(4, 6)}-${yyyyMMdd.slice(6, 8)}`;
}

function toApiDate(isoDate: string): string {
  return isoDate.replace(/-/g, '');
}

function todayInput(): string {
  return toInputDate();
}

function monthStartInput(): string {
  const n = new Date();
  return toInputDate(
    `${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, '0')}01`,
  );
}

function formatDateTime(value?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatKg(n: number): string {
  return new Intl.NumberFormat('uz-UZ').format(n);
}

function identityKey(item: OneCWeighingItem): string {
  return [
    item.channel,
    item.wagonNumber,
    item.vehicleId,
    item.invoiceNumber,
    item.datetimeIn,
  ].join('|');
}

function contentSnap(item: OneCWeighingItem): string {
  return [item.datetimeOut, item.tara, item.brutto, item.netto, item.productName, item.stampNumber].join('|');
}

function formatVehicle(raw?: string): { plate: string; trailer?: string } {
  if (!raw || !raw.trim()) return { plate: '—' };
  const str = raw.trim();

  // "70 X 455 HB pp Yo'q" or "70 X 455 HB pp: Yo'q" or "70 X 455 HB pp 70 123 AA"
  const ppMatch = str.match(/^(.*?)(?:\s+(?:pp|пп|p\/p|п\/п)[:\s]*(.*))$/i);
  if (ppMatch) {
    const plate = ppMatch[1].trim();
    let trailer = ppMatch[2].trim();
    if (/^(yo['’`]?q|нет|no|none|-)$/i.test(trailer)) {
      trailer = '';
    }
    return { plate: plate || str, trailer: trailer || undefined };
  }

  if (str.includes('/')) {
    const parts = str.split('/').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return { plate: parts[0], trailer: parts.slice(1).join(' / ') };
    }
  }

  return { plate: str };
}

function getWagonStatus(
  item: OneCWeighingItem,
  onSiteSet: Set<string>,
  exitMap: Map<string, string>
): { status: 'onsite' | 'exited' | 'no_waybill'; regNum?: string } {
  const num = (item.wagonNumber || '').match(/\d{8}/)?.[0] || item.wagonNumber?.trim();
  if (item.isOnSite === true || (num && onSiteSet.has(num))) {
    return { status: 'onsite' };
  }
  const regFromMap = num ? exitMap.get(num) : undefined;
  const regNum = item.registryNumber || regFromMap;
  if (item.isExited || regNum) {
    return { status: 'exited', regNum };
  }
  return { status: 'no_waybill' };
}

function isWagonOnSite(item: OneCWeighingItem, onSiteSet: Set<string>): boolean {
  if (item.isOnSite === true) return true;
  if (item.isOnSite === false && item.isExited === true) return false;
  const num = (item.wagonNumber || '').match(/\d{8}/)?.[0] || item.wagonNumber?.trim();
  if (num && onSiteSet.has(num)) return true;
  return false;
}

function OneCWeighingsPanel() {
  const [tab, setTab] = useState<'railway' | 'auto'>('railway');
  const [sealTab, setSealTab] = useState<'sealed' | 'unsealed'>('unsealed');
  const [searchQuery, setSearchQuery] = useState('');
  const [exitFilter, setExitFilter] = useState<'all' | 'onsite' | 'exited' | 'no_waybill'>('all');
  const [exitedWagonMap, setExitedWagonMap] = useState<Map<string, string>>(new Map());
  const [onSiteWagons, setOnSiteWagons] = useState<Set<string>>(new Set());
  // Plombasiz vagonga plomba qo‘shish
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualWagon, setManualWagon] = useState('');
  const [manualSeal, setManualSeal] = useState('');
  const [manualArrivalId, setManualArrivalId] = useState<string | undefined>();
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualError, setManualError] = useState('');
  const [manualSuccess, setManualSuccess] = useState('');

  const openEditModal = (item: OneCWeighingItem) => {
    if (item.channel !== 'railway' || item.stampNumber?.trim()) return;
    if (!isWagonOnSite(item, onSiteWagons)) return;
    setManualError('');
    setManualSuccess('');
    setManualArrivalId(item.arrivalId);
    setManualWagon(item.wagonNumber || '');
    setManualSeal('');
    setManualModalOpen(true);
  };

  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanWagon = manualWagon.match(/(?:^|\D)(\d{8})(?!\d)/)?.[1] || manualWagon.trim();
    if (!cleanWagon) {
      setManualError('Vagon raqami kiritilishi shart');
      return;
    }
    if (!manualSeal.trim()) {
      setManualError('Plomba raqami yoki o‘rniga yozuv (masalan: BEZ PLOMBA, PLOMBASIZ va h.k.) kiriting');
      return;
    }
    setManualSubmitting(true);
    setManualError('');
    setManualSuccess('');
    try {
      const res = await api.saveOneCManualSeal(cleanWagon, manualSeal.trim(), manualArrivalId);
      if (!res.success) {
        throw new Error(res.message || 'Plombani saqlab bo‘lmadi');
      }

      setResult(previous => previous ? { ...previous, items: previous.items.map(item =>
        item.channel === 'railway' && item.arrivalId === res.data?.arrivalId
          && (item.wagonNumber.match(/(?:^|\D)(\d{8})(?!\d)/)?.[1] || item.wagonNumber.trim()) === cleanWagon
          ? { ...item, stampNumber: manualSeal.trim(), isManualSeal: true } : item) } : previous);
      setManualSuccess(res.message || `✓ Vagon ${cleanWagon} uchun plomba (${manualSeal.trim()}) muvaffaqiyatli saqlandi va qabul qilindi!`);
      setTimeout(() => {
        setManualModalOpen(false);
        setManualSuccess('');
        void load(true);
      }, 1200);
    } catch (err: unknown) {
      setManualError(err instanceof Error ? err.message : 'Xatolik yuz berdi');
    } finally {
      setManualSubmitting(false);
    }
  };
  const [date1, setDate1] = useState(monthStartInput);
  const [date2, setDate2] = useState(todayInput);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<OneCWeighingsResult | null>(null);
  const [updatedKeys, setUpdatedKeys] = useState<Set<string>>(new Set());
  const [newKeys, setNewKeys] = useState<Set<string>>(new Set());
  const prevKeysRef = useRef<Set<string>>(new Set());
  const prevSnapshotRef = useRef<Map<string, string>>(new Map());
  const firstLoadRef = useRef(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const [res, arrivalsRes, registriesRes] = await Promise.all([
        api.getOneCWeighings(toApiDate(date1), toApiDate(date2), {
          sync: false,
          sealedOnly: false,
        }),
        api.getEmptyWagonArrivals().catch(() => null),
        api.getLoadingRegistries().catch(() => null),
      ]);
      if (!res.success || !res.data) {
        setError(res.message || '1C ma’lumotlari olinmadi');
        return;
      }

      const exitMap = new Map<string, string>();
      const onSite = new Set<string>();

      if (arrivalsRes?.data) {
        const arrivalMap = new Map(arrivalsRes.data.map(a => [a.id, a]));

        if (registriesRes?.data) {
          for (const r of registriesRes.data) {
            if (!r.exitedToKengsoyAt) continue;
            const arr = arrivalMap.get(r.emptyWagonArrivalId);
            const wagons = arr?.wagons || [];
            for (const u of wagons) {
              if (u.status !== 'Returned') {
                const num = (u.wagonNumber || '').match(/\d{8}/)?.[0] || u.wagonNumber?.trim();
                if (num) exitMap.set(num, r.registryNumber);
              }
            }
          }
        }

        for (const a of arrivalsRes.data) {
          if (a.stage === 'Exited' || a.stage === 'Cancelled' || a.stage === 'ExitedToKengsoy') {
            const wagons = a.wagons || [];
            for (const u of wagons) {
              if (u.status !== 'Returned') {
                const num = (u.wagonNumber || '').match(/\d{8}/)?.[0] || u.wagonNumber?.trim();
                if (num && !exitMap.has(num)) {
                  exitMap.set(num, 'Chiqgan');
                }
              }
            }
            continue;
          }
          const wagons = a.wagons || [];
          for (const u of wagons) {
            if (!u.scaleExitedAt && u.status !== 'Returned') {
              const num = (u.wagonNumber || '').match(/\d{8}/)?.[0] || u.wagonNumber?.trim();
              if (num) onSite.add(num);
            }
          }
        }
      }
      setOnSiteWagons(onSite);
      setExitedWagonMap(exitMap);

      const next = res.data;
      const nextKeys = new Set(next.items.map(identityKey));
      const nextSnap = new Map(next.items.map(i => [identityKey(i), contentSnap(i)] as const));

      if (!firstLoadRef.current) {
        const added = new Set<string>();
        const changed = new Set<string>();
        for (const k of nextKeys) {
          if (!prevKeysRef.current.has(k)) added.add(k);
          else if (prevSnapshotRef.current.get(k) !== nextSnap.get(k)) changed.add(k);
        }
        setNewKeys(added);
        setUpdatedKeys(changed);
      } else {
        firstLoadRef.current = false;
        setNewKeys(new Set());
        setUpdatedKeys(new Set());
      }

      prevKeysRef.current = nextKeys;
      prevSnapshotRef.current = nextSnap;
      setResult(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  }, [date1, date2]);

  useEffect(() => {
    firstLoadRef.current = true;
    void load(false);
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void load(true);
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const rows = useMemo(() => {
    const items = result?.items ?? [];
    let filtered = items.filter(i => i.channel === tab && (tab !== 'railway'
      || Boolean(i.stampNumber?.trim()) === (sealTab === 'sealed')));

    if (tab === 'railway' && exitFilter !== 'all') {
      filtered = filtered.filter(i => {
        const st = getWagonStatus(i, onSiteWagons, exitedWagonMap).status;
        return st === exitFilter;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const qDigits = q.replace(/\s+/g, '');
      filtered = filtered.filter(i => {
        const wagonRaw = (i.wagonNumber || '').toLowerCase();
        const wagonDigits = (i.wagonNumber || '').replace(/\s+/g, '').toLowerCase();
        return (
          wagonRaw.includes(q) ||
          (qDigits.length >= 3 && wagonDigits.includes(qDigits)) ||
          (i.stampNumber || '').toLowerCase().includes(q) ||
          (i.vehicleId || '').toLowerCase().includes(q) ||
          (i.confidantName || '').toLowerCase().includes(q) ||
          (i.productName || '').toLowerCase().includes(q) ||
          (i.invoiceNumber || '').toLowerCase().includes(q) ||
          (i.weigherName || '').toLowerCase().includes(q)
        );
      });
    }
    return filtered;
  }, [result, tab, sealTab, exitFilter, searchQuery, onSiteWagons, exitedWagonMap]);

  const otherSealMatchCount = useMemo(() => {
    if (tab !== 'railway' || !searchQuery.trim()) return 0;
    const q = searchQuery.toLowerCase().trim();
    const qDigits = q.replace(/\s+/g, '');
    const otherItems = (result?.items ?? []).filter(
      i => i.channel === 'railway' && Boolean(i.stampNumber?.trim()) !== (sealTab === 'sealed')
    );
    return otherItems.filter(i => {
      const wagonRaw = (i.wagonNumber || '').toLowerCase();
      const wagonDigits = (i.wagonNumber || '').replace(/\s+/g, '').toLowerCase();
      return (
        wagonRaw.includes(q) ||
        (qDigits.length >= 3 && wagonDigits.includes(qDigits)) ||
        (i.stampNumber || '').toLowerCase().includes(q) ||
        (i.productName || '').toLowerCase().includes(q) ||
        (i.invoiceNumber || '').toLowerCase().includes(q)
      );
    }).length;
  }, [result, tab, sealTab, searchQuery]);

  const railwayStats = useMemo(() => {
    const list = (result?.items ?? []).filter(i => i.channel === 'railway' && (Boolean(i.stampNumber?.trim()) === (sealTab === 'sealed')));
    let onSiteCount = 0;
    let exitedCount = 0;
    let noWaybillCount = 0;
    for (const item of list) {
      const st = getWagonStatus(item, onSiteWagons, exitedWagonMap).status;
      if (st === 'onsite') onSiteCount++;
      else if (st === 'exited') exitedCount++;
      else noWaybillCount++;
    }
    return { total: list.length, onSite: onSiteCount, exited: exitedCount, noWaybill: noWaybillCount };
  }, [result, sealTab, onSiteWagons, exitedWagonMap]);

  const lastFetched = result?.fetchedAt
    ? formatDateTime(result.fetchedAt)
    : '—';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <label className="thub-date">
            <span>Dan</span>
            <DatePicker
              value={date1}
              onChange={setDate1}
              placeholder="dd.mm.yyyy"
              variant="compact"
            />
          </label>
          <label className="thub-date">
            <span>Gacha</span>
            <DatePicker
              value={date2}
              onChange={setDate2}
              placeholder="dd.mm.yyyy"
              variant="compact"
            />
          </label>
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 space-y-0.5 text-right">
          <p>Avto-yangilanish: har 30 soniya</p>
          <p>Oxirgi yangilanish: {lastFetched}</p>
        </div>
      </div>

      {result?.sync ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
          <p className="font-medium">1C → tizim (plombali temir yo‘l sync)</p>
          <p className="mt-1 text-xs opacity-90">
            Plombali: {result.sync.sealedCandidates} · Yangilangan: {result.sync.updated} ·
            O‘zgarishsiz: {result.sync.skippedUnchanged} · Topilmadi: {result.sync.skippedNoMatch}
            {result.sync.unmatchedWagons.length > 0
              ? ` (${result.sync.unmatchedWagons.slice(0, 8).join(', ')}${result.sync.unmatchedWagons.length > 8 ? '…' : ''})`
              : ''}
          </p>
        </div>
      ) : null}

      <HubZoneTabs
        label="Kanal"
        columns={2}
        value={tab}
        onChange={setTab}
        items={[
          {
            id: 'railway' as const,
            label: 'Temir yo‘l tarozi',
            hint: 'Vagon tortish',
            icon: TrainFront,
            tone: 'sisterna' as HubZoneTone,
            count: (result?.items ?? []).filter(i => i.channel === 'railway').length,
          },
          {
            id: 'auto' as const,
            label: 'Avtotarozi',
            hint: 'Avtotransport tortish',
            icon: Truck,
            tone: 'platform' as HubZoneTone,
            count: (result?.items ?? []).filter(i => i.channel === 'auto').length,
          },
        ]}
      />

      {tab === 'railway' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 items-stretch">
          <div className="min-w-0 [&_.hub-tabs]:mb-0 [&_.hub-tabs]:h-full">
            <HubZoneTabs
              label="Plomba holati"
              columns={2}
              value={sealTab}
              onChange={setSealTab}
              items={[
                {
                  id: 'sealed' as const,
                  label: 'Plombali',
                  hint: 'Plomba raqami bor',
                  icon: Lock,
                  tone: 'done' as HubZoneTone,
                  count: (result?.items ?? []).filter(i => i.channel === 'railway' && i.stampNumber?.trim()).length,
                },
                {
                  id: 'unsealed' as const,
                  label: 'Plombasiz',
                  hint: 'Plomba raqami yo‘q',
                  icon: Unlock,
                  tone: 'amber' as HubZoneTone,
                  count: (result?.items ?? []).filter(i => i.channel === 'railway' && !i.stampNumber?.trim()).length,
                },
              ]}
            />
          </div>

          <div className="min-w-0">
            <div className="h-full min-h-[6.25rem] rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-3 sm:p-3.5 shadow-xs flex flex-col justify-between transition-all focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-500/20">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0 border border-sky-100 dark:border-sky-800/60">
                    <Search className="w-3.5 h-3.5" strokeWidth={2.2} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                      <span>Vagon qidiruvi</span>
                      {searchQuery.trim() && (
                        <span className="text-[11px] font-semibold px-1.5 py-0.2 rounded-md bg-sky-100 text-sky-800 dark:bg-sky-900/70 dark:text-sky-200">
                          {rows.length} ta natija
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                      Vagon raqami, plomba yoki mahsulot bo‘yicha
                    </div>
                  </div>
                </div>
                {searchQuery.trim() && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-[11px] font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    title="Tozalash"
                  >
                    <X className="w-3 h-3" />
                    <span>Tozalash</span>
                  </button>
                )}
              </div>

              <div className="relative mt-2">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Vagon raqamini kiriting (masalan: 58212572)..."
                  className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:bg-white dark:focus:bg-slate-800 transition"
                />
                {searchQuery.trim() && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    title="Tozalash"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {searchQuery.trim() && rows.length === 0 && otherSealMatchCount > 0 && (
                <div className="mt-2 flex items-center justify-between text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1.5 rounded-lg border border-amber-200/80 dark:border-amber-800/60">
                  <span>
                    Ushbu qidiruv bo‘yicha <strong>{sealTab === 'sealed' ? 'Plombasiz' : 'Plombali'}</strong> bo‘limida {otherSealMatchCount} ta vagon topildi.
                  </span>
                  <button
                    type="button"
                    onClick={() => setSealTab(sealTab === 'sealed' ? 'unsealed' : 'sealed')}
                    className="ml-2 font-bold underline hover:opacity-80 shrink-0"
                  >
                    O‘tish →
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 items-stretch">
          <div className="min-w-0">
            <div className="h-full min-h-[6.25rem] rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-3 sm:p-3.5 shadow-xs flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
                <Truck className="w-5 h-5" strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Avtotarozi ma’lumotlari</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Avtotransport va tirkamalar tortish hisoboti</div>
              </div>
            </div>
          </div>

          <div className="min-w-0">
            <div className="h-full min-h-[6.25rem] rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-3 sm:p-3.5 shadow-xs flex flex-col justify-between transition-all focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-500/20">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0 border border-sky-100 dark:border-sky-800/60">
                    <Search className="w-3.5 h-3.5" strokeWidth={2.2} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                      <span>Avtotransport qidiruvi</span>
                      {searchQuery.trim() && (
                        <span className="text-[11px] font-semibold px-1.5 py-0.2 rounded-md bg-sky-100 text-sky-800 dark:bg-sky-900/70 dark:text-sky-200">
                          {rows.length} ta natija
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                      Davlat raqami, haydovchi yoki nakladnoy bo‘yicha
                    </div>
                  </div>
                </div>
                {searchQuery.trim() && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-[11px] font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    title="Tozalash"
                  >
                    <X className="w-3 h-3" />
                    <span>Tozalash</span>
                  </button>
                )}
              </div>

              <div className="relative mt-2">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Davlat raqami, haydovchi, nakladnoy..."
                  className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:bg-white dark:focus:bg-slate-800 transition"
                />
                {searchQuery.trim() && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    title="Tozalash"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="ui-card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          {tab === 'railway' ? (
            <TrainFront className="w-4 h-4 text-sky-600" strokeWidth={1.75} />
          ) : (
            <Truck className="w-4 h-4 text-amber-600" strokeWidth={1.75} />
          )}
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {tab === 'railway' ? (sealTab === 'sealed' ? 'Plombali vagonlar' : 'Plombasiz vagonlar') : 'Avtotarozi'}
          </h3>
          <div className="ml-auto flex flex-wrap items-center gap-2.5">
            {tab === 'railway' && (
              <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700/80 text-xs">
                <button
                  type="button"
                  onClick={() => setExitFilter('all')}
                  className={`px-2.5 py-1 rounded-md font-medium transition ${
                    exitFilter === 'all'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Barchasi ({railwayStats.total})
                </button>
                <button
                  type="button"
                  onClick={() => setExitFilter('onsite')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition ${
                    exitFilter === 'onsite'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                  }`}
                  title="Hozir majmuada (zavod hududida) turgan vagonlar"
                >
                  <Clock className="w-3 h-3" />
                  Zavodda ({railwayStats.onSite})
                </button>
                <button
                  type="button"
                  onClick={() => setExitFilter('exited')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition ${
                    exitFilter === 'exited'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                  }`}
                  title="Yuk xati (WB) bilan Kengsoyga chiqib ketgan vagonlar"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  Chiqib ketgan ({railwayStats.exited})
                </button>
                <button
                  type="button"
                  onClick={() => setExitFilter('no_waybill')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition ${
                    exitFilter === 'no_waybill'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                  }`}
                  title="1C tarozidan o‘tgan, lekin E-Transportda Yuk xati (WB) qilinmagan vagonlar"
                >
                  <FileX className="w-3 h-3" />
                  Yuk xati qilinmagan ({railwayStats.noWaybill})
                </button>
              </div>
            )}
            {tab === 'auto' && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Avto raqam, haydovchi, nakladnoy..."
                  className="pl-8 pr-3 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 w-40 sm:w-56"
                />
              </div>
            )}
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap">
              <Scale className="w-3.5 h-3.5" strokeWidth={1.75} />
              {rows.length} ta
            </span>
          </div>
        </div>

          <div className="admin-table-scroll onec-weighings-scroll">
            <table className="admin-table admin-table--compact onec-weighings-table" aria-label={tab === 'railway' ? (sealTab === 'sealed' ? 'Plombali vagonlar' : 'Plombasiz vagonlar') : 'Avtotarozi'}>
              <thead>
                <tr>
                  <th className="w-12 text-center">№</th>
                  <th>Kirish</th>
                  <th>Chiqish</th>
                  {tab === 'railway' ? (
                    <>
                      <th>Vagon №</th>
                      <th>Hajm (m³)</th>
                      <th>Plomba</th>
                    </>
                  ) : (
                    <>
                      <th>Avto raqam</th>
                      <th>Haydovchi / Ishonchli shaxs</th>
                    </>
                  )}
                  <th>Mahsulot</th>
                  <th>Nakladnoy</th>
                  <th className="text-right">Tara (kg)</th>
                  <th className="text-right">Brutto (kg)</th>
                  <th className="text-right">Netto (kg)</th>
                  <th>Tarozichi</th>
                  <th>Holat / Amal</th>
                </tr>
              </thead>
              <tbody>
                {(loading && !result) || rows.length === 0 ? (
                  <tr><td colSpan={12} className="text-center text-slate-500 py-8">
                    {loading && !result ? '1C dan yuklanmoqda...' : 'Tanlangan sana oralig‘ida yozuv yo‘q.'}
                  </td></tr>
                ) : null}
                {rows.map((item, idx) => {
                  const key = identityKey(item);
                  const isNew = newKeys.has(key);
                  const isUpdated = updatedKeys.has(key);
                  const productLatin = toLatinProductName(item.productName);
                  const weigherShort = toPersonShortName(item.weigherName);
                  const weigherFull = toPersonNameCase(item.weigherName);
                  const confidantShort = toPersonShortName(item.confidantName);
                  const confidantFull = toPersonNameCase(item.confidantName);
                  const wagonInfo = tab === 'railway' ? getWagonStatus(item, onSiteWagons, exitedWagonMap) : null;
                  const onSite = wagonInfo?.status === 'onsite';
                  const exited = wagonInfo?.status === 'exited';
                  const noWaybill = wagonInfo?.status === 'no_waybill';

                  let rowClass = "transition-colors ";
                  if (tab === 'railway' && !item.stampNumber?.trim()) {
                    rowClass += "bg-rose-50/90 dark:bg-rose-950/30 border-l-4 border-l-rose-500 hover:bg-rose-100/70";
                  } else if (isNew) {
                    rowClass += "bg-emerald-100/70 dark:bg-emerald-950/40 border-l-4 border-l-emerald-500 hover:bg-emerald-200/50";
                  } else if (isUpdated) {
                    rowClass += "bg-amber-100/70 dark:bg-amber-950/40 border-l-4 border-l-amber-500 hover:bg-amber-200/50";
                  } else if (tab === 'railway' && onSite) {
                    rowClass += "bg-amber-50/70 dark:bg-amber-950/30 border-l-4 border-l-amber-500 hover:bg-amber-100/70 dark:hover:bg-amber-900/40";
                  } else if (tab === 'railway' && exited) {
                    rowClass += "bg-emerald-50/50 dark:bg-emerald-950/20 border-l-4 border-l-emerald-500 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/30";
                  } else if (tab === 'railway' && noWaybill) {
                    rowClass += "bg-slate-50/80 dark:bg-slate-900/30 border-l-4 border-l-slate-400 hover:bg-slate-100/60 dark:hover:bg-slate-800/40";
                  }

                  return (
                    <tr
                      key={key}
                      className={rowClass}
                    >
                      <td className="text-slate-500 text-center font-mono text-xs">{idx + 1}</td>
                      <td className="whitespace-nowrap text-xs font-mono">{formatDateTime(item.datetimeIn)}</td>
                      <td className="whitespace-nowrap text-xs font-mono">
                        {tab === 'railway' ? (
                          exited ? (
                            <div className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400" title={wagonInfo?.regNum ? `Yuk xati bilan chiqib ketgan: ${wagonInfo.regNum}` : "Yuk xati bilan chiqib ketgan"}>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span>{formatDateTime(item.datetimeOut)}</span>
                            </div>
                          ) : onSite ? (
                            <div className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 bg-amber-100/80 dark:bg-amber-900/40 px-2 py-0.5 rounded-md" title="Hozir zavodda turibdi">
                              <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0 animate-pulse" />
                              <span>Zavodda</span>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-md border border-rose-200 dark:border-rose-800" title="1C tarozidan o‘tgan, lekin E-Transportda Yuk xati (WB) qilinmagan">
                              <FileX className="w-3 h-3 text-rose-500 shrink-0" />
                              <span>Yuk xati qilinmagan</span>
                            </div>
                          )
                        ) : (
                          formatDateTime(item.datetimeOut)
                        )}
                      </td>
                      {tab === 'railway' ? (
                        <>
                          <td className="font-semibold whitespace-nowrap font-mono text-slate-900 dark:text-slate-100">
                            {item.wagonNumber || '—'}
                          </td>
                          <td className="tabular-nums">{item.wagonCapacityM3 || '—'}</td>
                          <td className="max-w-[12rem]" title={item.stampNumber || undefined}>
                            <span className="block truncate font-mono">{item.stampNumber || '—'}</span>
                            {item.isManualSeal && <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">✓ Admin kiritgan</span>}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="whitespace-nowrap">
                            {(() => {
                              const veh = formatVehicle(item.vehicleId);
                              return (
                                <div className="flex flex-col">
                                  <span className="font-bold font-mono text-slate-900 dark:text-slate-100 tracking-wide text-xs">
                                    {veh.plate}
                                  </span>
                                  {veh.trailer ? (
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                                      Pritsep: {veh.trailer}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                      Pritsepsiz
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="max-w-[15rem] truncate" title={confidantFull || undefined}>
                            <span className="font-medium text-slate-800 dark:text-slate-200">
                              {confidantFull || confidantShort || '—'}
                            </span>
                          </td>
                        </>
                      )}
                      <td className="max-w-[16rem]" title={productLatin || undefined}>
                        <span className="block truncate font-medium text-slate-800 dark:text-slate-200">
                          {productLatin || '—'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap font-mono font-medium">{item.invoiceNumber || '—'}</td>
                      <td className="tabular-nums whitespace-nowrap text-right text-slate-600 dark:text-slate-400">{formatKg(item.tara)}</td>
                      <td className="tabular-nums whitespace-nowrap text-right text-slate-600 dark:text-slate-400">{formatKg(item.brutto)}</td>
                      <td className="tabular-nums whitespace-nowrap text-right font-bold text-slate-900 dark:text-white">{formatKg(item.netto)}</td>
                      <td className="max-w-[14rem] text-xs" title={weigherFull || undefined}>
                        {weigherShort ? (
                          <span className="flex flex-col gap-0.5 leading-snug">
                            {weigherShort.split(', ').map((name, i) => (
                              <span key={`${name}-${i}`} className="whitespace-nowrap">{name}</span>
                            ))}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {isNew ? (
                            <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200">
                              Yangi
                            </span>
                          ) : isUpdated ? (
                            <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
                              Yangilandi
                            </span>
                          ) : tab === 'railway' ? (
                            onSite ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 px-2.5 py-0.5 text-[11px] font-semibold">
                                <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                Zavodda
                              </span>
                            ) : exited ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 px-2.5 py-0.5 text-[11px] font-semibold" title={wagonInfo?.regNum ? `Yuk xati: ${wagonInfo.regNum}` : "Chiqib ketgan"}>
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                {wagonInfo?.regNum ? `Chiqgan (${wagonInfo.regNum})` : 'Chiqib ketgan'}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 px-2.5 py-0.5 text-[11px] font-semibold" title="1C da tortilgan, lekin E-Transportda yuk xati qilinmagan">
                                <FileX className="w-3 h-3 text-rose-500" />
                                Yuk xati qilinmagan
                              </span>
                            )
                          ) : tab === 'auto' ? (
                            <span className="inline-flex rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-[10px] font-semibold">
                              ✓ Tortilgan
                            </span>
                          ) : null}

                          {tab === 'railway' && !item.stampNumber?.trim() && (
                            !onSite ? (
                              <button
                                type="button"
                                disabled
                                className="rounded-md border px-2 py-0.5 text-[11px] font-medium inline-flex items-center gap-1 border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-60"
                                title="Vagon allaqachon chiqib ketgan (plomba qo‘shib bo‘lmaydi)"
                              >
                                <Edit3 className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                                Plomba qo‘shish
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openEditModal(item)}
                                className="rounded-md border px-2 py-0.5 text-[11px] font-semibold inline-flex items-center gap-1 transition border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/40 text-rose-700 dark:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-800 cursor-pointer"
                                title="Plomba qo‘shish (yuk xatini chiqarish uchun)"
                              >
                                <Edit3 className="w-3 h-3" />
                                Plomba qo‘shish
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
      </div>

      {/* Plombasiz vagonga plomba qo‘shish modali */}
      {manualModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
              <div className="flex items-center gap-2">
                <Edit3 className="h-5 w-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 dark:text-slate-100">
                  Plombasiz vagonga plomba qo‘shish
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setManualModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveManual} className="p-5 space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Faqat plombasi bo‘lmagan vagonga ushbu shakl orqali istalgan yozuvni (masalan: BEZ PLOMBA, PLOMBASIZ, SHGKM-88421 va h.k.) plomba o‘rniga kiritishingiz mumkin. Kiritilgan yozuv tizimda rasmiy plomba deb qabul qilinadi va Yuk xati tayyorlashda vagon blokdan chiqariladi.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Vagon raqami yoki 1C yozuvi *
                </label>
                <input
                  type="text"
                  required
                  value={manualWagon}
                  readOnly
                  placeholder="Masalan: 54633284 010199/9 010235/7"
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-sm font-mono font-semibold text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Plomba raqami yoki o‘rniga yozuv (istalgan matn) *
                </label>
                <input
                  type="text"
                  value={manualSeal}
                  onChange={e => setManualSeal(e.target.value)}
                  placeholder="Masalan: BEZ PLOMBA, PLOMBASIZ, SHGKM-88421"
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-sm font-medium text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {manualError && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300">
                  {manualError}
                </p>
              )}

              {manualSuccess && (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                  {manualSuccess}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setManualModalOpen(false)}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={manualSubmitting || Boolean(manualSuccess)}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-50"
                >
                  {manualSubmitting ? 'Saqlanmoqda…' : 'Plomba qo‘shish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ApiCredentialsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [snap, setSnap] = useState<OneCCredentialsView | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getOneCCredentials();
      if (!res.success || !res.data) {
        setError(res.message || 'Sozlamalar yuklanmadi');
        return;
      }
      setSnap(res.data);
      setBaseUrl(res.data.baseUrl || '');
      setUsername(res.data.username || '');
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setOk('');
    try {
      const res = await api.saveOneCCredentials({
        baseUrl,
        username,
        password: password.trim() ? password : undefined,
      });
      if (!res.success || !res.data) {
        setError(res.message || 'Saqlashda xatolik');
        return;
      }
      setSnap(res.data);
      setPassword('');
      setOk('Saqlandi. Parol shifrlangan holda saqlandi va API javobida qaytarilmaydi.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
        Parol brauzer va API javoblarida ochiq ko‘rinmaydi. Faqat Admin saqlay oladi; serverda Data Protection bilan shifrlanadi.
      </div>

      <div className="ui-card p-4 sm:p-5 space-y-4">
        <div className="flex items-start gap-3">
          <span className="admin-hub-icon admin-hub-icon--blue admin-hub-icon--md">
            <Calculator className="w-5 h-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">1C — Tarozi API</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              POST /vesii/dannie_po_vesam · Basic auth
              {snap?.passwordConfigured ? (
                <span className="ml-2 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200">
                  Parol saqlangan
                </span>
              ) : (
                <span className="ml-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
                  Parol yo‘q
                </span>
              )}
            </p>
            {snap?.source ? (
              <p className="text-[11px] text-slate-400 mt-1">
                Manba: {snap.source === 'database' ? 'shifrlangan DB' : snap.source === 'environment' ? 'server environment' : 'sozlanmagan'}
                {snap.updatedAt ? ` · ${new Date(snap.updatedAt).toLocaleString('uz-UZ')}` : ''}
              </p>
            ) : null}
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Yuklanmoqda...</p>
        ) : (
          <form className="admin-user-form max-w-xl" onSubmit={handleSave}>
            <label className="admin-field">
              <span>API URL *</span>
              <input
                required
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                placeholder="https://…/vesii/dannie_po_vesam"
                autoComplete="off"
              />
            </label>
            <label className="admin-field">
              <span>Login *</span>
              <input
                required
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="1C foydalanuvchi"
                autoComplete="username"
              />
            </label>
            <label className="admin-field">
              <span>Parol {snap?.passwordConfigured ? '(o‘zgartirish ixtiyoriy)' : '*'}</span>
              <div className="flex gap-2">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={snap?.passwordConfigured ? '••••••••  (o‘zgartirish uchun yozing)' : 'Parolni kiriting'}
                  autoComplete="new-password"
                  required={!snap?.passwordConfigured}
                  className="flex-1"
                />
                <button
                  type="button"
                  className="btn-secondary !px-3"
                  onClick={() => setShowPassword(v => !v)}
                >
                  {showPassword ? 'Yashirish' : 'Ko‘rsatish'}
                </button>
              </div>
              <span className="mt-1 block text-[11px] text-slate-400">
                Mavjud parol serverdan hech qachon o‘qib berilmaydi — faqat yangisini yozib saqlaysiz.
              </span>
            </label>

            {error ? <p className="confirm-dialog__error">{error}</p> : null}
            {ok ? (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                {ok}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2 pt-1">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => void load()} disabled={saving || loading}>
                Bekor / qayta yuklash
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="ui-card p-4 sm:p-5 opacity-70">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">e-Gaz · e-Nakl · Didox</h3>
        <p className="text-xs text-slate-500 mt-1">Keyingi bosqichda shu yerda xavfsiz credential formlari qo‘shiladi.</p>
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  const { system } = useParams<{ system?: string }>();

  if (!system) {
    return (
      <AdminSectionHub
        title="Integratsiyalar"
        description="Tashqi tizimlar va API sozlamalari."
        items={HUB_ITEMS}
      />
    );
  }

  if (!(system in SECTIONS)) {
    return <Navigate to="/admin/integrations" replace />;
  }

  const meta = SECTIONS[system as SectionKey];

  if (system === '1c') {
    return (
      <AdminSectionDetail
        title="1C — Tarozi ma’lumotlari"
        description=""
        backTo="/admin/integrations"
      >
        <OneCWeighingsPanel />
      </AdminSectionDetail>
    );
  }

  if (system === 'api') {
    return (
      <AdminSectionDetail
        title="API sozlamalari"
        description="Tashqi tizimlar URL, login va paroli. Parol ochiq saqlanmaydi va API orqali qaytarilmaydi."
        backTo="/admin/integrations"
      >
        <ApiCredentialsPanel />
      </AdminSectionDetail>
    );
  }

  return (
    <AdminSectionDetail
      title={meta.title}
      description={meta.description}
      backTo="/admin/integrations"
    />
  );
}
