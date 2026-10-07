import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Container,
  Info,
  Plus,
  Save,
  TrainFront,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import type { CatalogProduct, EmptyWagonArrival, EmptyWagonUnit } from '../types';
import {
  WAGON_OWNERSHIP,
  normalizeWagonOwnership,
  wagonOwnershipLabel,
  type WagonOwnership,
} from '../constants/wagonOwnership';
import { parseWagonAndCisterns } from '../utils/intakeOwnership';
import {
  WAGON_INTAKE_LOAD_STATE,
  WAGON_INTAKE_LOAD_STATE_OPTIONS,
  normalizeIntakeLoadState,
  type WagonIntakeLoadState,
} from '../constants/wagonIntakeLoadState';
import { LOGISTICS_TYPES } from '../constants/logisticsTypes';
import { notifyOrdersChanged } from '../utils/realtimeSync';
import { notifyWagonAdded } from '../services/telegramService';
import {
  isWagonKind,
  WAGON_KIND_LABEL,
  WAGON_KIND_SUBTITLE,
  type WagonKind,
} from '../utils/wagonKinds';
import { WagonKindArt } from './WagonKindArt';

type OwnershipSource = 'lookup' | 'default' | 'unset';

const WAGON_KINDS: WagonKind[] = ['sisterna', 'closed', 'platform'];

const INTAKE_BLOCKING_STAGES = new Set([
  'KengsoyInspection',
  'SecurityInspection',
  '',
]);

const OCCUPIED_ON_SITE_STAGES = new Set([
  'RailwayInspected',
  'KengsoyInspection',
  'SecurityInspection',
  'ReadyForEstakada',
  'TareWeighing',
  'EstakadaPlaced',
  'Loading',
  'Loaded',
  'ToRailwayScale',
  'GrossWeighed',
  'SealInstallation',
  'Sealed',
  'RegistryPrepared',
  'DocumentsIssued',
]);

function parseList(value?: string[] | string | null): string[] {
  if (Array.isArray(value)) return value.map(v => v.trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map(v => v.trim()).filter(Boolean);
  }
  return [];
}

function parseContainers(raw?: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/\s*[|;·]\s*|\s*,\s*/)
    .map(v => v.trim())
    .filter(Boolean);
}

function joinContainers(list: string[]): string {
  return list.map(v => v.trim()).filter(Boolean).join(' | ');
}

function normalizeWagonNumber(value: string): string {
  return value.replace(/\D/g, '').slice(0, 8);
}

function isValidWagonNumber(value: string): boolean {
  return /^\d{8}$/.test(value.trim());
}

function normalizeCode(value: string): string {
  return value.trim().toLowerCase();
}

function collectCisternCodes(raw?: string | null): string[] {
  return parseContainers(raw).map(normalizeCode).filter(Boolean);
}

function containerLookupCandidates(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const trimmed = raw.trim();
    if (trimmed.length < 2) continue;
    const key = normalizeCode(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function newContainerRow(value = ''): { id: string; value: string } {
  return {
    id: `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    value,
  };
}

async function resolveIntakeOwnership(
  wagonNumber: string,
  containerNumbers: string[],
): Promise<{ ownership: WagonOwnership; source: 'lookup' | 'default' }> {
  let fleetOwnership: WagonOwnership | null = null;
  try {
    const wagonRes = await api.lookupFleetWagon(wagonNumber.trim());
    if (wagonRes.data?.found && wagonRes.data.ownership) {
      fleetOwnership = normalizeWagonOwnership(wagonRes.data.ownership);
      if (fleetOwnership === WAGON_OWNERSHIP.Majmua) {
        return { ownership: WAGON_OWNERSHIP.Majmua, source: 'lookup' };
      }
    }
  } catch {
    /* ignore */
  }

  for (const code of containerLookupCandidates(containerNumbers)) {
    try {
      const res = await api.lookupContainer(code);
      if (res.data?.found) {
        return { ownership: WAGON_OWNERSHIP.Majmua, source: 'lookup' };
      }
    } catch {
      /* ignore */
    }
  }

  if (fleetOwnership) {
    return { ownership: fleetOwnership, source: 'lookup' };
  }

  return { ownership: WAGON_OWNERSHIP.Tashqi, source: 'default' };
}

function buildOccupied(
  arrivals: EmptyWagonArrival[],
  sessionWagons: string[],
  sessionCisterns: string[],
  skipUnitId?: string,
) {
  const wagons = new Set<string>(sessionWagons);
  const cisterns = new Set<string>(sessionCisterns);

  for (const a of arrivals) {
    if (!OCCUPIED_ON_SITE_STAGES.has(a.stage || '')) continue;
    const units = a.wagons ?? [];
    if (units.length > 0) {
      for (const u of units) {
        if (skipUnitId && u.id === skipUnitId) continue;
        // Agar vagon zavoddan chiqib ketgan bo'lsa yoki qaytarilgan bo'lsa, band deb hisoblanmaydi
        if (u.scaleExitedAt || u.status === 'Returned') continue;
        if (u.wagonNumber?.trim()) wagons.add(normalizeCode(u.wagonNumber));
        for (const code of collectCisternCodes(u.cisternNumber)) cisterns.add(code);
      }
    } else {
      for (const n of parseList(a.verifiedWagonNumbers || a.wagonNumbers)) {
        wagons.add(normalizeCode(n));
      }
      for (const slot of parseList(a.cisternNumbers)) {
        for (const code of collectCisternCodes(slot)) cisterns.add(code);
      }
    }
  }

  return { wagons, cisterns };
}

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  arrivals?: EmptyWagonArrival[];
  edit?: { arrivalId: string; unit: EmptyWagonUnit } | null;
};

type KeepGoingInfo = {
  kind: WagonKind;
  wagon: string;
  cisterns: string[];
};

/**
 * Dialog qobig‘i. «Ro‘yxatga kiritish» bosilganda vagon bazaga saqlanadi,
 * orqada jadvalda darhol aks etadi va keyingi vagonni kiritish davom etadi.
 */
export function EmptyWagonIntakeDialog({ open, onClose, onSaved, arrivals = [], edit = null }: Props) {
  const [sessionWagons, setSessionWagons] = useState<string[]>([]);
  const [sessionCisterns, setSessionCisterns] = useState<string[]>([]);

  useEffect(() => {
    if (!open) {
      setSessionWagons([]);
      setSessionCisterns([]);
    }
  }, [open]);

  if (!open) return null;

  const handleKeepGoing = (info: KeepGoingInfo) => {
    setSessionWagons(prev =>
      prev.includes(normalizeCode(info.wagon)) ? prev : [...prev, normalizeCode(info.wagon)],
    );
    if (info.cisterns.length > 0) {
      setSessionCisterns(prev => {
        const next = [...prev];
        for (const c of info.cisterns) {
          if (!next.includes(c)) next.push(c);
        }
        return next;
      });
    }
  };

  return (
    <div className="confirm-dialog-root" role="presentation">
      <button type="button" className="confirm-dialog-backdrop" aria-label="Yopish" onClick={onClose} />
      <div
        className="confirm-dialog !max-w-[42rem] !w-[min(42rem,calc(100vw-1.5rem))] !max-h-[min(92vh,850px)] !overflow-y-auto !p-6 sm:!p-7"
        role="dialog"
        aria-modal="true"
      >
        <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
          {!edit ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-sky-800 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200"
              title="Shu oynada kiritilgan vagonlar soni"
            >
              <TrainFront className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              {sessionWagons.length > 0 ? `${sessionWagons.length} ta vagon kiritildi` : 'Partiya kiritish'}
            </span>
          ) : null}
          <button type="button" className="confirm-dialog__close !static" aria-label="Yopish" onClick={onClose}>
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="confirm-dialog__header !mb-5 !pr-28">
          <div className="confirm-dialog__icon !bg-sky-50 !text-sky-600 dark:!bg-sky-950/50 dark:!text-sky-300">
            <TrainFront className="w-5 h-5" strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="confirm-dialog__title">
              {edit ? 'Vagonni tahrirlash' : 'Jarayonga vagon kiritish'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Vagon ma'lumotlarini kiriting va reestrni belgilang
            </p>
          </div>
        </div>

        <IntakeFormBody
          edit={edit}
          arrivals={arrivals}
          sessionWagons={sessionWagons}
          sessionCisterns={sessionCisterns}
          onClose={onClose}
          onSaved={onSaved}
          onKeepGoing={handleKeepGoing}
        />
      </div>
    </div>
  );
}

type BodyProps = {
  edit: { arrivalId: string; unit: EmptyWagonUnit } | null;
  arrivals: EmptyWagonArrival[];
  sessionWagons: string[];
  sessionCisterns: string[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onKeepGoing: (info: KeepGoingInfo) => void;
};

function IntakeFormBody({
  edit,
  arrivals,
  sessionWagons,
  sessionCisterns,
  onClose,
  onSaved,
  onKeepGoing,
}: BodyProps) {
  const isEdit = !!edit;
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [wagonKind, setWagonKind] = useState<WagonKind>(() => {
    if (edit?.unit && isWagonKind(edit.unit.wagonType)) return edit.unit.wagonType;
    return 'sisterna';
  });
  const [wagonNumber, setWagonNumber] = useState(() =>
    edit?.unit ? normalizeWagonNumber(edit.unit.wagonNumber || '') : '',
  );
  const [containerRows, setContainerRows] = useState(() => {
    if (edit?.unit) {
      const kind = isWagonKind(edit.unit.wagonType) ? edit.unit.wagonType : 'sisterna';
      if (kind === 'platform') {
        const parsed = parseContainers(edit.unit.cisternNumber);
        return parsed.length > 0 ? parsed.map(v => newContainerRow(v)) : [newContainerRow()];
      }
    }
    return [newContainerRow()];
  });
  const [ownership, setOwnership] = useState<WagonOwnership | null>(() =>
    edit?.unit ? normalizeWagonOwnership(edit.unit.ownership) : null,
  );
  const [, setOwnershipSource] = useState<OwnershipSource>('unset');
  const editArrival = useMemo(
    () => (edit ? arrivals.find(a => a.id === edit.arrivalId) ?? null : null),
    [arrivals, edit],
  );
  const openInspectedArrival = useMemo(
    () => arrivals.find(a => (a.stage || '') === 'RailwayInspected') ?? null,
    [arrivals],
  );
  const [productType, setProductType] = useState(() => {
    if (edit?.unit?.productType?.trim()) return edit.unit.productType.trim();
    if (editArrival?.productType?.trim()) return editArrival.productType.trim();
    if (openInspectedArrival?.productType?.trim() && !openInspectedArrival.productType.includes(',')) {
      return openInspectedArrival.productType.trim();
    }
    return '';
  });
  const [intakeLoadState, setIntakeLoadState] = useState<WagonIntakeLoadState>(() =>
    normalizeIntakeLoadState(edit?.unit?.intakeLoadState),
  );
  const [lookupPending, setLookupPending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const wagonInputRef = useRef<HTMLInputElement>(null);

  const containers = useMemo(() => containerRows.map(r => r.value), [containerRows]);

  useEffect(() => {
    let cancelled = false;
    setProductsLoading(true);
    api.getProducts(LOGISTICS_TYPES.Railway)
      .then(res => {
        if (cancelled) return;
        setProducts((res.data ?? []).filter(p => p.isActive !== false));
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      })
      .finally(() => {
        if (!cancelled) setProductsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const blockingIntake = useMemo(
    () => arrivals.find(a => INTAKE_BLOCKING_STAGES.has(a.stage || '')) ?? null,
    [arrivals],
  );
  const hasOpenInspected = useMemo(
    () => arrivals.some(a => (a.stage || '') === 'RailwayInspected'),
    [arrivals],
  );
  const intakeBlockedReason =
    !isEdit && blockingIntake && !hasOpenInspected
      ? 'Oldingi partiya ICHDX xabarnomasi, Ruxsatnoma byurosi va Qo‘riqlash tasdig‘idan o‘tmaguncha yangi vagon kiritib bo‘lmaydi'
      : '';

  const { wagons: occupiedNumbers, cisterns: occupiedCisterns } = useMemo(
    () => buildOccupied(arrivals, sessionWagons, sessionCisterns, edit?.unit.id),
    [arrivals, sessionWagons, sessionCisterns, edit?.unit.id],
  );

  const wagonNumberOk = isValidWagonNumber(wagonNumber);
  const wagonNumberConflict = wagonNumberOk && occupiedNumbers.has(normalizeCode(wagonNumber));
  const showContainers = wagonKind === 'platform';

  const containerConflicts = useMemo(() => {
    const conflicts = new Set<number>();
    const seen = new Map<string, number>();
    containers.forEach((raw, index) => {
      const code = normalizeCode(raw);
      if (!code || code.length < 2) return;
      if (occupiedCisterns.has(code)) {
        conflicts.add(index);
        return;
      }
      const prev = seen.get(code);
      if (prev !== undefined) {
        conflicts.add(prev);
        conflicts.add(index);
      } else {
        seen.set(code, index);
      }
    });
    return conflicts;
  }, [containers, occupiedCisterns]);

  const hasContainerConflict = containerConflicts.size > 0;

  useEffect(() => {
    if (intakeBlockedReason) setError(intakeBlockedReason);
  }, [intakeBlockedReason]);

  useEffect(() => {
    if (!isValidWagonNumber(wagonNumber)) {
      setOwnership(null);
      setOwnershipSource('unset');
      setLookupPending(false);
      return;
    }

    let cancelled = false;
    setLookupPending(true);
    const timer = window.setTimeout(() => {
      const containerCodes = showContainers ? containers : [];
      void resolveIntakeOwnership(wagonNumber, containerCodes)
        .then(result => {
          if (cancelled) return;
          setOwnership(result.ownership);
          setOwnershipSource(result.source);
        })
        .catch(() => {
          if (cancelled) return;
          setOwnership(WAGON_OWNERSHIP.Tashqi);
          setOwnershipSource('default');
        })
        .finally(() => {
          if (!cancelled) setLookupPending(false);
        });
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [wagonNumber, containers, showContainers]);

  const canSubmit =
    !submitting
    && !lookupPending
    && !productsLoading
    && wagonNumberOk
    && !!ownership
    && !wagonNumberConflict
    && !hasContainerConflict
    && !intakeBlockedReason;

  const validate = (): string | null => {
    if (!intakeLoadState) return 'Kelish holatini tanlang';
    if (!wagonKind) return 'Vagon turini tanlang';
    if (!isValidWagonNumber(wagonNumber)) return 'Vagon raqami 8 xonali bo‘lishi kerak';
    if (!ownership) return 'Tegishlilik aniqlanmadi — raqamni tekshiring';
    if (wagonNumberConflict) {
      return `Bu vagon raqami allaqachon kiritilgan yoki zavod hududida: ${wagonNumber.trim()}.`;
    }
    if (showContainers && hasContainerConflict) {
      const bad = containers
        .filter((_, i) => containerConflicts.has(i))
        .map(c => c.trim())
        .filter(Boolean);
      return bad.length === 1
        ? `Bu sisterna/konteyner raqami band yoki takroriy: ${bad[0]}. Boshqa raqam kiriting.`
        : `Bu sisterna/konteyner raqamlari band yoki takroriy: ${bad.join(', ')}.`;
    }
    if (intakeBlockedReason) return intakeBlockedReason;
    return null;
  };

  const submit = async (andAnother: boolean) => {
    if (!andAnother && !wagonNumber.trim() && sessionWagons.length > 0) {
      onClose();
      return;
    }

    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }

    const savedKind = wagonKind;
    const savedWagon = wagonNumber.trim();
    const savedProduct = productType.trim();
    const savedLoadState = intakeLoadState;
    const savedCisterns = showContainers
      ? containerLookupCandidates(containers).map(normalizeCode)
      : [];

    setSubmitting(true);
    setError('');
    try {
      if (isEdit && edit) {
        const res = await api.updateEmptyWagonUnit(edit.arrivalId, edit.unit.id, {
          wagonNumber: savedWagon,
          cisternNumber: showContainers ? joinContainers(containers) : '',
          wagonType: wagonKind,
          ownership: ownership ?? WAGON_OWNERSHIP.Tashqi,
          intakeLoadState: savedLoadState,
          productType: savedProduct,
        });
        if (!res.success) throw new Error(res.message || 'Saqlashda xatolik');
        notifyOrdersChanged();
        await Promise.resolve(onSaved());
        onClose();
        return;
      }

      const res = await api.createRailwayWagonIntake({
        wagonCount: 1,
        wagonNumbers: savedWagon,
        productType: savedProduct,
        cisternNumbers: showContainers ? joinContainers(containers) : '',
        wagonTypes: wagonKind,
        ownerships: ownership ?? WAGON_OWNERSHIP.Tashqi,
        intakeLoadStates: savedLoadState,
      });
      if (!res.success) throw new Error(res.message || 'Saqlashda xatolik');
      notifyWagonAdded({ wagonNumbers: [savedWagon], count: 1, productType: savedProduct });
      notifyOrdersChanged();
      await Promise.resolve(onSaved());

      if (andAnother) {
        onKeepGoing({ kind: savedKind, wagon: savedWagon, cisterns: savedCisterns });
        setWagonKind(savedKind);
        setProductType(savedProduct);
        setIntakeLoadState(savedLoadState);
        setWagonNumber('');
        setOwnership(null);
        setOwnershipSource('unset');
        setLookupPending(false);
        setError('');
        setContainerRows(prev => {
          if (savedKind !== 'platform') return [newContainerRow()];
          const count = Math.max(1, prev.length);
          return Array.from({ length: count }, () => newContainerRow());
        });
        window.setTimeout(() => wagonInputRef.current?.focus(), 40);
      } else {
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik yuz berdi');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      className="space-y-4"
      autoComplete="off"
      onSubmit={e => {
        e.preventDefault();
        void submit(false);
      }}
    >
      {/* Vagon turi */}
      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 block">
          Vagon turi <span className="text-rose-500">*</span>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="group" aria-label="Vagon turi">
          {WAGON_KINDS.map(kind => {
            const isSelected = wagonKind === kind;
            return (
              <button
                key={kind}
                type="button"
                className={`relative group flex flex-col items-center justify-between p-3.5 rounded-2xl border-2 transition-all duration-200 cursor-pointer text-left ${
                  isSelected
                    ? 'border-sky-500 bg-sky-50/60 dark:bg-sky-950/40 shadow-sm ring-1 ring-sky-500/30'
                    : 'border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/80 dark:border-slate-700/80 dark:bg-slate-800/50 dark:hover:bg-slate-800'
                }`}
                onClick={() => {
                  setWagonKind(kind);
                  if (kind !== 'platform') setContainerRows([newContainerRow()]);
                  else if (containerRows.every(r => !r.value.trim())) setContainerRows([newContainerRow()]);
                }}
              >
                <div className="absolute top-2.5 right-2.5">
                  {isSelected ? (
                    <div className="w-5 h-5 rounded-full bg-sky-500 text-white flex items-center justify-center shadow-xs">
                      <Check className="w-3.5 h-3.5" strokeWidth={3} />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-slate-300 dark:border-slate-600 group-hover:border-slate-400" />
                  )}
                </div>
                <WagonKindArt kind={kind} className="h-14 w-28 my-0.5 rounded-lg transition-transform group-hover:scale-105" />
                <div className="text-center w-full mt-1">
                  <div className={`font-bold text-sm tracking-tight ${isSelected ? 'text-sky-950 dark:text-sky-100' : 'text-slate-800 dark:text-slate-200'}`}>
                    {WAGON_KIND_LABEL[kind]}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {WAGON_KIND_SUBTITLE[kind]}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2-Column Hero Layout: Vagon raqami on Left, Mahsulot & Kelish holati on Right (Replacing old Ma'lumot box) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
        {/* LEFT COLUMN: Vagon Raqami */}
        <div className="p-4 rounded-2xl border border-slate-200/80 bg-slate-50/50 dark:border-slate-700/60 dark:bg-slate-800/30 flex flex-col justify-between space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Vagon raqami <span className="text-rose-500">*</span>
              </label>
              <div
                className="group relative cursor-help text-slate-400 hover:text-sky-600 transition-colors"
                title="Vagon raqami temir yo'l inventar raqamidir (8 xonali). Masalan: 54633508"
              >
                <Info className="w-4 h-4" strokeWidth={2} />
              </div>
            </div>

            <div className="relative">
              <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sky-600 dark:text-sky-400">
                <TrainFront className="w-5 h-5" strokeWidth={2} />
              </div>
              <input
                ref={wagonInputRef}
                required
                inputMode="numeric"
                autoComplete="off"
                name="wagon-inventory-number"
                spellCheck={false}
                autoFocus
                value={wagonNumber}
                onChange={e => {
                  const val = e.target.value;
                  if (val.includes('/') || (val.length > 8 && /[\s,]/.test(val))) {
                    const parsed = parseWagonAndCisterns(val);
                    if (parsed.wagonNumber) {
                      setWagonNumber(parsed.wagonNumber);
                      if (parsed.cisternNumbers.length > 0) {
                        setWagonKind('platform');
                        setContainerRows(parsed.cisternNumbers.map(c => newContainerRow(c)));
                      }
                      setOwnership(null);
                      setOwnershipSource('unset');
                      if (error) setError('');
                      return;
                    }
                  }
                  setWagonNumber(normalizeWagonNumber(val));
                  setOwnership(null);
                  setOwnershipSource('unset');
                  if (error) setError('');
                }}
                onPaste={e => {
                  const pasted = e.clipboardData.getData('text');
                  if (pasted && (pasted.includes('/') || (pasted.length > 8 && /[\s,]/.test(pasted)))) {
                    e.preventDefault();
                    const parsed = parseWagonAndCisterns(pasted);
                    if (parsed.wagonNumber) {
                      setWagonNumber(parsed.wagonNumber);
                      if (parsed.cisternNumbers.length > 0) {
                        setWagonKind('platform');
                        setContainerRows(parsed.cisternNumbers.map(c => newContainerRow(c)));
                      }
                      setOwnership(null);
                      setOwnershipSource('unset');
                      if (error) setError('');
                    }
                  }
                }}
                placeholder="54633508"
                className={`w-full pl-11 pr-10 py-2.5 rounded-xl border text-lg font-mono font-bold tracking-widest outline-none transition-all ${
                  wagonNumberConflict
                    ? 'border-rose-400 bg-rose-50/50 text-rose-900 focus:ring-2 focus:ring-rose-400/30 dark:bg-rose-950/30 dark:text-rose-200'
                    : wagonNumberOk
                    ? 'border-emerald-500 bg-emerald-50/30 text-emerald-900 focus:ring-2 focus:ring-emerald-400/30 dark:bg-emerald-950/30 dark:text-emerald-200'
                    : 'border-slate-300 bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100'
                }`}
                aria-invalid={wagonNumberConflict}
              />
              {wagonNumberOk && !wagonNumberConflict ? (
                <Check
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-500"
                  strokeWidth={2.5}
                />
              ) : null}
            </div>
          </div>

          {/* Visual slot indicator dots + character counter */}
          <div>
            <div className="flex items-center justify-between gap-1 mb-1.5 px-0.5">
              <div className="flex items-center gap-1">
                {Array.from({ length: 8 }).map((_, idx) => {
                  const isFilled = idx < wagonNumber.length;
                  const isCurrent = idx === wagonNumber.length && wagonNumber.length < 8;
                  return (
                    <div
                      key={idx}
                      className={`h-1.5 rounded-full transition-all duration-200 ${
                        isFilled
                          ? wagonNumberConflict
                            ? 'w-3.5 bg-rose-500'
                            : 'w-3.5 bg-sky-500'
                          : isCurrent
                          ? 'w-3.5 bg-sky-300 animate-pulse'
                          : 'w-2 bg-slate-200 dark:bg-slate-700'
                      }`}
                    />
                  );
                })}
              </div>
              <span
                className={`text-[11px] font-mono font-medium tabular-nums ${
                  wagonNumberConflict
                    ? 'text-rose-600 font-bold'
                    : wagonNumberOk
                    ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                    : 'text-slate-400'
                }`}
              >
                {wagonNumberConflict
                  ? 'Zavod hududida'
                  : wagonNumberOk
                  ? 'Tayyor (8/8)'
                  : `${wagonNumber.length} / 8 xona`}
              </span>
            </div>

            <div className="min-h-[1.25rem] flex items-center justify-between text-[11px]">
              {lookupPending ? (
                <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  Tekshirilmoqda…
                </span>
              ) : wagonNumberConflict ? (
                <span className="text-rose-600 dark:text-rose-400 font-medium">
                  Zavod hududida mavjud vagon
                </span>
              ) : ownership ? (
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${
                    ownership === WAGON_OWNERSHIP.Majmua
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
                  }`}
                >
                  {wagonOwnershipLabel(ownership)}
                </span>
              ) : (
                <span className="text-slate-400">Inventar raqami (8 xonali)</span>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Mahsulot & Kelish holati (Replacing old Ma'lumot box!) */}
        <div className="p-4 rounded-2xl border border-slate-200/80 bg-slate-50/50 dark:border-slate-700/60 dark:bg-slate-800/30 flex flex-col justify-between space-y-3.5">
          {/* Mahsulot (Ixtiyoriy) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 block">
              Mahsulot <span className="text-slate-400 font-normal lowercase tracking-normal text-[11px] ml-1">(ixtiyoriy)</span>
            </label>
            <select
              value={productType}
              disabled={productsLoading}
              onChange={e => {
                setProductType(e.target.value);
                if (error) setError('');
              }}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-800 shadow-2xs outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800 transition-all cursor-pointer"
            >
              <option value="">{productsLoading ? 'Yuklanmoqda…' : 'Tanlanmagan'}</option>
              {products.map(p => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
            {openInspectedArrival?.productType && productType && !openInspectedArrival.productType.includes(productType) ? (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                ⚠️ Partiyadagi asosiy mahsulot: {openInspectedArrival.productType}
              </p>
            ) : null}
          </div>

          {/* Kelish holati */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 block">
              Kelish holati <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Kelish holati">
              {WAGON_INTAKE_LOAD_STATE_OPTIONS.map(opt => {
                const isSelected = intakeLoadState === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    className={`px-3 py-2 rounded-xl border text-center transition-all duration-150 cursor-pointer ${
                      isSelected
                        ? opt.key === WAGON_INTAKE_LOAD_STATE.Bosh
                          ? 'border-sky-500 bg-sky-500 text-white font-bold shadow-xs'
                          : 'border-amber-500 bg-amber-500 text-white font-bold shadow-xs'
                        : 'border-slate-200 bg-white hover:bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                    onClick={() => {
                      setIntakeLoadState(opt.key);
                      if (error) setError('');
                    }}
                  >
                    <div className="text-xs leading-tight font-bold">{opt.title}</div>
                    <div
                      className={`text-[10px] mt-0.5 leading-none opacity-80 line-clamp-1 ${
                        isSelected ? 'text-white' : 'text-slate-400'
                      }`}
                    >
                      {opt.subtitle}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Konteynerlar (Fiting platforma bo'lganda) */}
      {showContainers ? (
        <div className="p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/50 dark:border-slate-700/60 dark:bg-slate-800/30 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Konteynerlar
              </span>
              <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                ({containerRows.length} ta)
              </span>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200/80 hover:bg-sky-100 dark:bg-sky-950/60 dark:border-sky-800 dark:text-sky-300 transition-all cursor-pointer shadow-2xs"
              onClick={() => setContainerRows([...containerRows, newContainerRow()])}
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
              Konteyner qo‘shish
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {containerRows.map((row, index) => {
              const conflict = containerConflicts.has(index);
              return (
                <div
                  key={row.id}
                  className={`relative flex items-center rounded-xl border bg-white dark:bg-slate-900 transition-all ${
                    conflict
                      ? 'border-rose-400 ring-1 ring-rose-400/30'
                      : 'border-slate-300 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-500/20 dark:border-slate-600'
                  }`}
                >
                  <Container
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sky-600 dark:text-sky-400"
                    strokeWidth={1.75}
                  />
                  <input
                    value={row.value}
                    autoComplete="off"
                    name={`cistern-${row.id}`}
                    onChange={e => {
                      const next = [...containerRows];
                      next[index] = { ...row, value: e.target.value };
                      setContainerRows(next);
                      if (error) setError('');
                    }}
                    placeholder="010100/5"
                    className="w-full pl-9 pr-8 py-2 text-sm font-mono font-semibold text-slate-800 dark:text-slate-100 bg-transparent outline-none uppercase tracking-wide placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400"
                    aria-invalid={conflict}
                  />
                  {containerRows.length > 1 ? (
                    <button
                      type="button"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/40 transition-colors"
                      onClick={() => {
                        setContainerRows(containerRows.filter((_, i) => i !== index));
                      }}
                      aria-label="O‘chirish"
                      title="O‘chirish"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Tegishlilik Section */}
      <div className="p-4 rounded-2xl border border-slate-200/80 bg-slate-50/50 dark:border-slate-700/60 dark:bg-slate-800/30 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Tegishlilik
          </span>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            {lookupPending
              ? 'Tekshirilmoqda…'
              : wagonNumberOk
              ? 'Reestrdan aniqlandi'
              : 'Avval raqam kiriting'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div
            className={`p-3 rounded-xl border transition-all duration-200 ${
              ownership === WAGON_OWNERSHIP.Majmua
                ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 shadow-xs ring-1 ring-emerald-500/20'
                : 'border-slate-200/80 bg-white dark:border-slate-700/60 dark:bg-slate-900/40 opacity-70'
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`font-bold text-xs ${
                  ownership === WAGON_OWNERSHIP.Majmua
                    ? 'text-emerald-900 dark:text-emerald-200'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Majmuaga tegishli
              </span>
              {ownership === WAGON_OWNERSHIP.Majmua ? (
                <Check className="w-4 h-4 text-emerald-600" strokeWidth={2.5} />
              ) : null}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Zavod parki</p>
          </div>

          <div
            className={`p-3 rounded-xl border transition-all duration-200 ${
              ownership === WAGON_OWNERSHIP.Tashqi
                ? 'border-sky-500 bg-sky-50/70 dark:bg-sky-950/40 shadow-xs ring-1 ring-sky-500/20'
                : 'border-slate-200/80 bg-white dark:border-slate-700/60 dark:bg-slate-900/40 opacity-70'
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`font-bold text-xs ${
                  ownership === WAGON_OWNERSHIP.Tashqi
                    ? 'text-sky-900 dark:text-sky-200'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Tashqi vagon
              </span>
              {ownership === WAGON_OWNERSHIP.Tashqi ? (
                <Check className="w-4 h-4 text-sky-600" strokeWidth={2.5} />
              ) : null}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Tashqi park</p>
          </div>
        </div>

        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          Tegishlilik park reestridan avtomatik belgilanadi — qo‘lda tanlab bo‘lmaydi.
        </p>
      </div>

      {error ? (
        <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-xs font-medium text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      {/* Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
        <button
          type="button"
          className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
          onClick={onClose}
          disabled={submitting}
        >
          Bekor qilish
        </button>

        <div className="flex flex-wrap items-center gap-2.5">
          {!isEdit ? (
            <button
              type="button"
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-sky-700 bg-sky-50 border border-sky-200 hover:bg-sky-100 dark:bg-sky-950/60 dark:border-sky-800 dark:text-sky-300 disabled:opacity-40 disabled:pointer-events-none transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer"
              disabled={!canSubmit}
              onClick={() => void submit(true)}
            >
              <Plus className="w-4 h-4" strokeWidth={2} />
              Ro‘yxatga kiritish
            </button>
          ) : null}
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-600 disabled:opacity-40 disabled:pointer-events-none transition-all shadow-md shadow-sky-600/20 inline-flex items-center gap-2 cursor-pointer"
            disabled={submitting || (!canSubmit && !(sessionWagons.length > 0 && !wagonNumber.trim()))}
          >
            <Save className="w-4 h-4" strokeWidth={2} />
            {submitting ? 'Saqlanmoqda…' : 'Saqlash'}
          </button>
        </div>
      </div>
    </form>
  );
}
