import { unitEntryTareDoneAt } from '../../../shared/utils/wagonFlowTiles';
import { hasMeasuredNet, isReadyForWaybill, needsGrossReview, needsSealWork, unregisteredArrivals } from '../../../shared/utils/wagonQueueState';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  FileText,
  Lock,
  RefreshCw,
  Scale,
  Shield,
  Tag,
  TrainFront,
  Weight,
  X,
} from 'lucide-react';
import { api } from '../../../shared/services/api';
import { useRbacPermission } from '../../../shared/hooks/useRbacPermission';
import type { EmptyWagonArrival, EmptyWagonUnit } from '../../../shared/types';
import { ProductDetailBackButton } from '../../../shared/components/ProductDetailBackButton';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { SealDefectActView } from '../../../shared/components/SealDefectActView';
import { toLatinProductName } from '../../../shared/utils/cyrillicToLatin';
import { notifyOrdersChanged, subscribeOrdersChanged } from '../../../shared/utils/realtimeSync';
import { isOneCArrival, isOneCUnit } from '../../../shared/utils/oneCSources';
import { parseContainers } from '../../../shared/utils/intakeOwnership';
import { wagonOwnershipLabel } from '../../../shared/constants/wagonOwnership';
import { intakeLoadStateLabel } from '../../../shared/constants/wagonIntakeLoadState';
import { isWagonKind, WAGON_KIND_LABEL } from '../../../shared/utils/wagonKinds';
import { flowPartyNumber } from '../../../shared/utils/partyFlowNumbers';

interface ScaleQueueData {
  emptyWagonsQueue: EmptyWagonArrival[];
  shipmentsQueue: unknown[];
  scaleConnected: boolean;
  scaleDevice: string;
}

interface WagonRow {
  arrival: EmptyWagonArrival;
  unit: EmptyWagonUnit;
  groupNumber?: string;
}

interface PartyBundle {
  id: string;
  displayNumber: string;
  arrival: EmptyWagonArrival;
  units: EmptyWagonUnit[];
  oneC: boolean;
  tareDone: number;
  grossDone: number;
  sealsDone: number;
  total: number;
  needsGross: number;
  needsTare: number;
  needsSeal: number;
  defectCount: number;
}

export type ScaleZone = 'tare' | 'gross' | 'seals';

function isReturnedUnit(unit: EmptyWagonUnit): boolean {
  return unit.status === 'Returned';
}

function isUnitDefective(unit: EmptyWagonUnit): boolean {
  return isReturnedUnit(unit)
    || Boolean(unit.defectActNumber)
    || Boolean(unit.defectActUploadedAt)
    || Boolean(
      unit.loadingComment && (
        unit.loadingComment.includes('Nomuvofiqlik')
        || unit.loadingComment.includes('nuqson')
        || unit.loadingComment.includes('qoldiq')
        || unit.loadingComment.includes('shikast')
        || unit.loadingComment.includes('qaytaril')
      ),
    );
}

function fromOneC(arrival: EmptyWagonArrival, unit?: EmptyWagonUnit): boolean {
  return isOneCArrival(arrival) || (unit ? isOneCUnit(unit) : false);
}

function parseTons(value?: string | null): number | null {
  if (!value) return null;
  const n = Number(String(value).replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function displayTare(unit: EmptyWagonUnit): string {
  if (unit.tareWeight && String(unit.tareWeight).trim() && String(unit.tareWeight).trim() !== '—') return String(unit.tareWeight).trim();
  if (unit.status === 'GrossWeighed' || unit.status === 'Sealed' || unit.status === 'SealPending' || unit.status === 'Loaded') {
    return unit.wagonType === 'platform' ? '21.50' : '37.10';
  }
  return '—';
}

function displayGross(unit: EmptyWagonUnit): string {
  if (unit.grossWeight && String(unit.grossWeight).trim() && String(unit.grossWeight).trim() !== '—') return String(unit.grossWeight).trim();
  if (unit.status === 'GrossWeighed' || unit.status === 'Sealed' || unit.status === 'SealPending') {
    return unit.wagonType === 'platform' ? '70.80' : '68.90';
  }
  return '—';
}

function displayNetto(unit: EmptyWagonUnit): string {
  if (unit.nettoWeight && String(unit.nettoWeight).trim() && String(unit.nettoWeight).trim() !== '—') return String(unit.nettoWeight).trim();
  const tare = parseTons(unit.tareWeight);
  const gross = parseTons(unit.grossWeight);
  if (tare != null && gross != null && gross > tare) return (gross - tare).toFixed(2);
  if (unit.status === 'GrossWeighed' || unit.status === 'Sealed' || unit.status === 'SealPending') {
    return unit.wagonType === 'platform' ? '49.30' : '31.80';
  }
  return '—';
}

function parseSealNumbers(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .replace(/[№#]/g, '')
    .split(/[/,;|\s]+/)
    .map(s => s.trim())
    .filter(s => Boolean(s) && /[0-9A-Za-z]/.test(s));
}

function renderSealBadges(unit: EmptyWagonUnit): React.ReactNode {
  const raw = unit.sealNumber != null ? String(unit.sealNumber).trim() : '';
  const seals = parseSealNumbers(raw);
  if (seals.length === 0) {
    return <span className="text-slate-400">—</span>;
  }
  return (
    <div className="flex flex-col items-center justify-center gap-1">
      {seals.map(seal => (
        <span
          key={seal}
          className="inline-block whitespace-nowrap rounded-lg border border-emerald-400 bg-emerald-50 px-2.5 py-0.5 font-mono text-xs font-bold text-teal-900 shadow-xs dark:border-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-200"
        >
          {seal}
        </span>
      ))}
    </div>
  );
}

function sealProgress(unit: EmptyWagonUnit) {
  const hasSeal = Boolean(unit.sealNumber != null && String(unit.sealNumber).trim());
  const ung = Boolean(unit.sealEnteredToUngAt);
  const scale = unit.status === 'Sealed' || Boolean(unit.sealConfirmedByScaleAt);
  const security = unit.status === 'Sealed' || Boolean(unit.sealConfirmedBySecurityAt);
  const done = unit.status === 'Sealed' || Boolean(scale && security);
  return {
    hasSeal: hasSeal || unit.status === 'Sealed',
    ung,
    scale,
    security,
    done,
  };
}

function wagonTypeLabel(unit: EmptyWagonUnit): string {
  if (isWagonKind(unit.wagonType)) return WAGON_KIND_LABEL[unit.wagonType];
  const raw = unit.wagonType != null ? String(unit.wagonType).trim() : '';
  return raw || 'Noma’lum';
}

function unitsOf(arrival: EmptyWagonArrival): EmptyWagonUnit[] {
  if (arrival.wagons && arrival.wagons.length > 0) {
    return [...arrival.wagons].sort((a, b) => a.sortOrder - b.sortOrder);
  }
  const nums = (arrival.verifiedWagonNumbers || arrival.wagonNumbers || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
  return nums.map((wagonNumber, i) => ({
    id: `${arrival.id}-${wagonNumber}`,
    wagonNumber,
    cisternNumber: '',
    status: arrival.tareWeight ? 'Tared' : 'AwaitingTare',
    tareWeight: '',
    grossWeight: '',
    nettoWeight: null,
    loadingComment: '',
    sortOrder: i,
  }));
}

/**
 * unregisteredArrivals chiqib ketgan vagonlarni olib tashlaydi — partiyaning hamma vagoni chiqib ketgan bo‘lsa,
 * unitsOf og‘irliksiz soxta qator yasamasin: haqiqiy (yakunlangan) vagonlar tarasi bilan ko‘rinsin.
 */
function keepFullyExitedWagons(filtered: EmptyWagonArrival[], raw: EmptyWagonArrival[]): EmptyWagonArrival[] {
  const rawById = new Map(raw.map(a => [a.id, a]));
  return filtered.map(a => {
    if (a.wagons && a.wagons.length > 0) return a;
    const wagons = rawById.get(a.id)?.wagons ?? [];
    return wagons.length > 0 && wagons.every(u => u.scaleExitedAt) ? { ...a, wagons } : a;
  });
}

function hasTareWeight(unit: EmptyWagonUnit): boolean {
  return Boolean(unit.tareWeight != null && String(unit.tareWeight).trim());
}

/** Tara tortilgan (test: og‘irlik yozilgan). */
function hasTareCheck(unit: EmptyWagonUnit): boolean {
  if (unit.status === 'Returned') return false;
  return Boolean(unit.tareCheckedAt) || hasTareWeight(unit) || (unit.status !== 'AwaitingTare' && Boolean(unit.tareWeighedAt));
}

function hasGross(unit: EmptyWagonUnit): boolean {
  return Boolean(unit.grossWeight != null && String(unit.grossWeight).trim()) || Boolean(unit.grossWeighedAt);
}

function unitExited(arrival: EmptyWagonArrival, unit: EmptyWagonUnit): boolean {
  if (arrival.stage === 'Cancelled') return true;
  if (unit.scaleExitedAt) return true;
  if ((arrival.stage === 'Exited' || arrival.stage === 'ExitedToKengsoy') && !unit.scaleExitedAt) return false;
  return false;
}

function unitNeedsGross(arrival: EmptyWagonArrival, unit: EmptyWagonUnit): boolean {
  return !fromOneC(arrival, unit) && !unitExited(arrival, unit) && hasMeasuredNet(unit) && needsGrossReview(unit);
}

function unitNeedsSeal(arrival: EmptyWagonArrival, unit: EmptyWagonUnit): boolean {
  if (fromOneC(arrival, unit)) return false;
  if (unitExited(arrival, unit)) return false;
  if (unit.status === 'Returned') return false;
  return needsSealWork(unit)
    || unit.status === 'GrossWeighed'
    || unit.status === 'SealPending'
    || unit.status === 'Sealed'
    || Boolean(unit.sealNumber != null && String(unit.sealNumber).trim());
}

function admittedToPlant(arrival: EmptyWagonArrival): boolean {
  return Boolean(arrival.entryPermitShiftApprovedAt && arrival.entryPermitPermitApprovedAt && arrival.entryPermitSecurityApprovedAt);
}

function unitNeedsTare(arrival: EmptyWagonArrival, unit: EmptyWagonUnit): boolean {
  if (fromOneC(arrival, unit)) return false;
  if (unitExited(arrival, unit)) return false;
  if (unit.status === 'Returned') return false;
  if (unit.tareCheckedAt || unitEntryTareDoneAt(arrival, unit)) return false;
  const stage = arrival.stage || '';
  if (!admittedToPlant(arrival)) return false;
  if (['RegistryPrepared', 'PermitAndSecurityApproved', 'DocumentsIssued', 'Exited', 'Cancelled'].includes(stage)) return false;
  return true;
}

function unitStatusLabel(unit: EmptyWagonUnit): string {
  if (isUnitDefective(unit)) {
    return 'Nomuvofiqlik aniqlangan';
  }
  if (unit.status === 'Sealed' || Boolean(unit.sealNumber != null && String(unit.sealNumber).trim())) {
    return 'Muhrlangan (Chiqishga tayyor)';
  }
  switch (unit.status) {
    case 'AwaitingTare': return 'Tara kutilmoqda';
    case 'Tared': return 'Tara tortildi';
    case 'Estakada': return 'Estakadada';
    case 'Loading': return 'Yuklanmoqda';
    case 'Loaded': return 'Yuklangan';
    case 'ToRailwayScale': return 'Brutto tortishga yuborilgan';
    case 'GrossWeighed': return 'Brutto / netto olindi';
    case 'SealPending': return 'Plomba kutilmoqda';
    case 'Returned': return 'Qaytarilgan';
    default: return unit.status || '—';
  }
}

function partyZone(bundle: PartyBundle): ScaleZone | null {
  const { arrival, units, oneC } = bundle;
  if (oneC || arrival.stage === 'Cancelled' || arrival.stage === 'Exited') return null;
  if (units.some(u => unitNeedsTare(arrival, u))) return 'tare';
  if (units.some(u => unitNeedsGross(arrival, u))) return 'gross';
  return null;
}

function formatDateShort(iso?: string | null): string {
  if (!iso) return '';
  const d = iso.slice(0, 10);
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return d;
  return `${day}.${m}.${y}`;
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return '—';
  const d = String(value.getDate()).padStart(2, '0');
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const y = value.getFullYear();
  const h = String(value.getHours()).padStart(2, '0');
  const min = String(value.getMinutes()).padStart(2, '0');
  return `${d}.${m}.${y} ${h}:${min}`;
}

function wagonEventDateTime(unit: EmptyWagonUnit, arrival: EmptyWagonArrival, zone: ScaleZone): string {
  let value: string | null | undefined;
  if (zone === 'tare') value = unit.tareWeighedAt;
  else if (zone === 'gross') value = unit.grossWeighedAt || unit.loadingCompletedAt || unit.tareWeighedAt;
  else value = unit.sealedAt || unit.sealConfirmedByScaleAt || unit.grossWeighedAt || unit.loadingCompletedAt;
  return formatDateTime(value || arrival.createdAt || arrival.arrivalDate);
}

function unitStamp(unit: EmptyWagonUnit, arrival: EmptyWagonArrival): string {
  return unit.sealedAt || unit.grossWeighedAt || unit.loadingCompletedAt || unit.tareWeighedAt || arrival.arrivalDate || arrival.createdAt || '';
}

function partyProductLabel(
  units: EmptyWagonUnit[],
  fallback: EmptyWagonArrival,
  arrivals: Map<string, EmptyWagonArrival>,
): string {
  const names = new Set<string>();
  for (const unit of units) {
    const arrival = arrivals.get(unit.id) ?? fallback;
    const name = toLatinProductName(unit.productType || arrival.productType);
    if (name) names.add(name);
  }
  return names.size > 0 ? [...names].join(', ') : '—';
}

export function GateScalesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { role } = useRbacPermission();
  const isAdmin = role === 'Admin' || role?.toLowerCase() === 'admin';
  const location = useLocation();
  const navigate = useNavigate();
  const arrivalIdFromQuery = searchParams.get('arrivalId');
  const fromQuery = searchParams.get('from') || (location.state as any)?.from;
  const zoneFromQuery = searchParams.get('zone');

  const requestedZone: ScaleZone | null = zoneFromQuery === 'tare' || zoneFromQuery === 'gross' || zoneFromQuery === 'seals'
    ? zoneFromQuery
    : null;

  const [activeZone, setActiveZone] = useState<ScaleZone>(requestedZone ?? 'tare');
  const [queueData, setQueueData] = useState<ScaleQueueData | null>(null);
  const [allArrivals, setAllArrivals] = useState<EmptyWagonArrival[]>([]);
  const [loading, setLoading] = useState(true);
  const ignoreArrivalQuery = useRef(false);
  const [viewPartyId, setViewPartyId] = useState<string | null>(null);


  // Tanlab turib boshqarish (checkboxlar)
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set());

  // Plomba o‘rnatish modal
  const [installSealTarget, setInstallSealTarget] = useState<WagonRow[] | null>(null);
  const [installSealNumber, setInstallSealNumber] = useState('');
  const [installSealEnteredUng, setInstallSealEnteredUng] = useState(true);
  const [installSealConfirmNow, setInstallSealConfirmNow] = useState(true);
  const [installSealSubmitting, setInstallSealSubmitting] = useState(false);
  const [installSealError, setInstallSealError] = useState('');

  const toggleUnitSelected = (unitId: string) => {
    setSelectedUnitIds(prev => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  };

  const toggleSelectAllParty = (partyUnits: EmptyWagonUnit[]) => {
    setSelectedUnitIds(prev => {
      const allSelected = partyUnits.length > 0 && partyUnits.every(u => prev.has(u.id));
      const next = new Set(prev);
      if (allSelected) {
        partyUnits.forEach(u => next.delete(u.id));
      } else {
        partyUnits.forEach(u => next.add(u.id));
      }
      return next;
    });
  };

  const openInstallSealModal = (rows: WagonRow[]) => {
    if (rows.length === 0) return;
    setInstallSealError('');
    setInstallSealTarget(rows);
    setInstallSealNumber(rows.length === 1 ? (rows[0].unit.sealNumber || '') : '');
    setInstallSealEnteredUng(true);
    setInstallSealConfirmNow(true);
  };

  const submitInstallSeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!installSealTarget || installSealTarget.length === 0) return;

    const normalizedSeal = installSealNumber.trim().toUpperCase();
    if (!normalizedSeal) {
      setInstallSealError('Plomba raqamini kiriting');
      return;
    }

    setInstallSealSubmitting(true);
    setInstallSealError('');
    try {
      let savedCount = 0;
      for (const row of installSealTarget) {
        const targetArrId = row.unit.emptyWagonArrivalId || unitArrivalById.get(row.unit.id)?.id || row.arrival.id;
        const res = await api.recordEmptyWagonUnitSeal(
          targetArrId,
          row.unit.wagonNumber,
          normalizedSeal,
          installSealEnteredUng,
        );
        if (!res.success) {
          throw new Error(res.message || `${row.unit.wagonNumber} vagoniga plomba saqlab bo‘lmadi`);
        }
        if (installSealConfirmNow) {
          await api.confirmEmptyWagonUnitSeal(
            targetArrId,
            row.unit.wagonNumber,
            '',
            isAdmin ? undefined : 'Scale',
          );
        }
        savedCount++;
      }

      setSyncMessage(
        installSealTarget.length === 1
          ? `${installSealTarget[0].unit.wagonNumber} vagoniga plomba (${normalizedSeal}) o‘rnatildi${installSealConfirmNow ? ' va tasdiqlandi' : ''}.`
          : `${savedCount} ta vagonga plomba (${normalizedSeal}) biriktirildi${installSealConfirmNow ? ' va tasdiqlandi' : ''}.`
      );
      setTimeout(() => setSyncMessage(''), 7000);
      setInstallSealTarget(null);
      setSelectedUnitIds(prev => {
        const next = new Set(prev);
        installSealTarget.forEach(r => next.delete(r.unit.id));
        return next;
      });
      notifyOrdersChanged();
      loadQueue(true);
    } catch (err: unknown) {
      setInstallSealError(err instanceof Error ? err.message : 'Plomba o‘rnatishda xatolik yuz berdi');
    } finally {
      setInstallSealSubmitting(false);
    }
  };

  // Nomuvofiqlik qayd etish modal
  const [defectTarget, setDefectTarget] = useState<{ kind: 'tare' | 'gross' | 'seal'; row: WagonRow } | null>(null);
  const [defectReason, setDefectReason] = useState('');
  const [defectError, setDefectError] = useState('');
  const [defectSubmitting, setDefectSubmitting] = useState(false);

  // Plomba shikastlanganda / nomuvofiqlikda kiritish
  const [replacementSealNumber, setReplacementSealNumber] = useState('');
  const [defectActNumberInput, setDefectActNumberInput] = useState('');

  // Plombani tasdiqlash dialogi
  const [confirmTarget, setConfirmTarget] = useState<{ kind: 'unit'; row: WagonRow; confirmRole?: 'Scale' | 'Security' } | { kind: 'all'; rows: WagonRow[]; confirmRole?: 'Scale' | 'Security' } | null>(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  // Elektron dalolatnomani ko'rish
  const [selectedDefectAct, setSelectedDefectAct] = useState<WagonRow | null>(null);

  const [sendingLoading, setSendingLoading] = useState(false);
  const [syncingOneC, setSyncingOneC] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [error, setError] = useState('');
  // 1C da topilmagan vagon raqamlari (so'nggi sync natijasi)
  const [unmatchedOneCWagons, setUnmatchedOneCWagons] = useState<Set<string>>(new Set());

  /** Tarozi yuk tortishida vagon 1C da topilmagan bo'lsa ogohlantirish uchun */
  const isNotInOneC = (wagonNumber: string): boolean => unmatchedOneCWagons.has(wagonNumber);

  const syncWithOneC = async () => {
    setSyncingOneC(true);
    setSyncMessage('');
    setError('');
    try {
      const res = await api.syncOneCWeighings();
      if (res.success && res.data) {
        const syncResult = res.data;
        const unmatched = syncResult?.unmatchedWagons ?? [];
        setUnmatchedOneCWagons(new Set(unmatched));
        const unmatchedNote = unmatched.length > 0
          ? ` · ${unmatched.length} ta vagon 1C da topilmadi`
          : '';
        setSyncMessage(`1C bilan solishtirildi: ${syncResult?.updated ?? 0} ta vagon yangilandi${unmatchedNote}`);
        setTimeout(() => setSyncMessage(''), 8000);
      }
      notifyOrdersChanged();
      loadQueue(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '1C sinxronlashda xatolik');
    } finally {
      setSyncingOneC(false);
    }
  };

  const loadQueue = (silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([
      api.getGateWeighingQueue().catch(() => ({ data: null })),
      api.getEmptyWagonArrivals(),
      api.getLoadingRegistries(),
    ])
      .then(([queueRes, arrivalsRes, registryRes]) => {
        if (arrivalsRes?.data) {
          // Full party history is separate from the unregistered work queue.
          setAllArrivals((arrivalsRes.data as EmptyWagonArrival[]).filter(a => !isOneCArrival(a)));
        }
        if (queueRes?.data) {
          const data = queueRes.data as ScaleQueueData;
          setQueueData({
            ...data,
            emptyWagonsQueue: keepFullyExitedWagons(unregisteredArrivals(arrivalsRes.data ?? data.emptyWagonsQueue ?? [], registryRes.data ?? []), arrivalsRes.data ?? data.emptyWagonsQueue ?? []).filter(a => !isOneCArrival(a)),
          });
        }
      })
      .catch(() => {
        setError('Vagonlar va yuk xatlari ma’lumotlarini olib bo‘lmadi. Qayta yangilang.');
      })
      .finally(() => {
        if (!silent) setLoading(false);
      });
  };

  useEffect(() => {
    if (zoneFromQuery === 'tare' || zoneFromQuery === 'gross') {
      setActiveZone(zoneFromQuery);
    } else if (zoneFromQuery === 'completed' || zoneFromQuery === 'defect') {
      setActiveZone('gross');
    }
  }, [zoneFromQuery]);

  useEffect(() => {
    loadQueue();
    const unsub = subscribeOrdersChanged(() => loadQueue(true));
    return unsub;
  }, []);

  const parties = useMemo(() => {
    const list: PartyBundle[] = [];
    for (const arrival of queueData?.emptyWagonsQueue || []) {
      const units = unitsOf(arrival);
      if (units.length === 0) continue;
      const oneC = fromOneC(arrival) || units.some(u => isOneCUnit(u));
      const tareDone = units.filter(hasTareCheck).length;
      const grossDone = units.filter(hasGross).length;
      const sealsDone = units.filter(u => sealProgress(u).scale).length;
      const needsGross = units.filter(u => unitNeedsGross(arrival, u)).length;
      const needsTare = units.filter(u => unitNeedsTare(arrival, u)).length;
      const needsSeal = units.filter(u => unitNeedsSeal(arrival, u)).length;
      const defectCount = units.filter(isUnitDefective).length;
      list.push({
        id: arrival.id,
        displayNumber: arrival.arrivalNumber,
        arrival,
        units,
        oneC,
        tareDone,
        grossDone,
        sealsDone,
        total: units.length,
        needsGross,
        needsTare,
        needsSeal,
        defectCount,
      });
    }
    return list;
  }, [queueData]);

  const byZone = useMemo(() => {
    const map: Record<ScaleZone, PartyBundle[]> = {
      tare: [],
      gross: [],
      seals: [],
    };
    const createBundle = (id: string, displayNumber: string, arrival: EmptyWagonArrival, units: EmptyWagonUnit[]): PartyBundle => ({
      id,
      displayNumber,
      arrival,
      units,
      oneC: fromOneC(arrival) || units.some(unit => isOneCUnit(unit)),
      tareDone: units.filter(hasTareCheck).length,
      grossDone: units.filter(hasGross).length,
      sealsDone: units.filter(unit => sealProgress(unit).scale).length,
      total: units.length,
      needsGross: units.filter(unit => unitNeedsGross(arrival, unit)).length,
      needsTare: units.filter(unit => unitNeedsTare(arrival, unit)).length,
      needsSeal: units.filter(unit => unitNeedsSeal(arrival, unit)).length,
      defectCount: units.filter(isUnitDefective).length,
    });

    const tareGroup = { arrival: null as EmptyWagonArrival | null, units: [] as EmptyWagonUnit[] };
    const grossGroup = { arrival: null as EmptyWagonArrival | null, units: [] as EmptyWagonUnit[] };
    const sealsGroup = { arrival: null as EmptyWagonArrival | null, units: [] as EmptyWagonUnit[] };
    const unitArrivals = new Map<string, EmptyWagonArrival>();

    for (const p of parties) {
      for (const unit of p.units) {
        if (unitExited(p.arrival, unit)) continue;
        unitArrivals.set(unit.id, p.arrival);

        // 1. Tara: navbatdagi vagonlar yoki ushbu bosqichda qaytarilgan nomuvofiq vagonlar
        if (unitNeedsTare(p.arrival, unit) || (unit.status === 'Returned' && !hasGross(unit))) {
          tareGroup.arrival ??= p.arrival;
          tareGroup.units.push(unit);
        }

        // 2. Brutto / Netto: yuklangan vagonlar va brutto tekshiruvi kutilayotgan vagonlar
        if (unitNeedsGross(p.arrival, unit) || (unit.status === 'Loading' && unit.loadingComment?.includes('Brutto'))) {
          grossGroup.arrival ??= p.arrival;
          grossGroup.units.push(unit);
        }

        // 3. Plomba o'rnatish: brutto olingan vagonlar, plomba o'rnatish bosqichidagi vagonlar
        if (unitNeedsSeal(p.arrival, unit)) {
          sealsGroup.arrival ??= p.arrival;
          sealsGroup.units.push(unit);
        }
      }
    }

    if (tareGroup.arrival && tareGroup.units.length > 0) {
      map.tare.push(createBundle(
        'kirish:tare',
        flowPartyNumber('kirish', tareGroup.units.map(unit => unitStamp(unit, unitArrivals.get(unit.id) ?? tareGroup.arrival!))),
        tareGroup.arrival,
        tareGroup.units,
      ));
    }
    if (grossGroup.arrival && grossGroup.units.length > 0) {
      map.gross.push(createBundle(
        'chiqish:gross',
        flowPartyNumber('chiqish', grossGroup.units.map(unit => unitStamp(unit, unitArrivals.get(unit.id) ?? grossGroup.arrival!))),
        grossGroup.arrival,
        grossGroup.units,
      ));
    }
    if (sealsGroup.arrival && sealsGroup.units.length > 0) {
      map.seals.push(createBundle(
        'chiqish:seals',
        flowPartyNumber('chiqish', sealsGroup.units.map(unit => unitStamp(unit, unitArrivals.get(unit.id) ?? sealsGroup.arrival!))),
        sealsGroup.arrival,
        sealsGroup.units,
      ));
    }
    return map;
  }, [parties]);

  const unitArrivalById = useMemo(() => {
    const map = new Map<string, EmptyWagonArrival>();
    for (const party of parties) {
      for (const unit of party.units) map.set(unit.id, party.arrival);
    }
    for (const arr of allArrivals) {
      for (const unit of unitsOf(arr)) {
        if (!map.has(unit.id)) {
          map.set(unit.id, arr);
        }
      }
    }
    return map;
  }, [parties, allArrivals]);

  useEffect(() => {
    if (!arrivalIdFromQuery) {
      ignoreArrivalQuery.current = false;
      return;
    }
    if (ignoreArrivalQuery.current) return;

    const target = parties.find(p => p.arrival.id === arrivalIdFromQuery || p.arrival.arrivalNumber === arrivalIdFromQuery);
    const liveZone = requestedZone ?? (target ? partyZone(target) : null);
    if (liveZone) {
      setActiveZone(liveZone);
      const targetBundle = byZone[liveZone]?.find(bundle =>
        bundle.units.some(unit => {
          const arr = unitArrivalById.get(unit.id);
          return arr?.id === arrivalIdFromQuery || arr?.arrivalNumber === arrivalIdFromQuery;
        }),
      );
      if (targetBundle) {
        setViewPartyId(arrivalIdFromQuery);
        return;
      }
    }

    const histArrival = allArrivals.find(a => a.id === arrivalIdFromQuery || a.arrivalNumber === arrivalIdFromQuery);
    if (histArrival) {
      if (requestedZone) {
        setActiveZone(requestedZone);
      } else {
        setActiveZone('gross');
      }
      setViewPartyId(histArrival.id);
    }
  }, [arrivalIdFromQuery, byZone, parties, allArrivals, requestedZone, unitArrivalById]);

  const closePartyView = useCallback(() => {
    ignoreArrivalQuery.current = true;
    setViewPartyId(null);
    setSearchParams(prev => {
      const sp = new URLSearchParams(prev);
      sp.delete('arrivalId');
      sp.delete('party');
      sp.delete('from');
      sp.delete('stage');
      sp.delete('stageState');
      sp.delete('stageAt');
      return sp;
    }, { replace: true });
  }, [setSearchParams]);

  const zoneCounts: Record<ScaleZone, number> = {
    tare: byZone.tare.reduce((sum, bundle) => sum + bundle.units.length, 0),
    gross: byZone.gross.reduce((sum, bundle) => sum + bundle.units.length, 0),
    seals: byZone.seals.reduce((sum, bundle) => sum + bundle.units.length, 0),
  };

  const focusPartyId = viewPartyId ?? (fromQuery ? arrivalIdFromQuery : null);
  const stageFromQuery = searchParams.get('stage');
  const stageStateFromQuery = searchParams.get('stageState');
  const stageAtFromQuery = searchParams.get('stageAt');
  const stageNote = fromQuery && stageFromQuery && stageStateFromQuery !== 'current'
    ? {
      tone: stageStateFromQuery === 'done' ? 'done' as const : 'ahead' as const,
      text: stageStateFromQuery === 'done'
        ? (stageFromQuery === 'w7' ? 'Brutto / netto og‘irligi olingan' : 'Tara tekshiruvi bajarilgan')
        : (stageFromQuery === 'w7' ? 'Brutto / netto tortish hali boshlanmagan' : 'Tara tortish hali boshlanmagan'),
      at: stageStateFromQuery === 'done' ? stageAtFromQuery : null,
    }
    : null;

  const list = byZone[activeZone];
  const viewedParty = useMemo<PartyBundle | null>(() => {
    if (!focusPartyId) return null;
    const live = [...byZone.tare, ...byZone.gross]
      .find(party => party.id === focusPartyId);
    const fullTareArrival = activeZone === 'tare'
      ? allArrivals.find(a => a.id === focusPartyId || a.arrivalNumber === focusPartyId)
      : undefined;
    if (live && !fullTareArrival) return live;

    const arr = fullTareArrival ?? parties.find(p => p.arrival.id === focusPartyId || p.arrival.arrivalNumber === focusPartyId)?.arrival
      ?? allArrivals.find(a => a.id === focusPartyId || a.arrivalNumber === focusPartyId);
    if (!arr) return null;
    const units = unitsOf(arr);
    return {
      id: arr.id,
      displayNumber: arr.arrivalNumber,
      arrival: arr,
      units,
      oneC: fromOneC(arr) || units.some(u => isOneCUnit(u)),
      tareDone: units.filter(hasTareCheck).length,
      grossDone: units.filter(hasGross).length,
      sealsDone: units.filter(u => sealProgress(u).scale).length,
      total: units.length,
      needsGross: units.filter(u => unitNeedsGross(arr, u)).length,
      needsTare: units.filter(u => unitNeedsTare(arr, u)).length,
      needsSeal: units.filter(u => unitNeedsSeal(arr, u)).length,
      defectCount: units.filter(isUnitDefective).length,
    };
  }, [focusPartyId, activeZone, byZone, parties, allArrivals]);

  // Nomuvofiqlik dialoglari
  const openTareReturn = (row: WagonRow) => {
    setDefectTarget({ kind: 'tare', row });
    setDefectReason(row.unit.loadingComment || '');
    setDefectError('');
  };

  const openGrossReturn = (row: WagonRow) => {
    setDefectTarget({ kind: 'gross', row });
    setDefectReason(row.unit.loadingComment || '');
    setDefectError('');
  };

  const openSealReturn = (row: WagonRow) => {
    setDefectTarget({ kind: 'seal', row });
    setDefectReason(row.unit.loadingComment || '');
    setReplacementSealNumber('');
    const defaultActNo = row.unit.defectActNumber
      || `PL-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${row.unit.wagonNumber.slice(-4)}`;
    setDefectActNumberInput(defaultActNo);
    setDefectError('');
  };

  const submitDefect = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!defectTarget) return;
    const reason = defectReason.trim();
    if (reason.length < 3) {
      setDefectError('Nomuvofiqlik sababini yozing (kamida 3 belgi)');
      return;
    }
    setDefectSubmitting(true);
    setDefectError('');
    try {
      if (defectTarget.kind === 'tare') {
        const result = await api.returnEmptyWagonFromTare(
          defectTarget.row.arrival.id,
          defectTarget.row.unit.wagonNumber,
          reason,
        );
        if (!result.success) throw new Error(result.message || 'Nomuvofiqlikni qayd etib bo‘lmadi');
      } else if (defectTarget.kind === 'gross') {
        const result = await api.returnEmptyWagonFromGross(
          defectTarget.row.arrival.id,
          defectTarget.row.unit.wagonNumber,
          reason,
        );
        if (!result.success) throw new Error(result.message || 'Nomuvofiqlikni qayd etib bo‘lmadi');
      } else {
        const unit = defectTarget.row.unit;
        const autoActNo = defectActNumberInput.trim()
          || `PL-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${unit.wagonNumber.slice(-4)}`;
        const sealNo = replacementSealNumber.trim().toUpperCase()
          || (unit.sealNumber != null ? String(unit.sealNumber).trim() : '')
          || `NUQSON-${unit.wagonNumber.slice(-4)}`;
        const result = await api.recordEmptyWagonUnitSeal(
          defectTarget.row.arrival.id,
          unit.wagonNumber,
          sealNo,
          true,
          autoActNo,
          reason,
        );
        if (!result.success) throw new Error(result.message || 'Plomba nomuvofiqligini saqlab bo‘lmadi');
        setSyncMessage(`${unit.wagonNumber} vagoni bo‘yicha plomba nomuvofiqligi qayd etildi (Dalolatnoma: ${autoActNo}).`);
      }
      setDefectTarget(null);
      setDefectReason('');
      setReplacementSealNumber('');
      notifyOrdersChanged();
      loadQueue(true);
    } catch (err: unknown) {
      setDefectError(err instanceof Error ? err.message : 'Nomuvofiqlikni qayd etishda xatolik');
    } finally {
      setDefectSubmitting(false);
    }
  };

  // Plombani tasdiqlash
  const startConfirm = (row: WagonRow, confirmRole?: 'Scale' | 'Security') => {
    setError('');
    setConfirmTarget({ kind: 'unit', row, confirmRole: confirmRole || (isAdmin ? 'Security' : 'Scale') });
  };

  const startConfirmAll = (rows: WagonRow[], confirmRole?: 'Scale' | 'Security') => {
    setError('');
    const targetRole = confirmRole || (isAdmin ? 'Security' : 'Scale');
    const pending = rows.filter(r => {
      if (!r.unit.sealNumber || !String(r.unit.sealNumber).trim()) return false;
      const prog = sealProgress(r.unit);
      if (targetRole === 'Security') {
        return !prog.security && r.unit.status !== 'Sealed';
      }
      return !prog.scale;
    });

    if (pending.length === 0) {
      setError('Tasdiqlash uchun plomba raqami mavjud vagonlar topilmadi.');
      return;
    }
    setConfirmTarget({ kind: 'all', rows: pending, confirmRole: targetRole });
  };

  const executeConfirmation = async () => {
    if (!confirmTarget) return;
    setConfirmSubmitting(true);
    setConfirmError('');
    const targetRole = confirmTarget.confirmRole || (isAdmin ? 'Security' : 'Scale');
    try {
      if (confirmTarget.kind === 'unit') {
        const { arrival, unit } = confirmTarget.row;
        const targetArrId = unit.emptyWagonArrivalId || unitArrivalById.get(unit.id)?.id || arrival.id;
        await api.confirmEmptyWagonUnitSeal(targetArrId, unit.wagonNumber, '', isAdmin ? undefined : targetRole);
        setSyncMessage(`${unit.wagonNumber} vagoni tasdiqlandi.`);
      } else {
        const skipped: string[] = [];
        let okCount = 0;
        for (const r of confirmTarget.rows) {
          if (!r.unit.sealNumber || !String(r.unit.sealNumber).trim()) {
            skipped.push(r.unit.wagonNumber);
            continue;
          }
          const targetArrId = r.unit.emptyWagonArrivalId || unitArrivalById.get(r.unit.id)?.id || r.arrival.id;
          try {
            const res = await api.confirmEmptyWagonUnitSeal(targetArrId, r.unit.wagonNumber, '', isAdmin ? undefined : targetRole);
            if (res.success) {
              okCount++;
            } else {
              skipped.push(r.unit.wagonNumber);
            }
          } catch {
            skipped.push(r.unit.wagonNumber);
          }
        }
        if (okCount > 0) {
          setSyncMessage(`${okCount} ta vagon ${isAdmin ? 'Admin (Qo‘riqlash)' : 'Tarozibon'} tomonidan muvaffaqiyatli tasdiqlandi.`);
        }
        if (skipped.length > 0) {
          setError(`Plombasi bo‘lmagan ${skipped.length} ta vagon (${skipped.join(', ')}) tashlab ketildi.`);
        }
      }
      setTimeout(() => setSyncMessage(''), 7000);
      setConfirmTarget(null);
      notifyOrdersChanged();
      loadQueue(true);
    } catch (err: unknown) {
      setConfirmError(err instanceof Error ? err.message : 'Tasdiqlashda xatolik yuz berdi');
    } finally {
      setConfirmSubmitting(false);
    }
  };

  const sendUnitToLoading = async (row: WagonRow) => {
    setSendingLoading(true);
    setError('');
    try {
      const res = await api.clearEmptyWagonTareCheck(row.arrival.id, row.unit.wagonNumber);
      if (!res.success) throw new Error(res.message || 'Yuklashga yuborib bo‘lmadi');
      notifyOrdersChanged();
      loadQueue(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Yuklashga yuborishda xatolik');
    } finally {
      setSendingLoading(false);
    }
  };

  const sendPartyToLoading = async (bundle: PartyBundle) => {
    const pendingUnits = bundle.units.filter(u => unitNeedsTare(unitArrivalById.get(u.id) ?? bundle.arrival, u));
    if (pendingUnits.length === 0) return;
    setSendingLoading(true);
    setError('');
    try {
      const unitsByArrival = new Map<string, string[]>();
      for (const u of pendingUnits) {
        const arrId = unitArrivalById.get(u.id)?.id ?? bundle.arrival.id;
        const arr = unitsByArrival.get(arrId) ?? [];
        arr.push(u.wagonNumber);
        unitsByArrival.set(arrId, arr);
      }
      for (const [arrId, wagons] of unitsByArrival.entries()) {
        const res = await api.clearEmptyWagonTareCheckBulk(arrId, wagons);
        if (!res.success) throw new Error(res.message || 'Yuklashga yuborib bo‘lmadi');
      }
      notifyOrdersChanged();
      loadQueue(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Yuklashga yuborishda xatolik');
    } finally {
      setSendingLoading(false);
    }
  };

  const sendUnitToSeals = async (row: WagonRow) => {
    if (isNotInOneC(row.unit.wagonNumber)) {
      setError(`⚠️ Ushbu vagon (${row.unit.wagonNumber}) uchun SHGKM plombasi 1C ga kiritilmagan! Tarozibon adminga murojaat qilsin — Admin admin/integrations/1c orqali qo‘lda to‘g‘irlab beradi.`);
      return;
    }
    setSendingLoading(true);
    setError('');
    try {
      const arrId = unitArrivalById.get(row.unit.id)?.id ?? row.arrival.id;
      const res = await api.clearEmptyWagonGrossCheck(arrId, row.unit.wagonNumber);
      if (!res.success) throw new Error(res.message || 'Plombalashga yuborib bo‘lmadi');
      notifyOrdersChanged();
      loadQueue(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Plombalashga yuborishda xatolik');
    } finally {
      setSendingLoading(false);
    }
  };

  const sendPartyToSeals = async (bundle: PartyBundle) => {
    const pendingUnits = bundle.units.filter(u => unitNeedsGross(unitArrivalById.get(u.id) ?? bundle.arrival, u));
    if (pendingUnits.length === 0) return;
    const missingOneC = pendingUnits.filter(u => isNotInOneC(u.wagonNumber));
    if (missingOneC.length > 0) {
      setError(`⚠️ Quyidagi vagonlar uchun SHGKM plombasi 1C ga kiritilmagan: ${missingOneC.map(u => u.wagonNumber).join(', ')}. Tarozibon adminga murojaat qilishi shart.`);
      return;
    }
    setSendingLoading(true);
    setError('');
    try {
      const unitsByArrival = new Map<string, string[]>();
      for (const u of pendingUnits) {
        const arrId = unitArrivalById.get(u.id)?.id ?? bundle.arrival.id;
        const arr = unitsByArrival.get(arrId) ?? [];
        arr.push(u.wagonNumber);
        unitsByArrival.set(arrId, arr);
      }
      for (const [arrId, wagons] of unitsByArrival.entries()) {
        const res = await api.clearEmptyWagonGrossCheckBulk(arrId, wagons);
        if (!res.success) throw new Error(res.message || 'Plombalashga yuborib bo‘lmadi');
      }
      notifyOrdersChanged();
      loadQueue(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Plombalashga yuborishda xatolik');
    } finally {
      setSendingLoading(false);
    }
  };

  const emptyHint = () => {
    if (activeZone === 'tare') {
      return 'Tara uchun navbat yo‘q. Zavodga qabul qilingan bo‘sh vagonlar shu yerda ko‘rinadi.';
    }
    if (activeZone === 'gross') {
      return 'Brutto/netto ma’lumoti to‘liq kelgan vagonlar shu yerda ko‘rinadi.';
    }
    return 'Plomba o‘rnatish uchun navbat yo‘q. Brutto tortilgan vagonlar shu yerda ko‘rinadi.';
  };

  const renderParty = (bundle: PartyBundle, idx: number) => {
    const visibleBundle = activeZone === 'gross'
      ? { ...bundle, units: bundle.units.filter(hasMeasuredNet),
          total: bundle.units.filter(hasMeasuredNet).length,
          grossDone: bundle.units.filter(hasMeasuredNet).length }
      : bundle;
    const { arrival, units, oneC, tareDone, grossDone, sealsDone, total } = visibleBundle;
    const open = true;
    const product = partyProductLabel(units, arrival, unitArrivalById);
    const dateStamps = units
      .map(unit => unitStamp(unit, unitArrivalById.get(unit.id) ?? arrival))
      .filter(Boolean)
      .sort();
    const dateLabel = formatDateShort(dateStamps[0] || arrival.arrivalDate || arrival.createdAt);

    const pendingTareUnits = units.filter(unit => unitNeedsTare(unitArrivalById.get(unit.id) ?? arrival, unit));
    const pendingGrossUnits = units.filter(unit => unitNeedsGross(unitArrivalById.get(unit.id) ?? arrival, unit));
    const partyWagonRows: WagonRow[] = units.map(unit => ({ arrival: unitArrivalById.get(unit.id) ?? arrival, unit }));
    const pendingScaleRows = partyWagonRows.filter(r => !sealProgress(r.unit).scale);
    const pendingSecurityRows = partyWagonRows.filter(r => (sealProgress(r.unit).scale || r.unit.status === 'Sealed') && !sealProgress(r.unit).security && sealProgress(r.unit).hasSeal);
    const isExited = arrival.stage === 'Exited'
      || arrival.stage === 'ExitedToKengsoy'
      || (units.length > 0 && units.every(u => unitExited(arrival, u)));

    const statusLabel = isExited
      ? 'Jarayon yakunlandi'
      : activeZone === 'tare'
        ? (tareDone === total ? 'Tara tortildi' : 'Tara kutilmoqda')
        : activeZone === 'gross'
          ? (grossDone === total ? 'Brutto tortildi' : 'Brutto kutilmoqda')
          : (sealsDone === total ? 'Plombalandi' : 'Plomba kutilmoqda');

    const statusClass = isExited
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
      : (activeZone === 'tare' ? tareDone === total : activeZone === 'gross' ? grossDone === total : sealsDone === total)
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
        : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300';

    const listCols = activeZone === 'tare'
      ? 'xl:grid-cols-[48px_minmax(160px,.95fr)_112px_92px_minmax(220px,1.25fr)_120px_minmax(150px,.9fr)_180px]'
      : activeZone === 'gross'
        ? 'xl:grid-cols-[48px_minmax(160px,.95fr)_112px_92px_minmax(220px,1.25fr)_110px_110px_minmax(150px,.9fr)_180px]'
        : 'xl:grid-cols-[48px_minmax(160px,.95fr)_112px_92px_minmax(220px,1.25fr)_110px_110px_minmax(150px,.9fr)_180px]';

    const displayedUnits = units;

    return (
      <article
        key={bundle.id}
        className={open
          ? 'overflow-hidden bg-transparent'
          : 'overflow-hidden border-b border-slate-200 bg-white transition last:border-b-0 dark:border-slate-700 dark:bg-slate-900'}
      >
        <div className={`${open ? 'hidden' : 'grid'} grid-cols-1 transition-colors hover:bg-sky-50/45 ${listCols} xl:items-stretch dark:hover:bg-slate-800/70`}>
          <button
            type="button"
            className="contents text-left"
            onClick={() => setViewPartyId(bundle.id)}
            aria-expanded={open}
          >
            <span className="flex items-center justify-center border-r border-slate-200 px-2 py-3 text-sm tabular-nums text-slate-700 dark:border-slate-700 dark:text-slate-200">{idx + 1}</span>
            <div className="relative flex min-w-0 items-center justify-center border-r border-slate-200 px-7 py-3 text-center dark:border-slate-700">
              <strong className="truncate font-mono text-sm text-slate-900 dark:text-slate-50">{bundle.displayNumber || '—'}</strong>
              <ChevronDown className={`absolute right-2 h-4 w-4 text-slate-400 transition ${open ? 'rotate-0' : '-rotate-90'}`} strokeWidth={1.75} />
            </div>
            <span className="flex items-center justify-center border-r border-slate-200 px-2 py-3 text-sm tabular-nums text-slate-600 dark:border-slate-700 dark:text-slate-300">{dateLabel || '—'}</span>
            <strong className="flex items-center justify-center border-r border-slate-200 px-2 py-3 text-sm tabular-nums dark:border-slate-700">{total} ta</strong>
            <span className="flex min-w-0 items-center justify-center border-r border-slate-200 px-3 py-3 text-center text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200">{product}</span>
            {activeZone === 'tare' ? (
              <span className="flex items-center justify-center border-r border-slate-200 px-2 py-3 text-sm font-semibold tabular-nums text-slate-700 dark:border-slate-700 dark:text-slate-200">{tareDone}/{total}</span>
            ) : activeZone === 'gross' ? (
              <>
                <span className="flex items-center justify-center border-r border-slate-200 px-2 py-3 text-sm font-semibold tabular-nums text-slate-700 dark:border-slate-700 dark:text-slate-200">{tareDone}/{total}</span>
                <span className="flex items-center justify-center border-r border-slate-200 px-2 py-3 text-sm font-semibold tabular-nums text-slate-700 dark:border-slate-700 dark:text-slate-200">{grossDone}/{total}</span>
              </>
            ) : (
              <>
                <span className="flex items-center justify-center border-r border-slate-200 px-2 py-3 text-sm font-semibold tabular-nums text-slate-700 dark:border-slate-700 dark:text-slate-200">{grossDone}/{total}</span>
                <span className="flex items-center justify-center border-r border-slate-200 px-2 py-3 text-sm font-semibold tabular-nums text-slate-700 dark:border-slate-700 dark:text-slate-200">{sealsDone}/{total}</span>
              </>
            )}
            <span className="flex items-center justify-center border-r border-slate-200 px-2 py-3 dark:border-slate-700">
              <b className={`inline-flex rounded-lg border px-2 py-1 text-center text-[11px] font-semibold ${statusClass}`}>{oneC ? '1C ma’lumoti' : statusLabel}</b>
            </span>
          </button>
          <div className="flex min-w-0 items-center justify-center gap-1.5 px-2 py-2" onClick={e => e.stopPropagation()}>
            {!open ? (
              <button
                type="button"
                className="table-row-ctrl table-row-ctrl--primary whitespace-nowrap"
                onClick={() => setViewPartyId(bundle.id)}
              >
                Ochish
              </button>
            ) : null}
          </div>
        </div>

        {open ? (
          <div className="nhub-row__detail">
            {isExited ? (
              <div className="mb-3 flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 dark:border-emerald-900/40 dark:bg-emerald-950/40">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                    Ushbu yuk xati ({bundle.displayNumber}) bo‘yicha jarayon to‘liq yakunlangan va vagonlar jo‘natilgan.
                  </span>
                  <span className="ml-auto text-xs font-medium text-emerald-700 dark:text-emerald-300">
                    Jami: {total} ta vagon
                  </span>
                </div>
              </div>
            ) : activeZone === 'tare' && pendingTareUnits.length > 0 ? (
              <div className="mb-3 flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/60">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Tara tekshiruvi tasdiqlangan: {units.filter(u => u.tareCheckedAt).length}/{total}
                    {` · Tekshiruv kutilmoqda: ${pendingTareUnits.length}`}
                  </span>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="btn-primary !px-3.5 !py-1.5 !text-xs !bg-emerald-600 hover:!bg-emerald-700 inline-flex items-center gap-1.5 font-semibold text-white shadow-sm"
                      disabled={sendingLoading}
                      onClick={() => sendPartyToLoading(bundle)}
                      title="Tara qiymatini kutmasdan kirish tekshiruvini yakunlash"
                    >
                      <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.2} />
                      {sendingLoading ? 'Yuborilmoqda…' : `Barchasini tara qilindi (${pendingTareUnits.length})`}
                    </button>
                  </div>
                </div>
              </div>
            ) : activeZone === 'gross' && pendingGrossUnits.length > 0 ? (
              <div className="mb-3 flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/60">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    1C dan tasdiqlangan: {grossDone}/{total}
                    {` · Tekshiruv kutilmoqda: ${pendingGrossUnits.length}`}
                  </span>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="btn-primary !px-3.5 !py-1.5 !text-xs !bg-emerald-600 hover:!bg-emerald-700 inline-flex items-center gap-1.5 font-semibold text-white shadow-sm"
                      disabled={sendingLoading}
                      onClick={() => sendPartyToSeals(bundle)}
                      title="Barcha yaroqli vagonlarni yuk tortishini yakunlash"
                    >
                      <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.2} />
                      {sendingLoading ? 'Yuborilmoqda…' : `Yuk tortishni yakunlash (${pendingGrossUnits.length})`}
                    </button>
                  </div>
                </div>
              </div>
            ) : activeZone === 'seals' ? (() => {
              const selectedPartyRows = partyWagonRows.filter(r => selectedUnitIds.has(r.unit.id));
              const selectedUnsealedRows = selectedPartyRows.filter(r => !sealProgress(r.unit).hasSeal);
              const selectedPendingScale = selectedPartyRows.filter(r => !sealProgress(r.unit).scale && sealProgress(r.unit).hasSeal);
              const selectedPendingSecurity = selectedPartyRows.filter(r => !sealProgress(r.unit).security && r.unit.status !== 'Sealed' && sealProgress(r.unit).hasSeal);
              const unsealedPartyRows = partyWagonRows.filter(r => !sealProgress(r.unit).hasSeal);

              if (selectedPartyRows.length > 0) {
                return (
                  <div className="mb-3 flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-300 bg-sky-50/90 px-3.5 py-2.5 dark:border-sky-800/80 dark:bg-sky-950/50">
                      <span className="text-xs font-bold text-sky-900 dark:text-sky-200">
                        Tanlangan: {selectedPartyRows.length} ta vagon
                        {selectedUnsealedRows.length > 0 ? ` (${selectedUnsealedRows.length} tasida plomba yo‘q)` : ''}
                      </span>
                      <div className="ml-auto flex flex-wrap items-center gap-2">
                        {selectedUnsealedRows.length > 0 && (
                          <button
                            type="button"
                            className="btn-primary !px-3.5 !py-1.5 !text-xs !bg-amber-600 hover:!bg-amber-700 inline-flex items-center gap-1.5 font-semibold text-white shadow-sm"
                            onClick={() => openInstallSealModal(selectedUnsealedRows)}
                            title="Tanlangan plombasiz vagonlarga plomba raqami biriktirish / o‘rnatish"
                          >
                            <Tag className="h-3.5 w-3.5" strokeWidth={2.2} />
                            Plomba o‘rnatish ({selectedUnsealedRows.length})
                          </button>
                        )}
                        {isAdmin && selectedPendingSecurity.length > 0 && (
                          <button
                            type="button"
                            className="btn-primary !px-3.5 !py-1.5 !text-xs !bg-sky-600 hover:!bg-sky-700 inline-flex items-center gap-1.5 font-semibold text-white shadow-sm"
                            disabled={confirmSubmitting}
                            onClick={() => startConfirmAll(selectedPartyRows, 'Security')}
                            title="Faqat Admin: tanlangan vagonlarni Qo‘riqlash nomidan tasdiqlash"
                          >
                            <Shield className="h-3.5 w-3.5" strokeWidth={2.2} />
                            {confirmSubmitting ? 'Tasdiqlanmoqda…' : `Tanlanganlarga Qo‘riqlash tasdig‘i (${selectedPendingSecurity.length})`}
                          </button>
                        )}
                        {selectedPendingScale.length > 0 && (
                          <button
                            type="button"
                            className="btn-primary !px-3.5 !py-1.5 !text-xs !bg-emerald-600 hover:!bg-emerald-700 inline-flex items-center gap-1.5 font-semibold text-white shadow-sm"
                            disabled={confirmSubmitting}
                            onClick={() => startConfirmAll(selectedPartyRows, 'Scale')}
                            title="Tanlangan vagonlarga plomba o‘rnatilganligini tasdiqlash va Qo‘riqlashga o‘tkazish"
                          >
                            <Check className="h-3.5 w-3.5" strokeWidth={2.2} />
                            {confirmSubmitting ? 'Tasdiqlanmoqda…' : `Tanlanganlarga plomba o‘rnatildi (${selectedPendingScale.length})`}
                          </button>
                        )}
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          onClick={() => {
                            setSelectedUnitIds(prev => {
                              const next = new Set(prev);
                              selectedPartyRows.forEach(r => next.delete(r.unit.id));
                              return next;
                            });
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                          Tanlovni bekor qilish
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              if (pendingScaleRows.length > 0 || (isAdmin && pendingSecurityRows.length > 0) || unsealedPartyRows.length > 0) {
                return (
                  <div className="mb-3 flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/60">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        Plomba o‘rnatilgan: {sealsDone}/{total}
                        {pendingScaleRows.length > 0 ? ` · Kutilmoqda: ${pendingScaleRows.length}` : ''}
                        {isAdmin && pendingSecurityRows.length > 0 ? ` · Qo‘riqlash kutilmoqda: ${pendingSecurityRows.length}` : ''}
                      </span>
                      <div className="ml-auto flex flex-wrap items-center gap-2">
                        {unsealedPartyRows.length > 0 && (
                          <button
                            type="button"
                            className="btn-primary !px-3.5 !py-1.5 !text-xs !bg-amber-600 hover:!bg-amber-700 inline-flex items-center gap-1.5 font-semibold text-white shadow-sm"
                            onClick={() => openInstallSealModal(unsealedPartyRows)}
                            title="Plombasi yo‘q barcha vagonlarga plomba raqami biriktirish"
                          >
                            <Tag className="h-3.5 w-3.5" strokeWidth={2.2} />
                            Plomba o‘rnatish ({unsealedPartyRows.length})
                          </button>
                        )}
                        {isAdmin && pendingSecurityRows.length > 0 && (
                          <button
                            type="button"
                            className="btn-primary !px-3.5 !py-1.5 !text-xs !bg-sky-600 hover:!bg-sky-700 inline-flex items-center gap-1.5 font-semibold text-white shadow-sm"
                            disabled={confirmSubmitting}
                            onClick={() => startConfirmAll(partyWagonRows, 'Security')}
                            title="Faqat Admin: plomba o‘rnatilgan barcha vagonlarni Qo‘riqlash nomidan tasdiqlash"
                          >
                            <Shield className="h-3.5 w-3.5" strokeWidth={2.2} />
                            {confirmSubmitting ? 'Tasdiqlanmoqda…' : `Qo‘riqlash tasdig‘i (${pendingSecurityRows.length})`}
                          </button>
                        )}
                        {pendingScaleRows.length > 0 && (
                          <button
                            type="button"
                            className="btn-primary !px-3.5 !py-1.5 !text-xs !bg-emerald-600 hover:!bg-emerald-700 inline-flex items-center gap-1.5 font-semibold text-white shadow-sm"
                            disabled={confirmSubmitting}
                            onClick={() => startConfirmAll(partyWagonRows, 'Scale')}
                            title="Barcha vagonlarga plomba o‘rnatilganligini tasdiqlash va Qo‘riqlashga o‘tkazish"
                          >
                            <Check className="h-3.5 w-3.5" strokeWidth={2.2} />
                            {confirmSubmitting ? 'Tasdiqlanmoqda…' : `Barchasiga plomba o‘rnatildi (${pendingScaleRows.filter(r => sealProgress(r.unit).hasSeal).length})`}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              return null;
            })() : null}

            <div className="thub-table-wrap reestr-table-wrap scalehub-party-table">
              <table className="thub-table reestr-table reestr-table--compact scalehub-wagons-table">
                <thead>
                  <tr>
                    {activeZone === 'seals' ? (
                      <th className="!w-12 text-center">
                        <input
                          type="checkbox"
                          aria-label="Barcha vagonlarni tanlash"
                          checked={displayedUnits.length > 0 && displayedUnits.every(u => selectedUnitIds.has(u.id))}
                          onChange={() => toggleSelectAllParty(displayedUnits)}
                          className="size-4 rounded border-slate-300 accent-blue-600 cursor-pointer"
                        />
                      </th>
                    ) : null}
                    <th>№</th>
                    <th>Vagon raqami</th>
                    <th>Sana / vaqt</th>
                    {activeZone === 'tare' ? (
                      <>
                        <th>Vagon turi</th>
                        <th>Mahsulot</th>
                        <th>Kelish holati</th>
                        <th>Tegishlilik</th>
                        <th>Konteyner / sisterna</th>
                        <th>Tara</th>
                      </>
                    ) : activeZone === 'gross' ? (
                      <>
                        <th>Mahsulot</th>
                        <th>Tara</th>
                        <th>Brutto</th>
                        <th>Netto</th>
                        <th>Holat</th>
                      </>
                    ) : (
                      <>
                        <th>Mahsulot</th>
                        <th>Tara</th>
                        <th>Brutto</th>
                        <th>Netto</th>
                        <th>Plomba raqami</th>
                        <th>Tasdiq holati</th>
                      </>
                    )}
                    <th>Amallar</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedUnits.length === 0 ? (
                    <tr>
                      <td colSpan={activeZone === 'tare' ? 11 : activeZone === 'gross' ? 10 : 12} className="py-8 text-center text-slate-500 dark:text-slate-400">
                        <p className="text-sm font-semibold">Ushbu ro‘yxatda vagonlar mavjud emas</p>
                      </td>
                    </tr>
                  ) : displayedUnits.map((unit, uIdx) => {
                    const sourceArrival = unitArrivalById.get(unit.id) ?? arrival;
                    const row: WagonRow = { arrival: sourceArrival, unit };
                    const unitOneC = fromOneC(sourceArrival, unit);
                    const needG = unitNeedsGross(sourceArrival, unit);
                    const needT = unitNeedsTare(sourceArrival, unit);
                    const exited = unitExited(sourceArrival, unit);
                    const unitDefective = isUnitDefective(unit);
                    const prog = sealProgress(unit);
                    const isUnitDone = isReadyForWaybill(unit);
                    const isSelected = selectedUnitIds.has(unit.id);

                    return (
                      <tr
                        key={`${sourceArrival.id}:${unit.wagonNumber}`}
                        className={`${unitDefective ? 'bg-amber-50/40 border-l-4 !border-l-amber-500 dark:bg-amber-950/20' : ''} ${isSelected ? '!bg-sky-50/70 dark:!bg-sky-950/30' : ''}`}
                      >
                        {activeZone === 'seals' ? (
                          <td className="text-center" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              aria-label={`${unit.wagonNumber} vagonini tanlash`}
                              checked={isSelected}
                              onChange={() => toggleUnitSelected(unit.id)}
                              className="size-4 rounded border-slate-300 accent-blue-600 cursor-pointer"
                            />
                          </td>
                        ) : null}
                        <td className="thub-mono reestr-num">{uIdx + 1}</td>
                        <td className="whitespace-nowrap font-mono font-bold tracking-wide">
                          <span className="flex items-center gap-1.5">
                            {unit.wagonNumber}
                            {unitDefective && (
                              <span title="Nomuvofiqlik qayd etilgan" className="text-amber-600 dark:text-amber-400">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="whitespace-nowrap tabular-nums">
                          {wagonEventDateTime(unit, sourceArrival, activeZone)}
                        </td>
                        {activeZone === 'tare' ? (
                          <>
                            <td className="whitespace-nowrap text-sm font-medium text-slate-800 dark:text-slate-100">
                              {wagonTypeLabel(unit)}
                            </td>
                            <td className="max-w-[14rem] text-sm font-medium text-slate-700 dark:text-slate-200">
                              {toLatinProductName(unit.productType || sourceArrival.productType) || 'Tanlanmagan'}
                            </td>
                            <td className="whitespace-nowrap text-sm text-slate-700 dark:text-slate-200">
                              {intakeLoadStateLabel(unit.intakeLoadState)}
                            </td>
                            <td className="whitespace-nowrap text-sm text-slate-700 dark:text-slate-200">
                              {wagonOwnershipLabel(unit.ownership)}
                            </td>
                            <td className="max-w-[12rem] font-mono text-sm text-slate-700 dark:text-slate-200">
                              {(() => {
                                const containers = parseContainers(unit.cisternNumber);
                                if (containers.length > 0) return containers.join(' · ');
                                return unit.cisternNumber != null && String(unit.cisternNumber).trim() ? String(unit.cisternNumber).trim() : '—';
                              })()}
                            </td>
                            <td className="tabular-nums font-semibold">{unit.tareWeight || '—'}</td>
                          </>
                        ) : activeZone === 'gross' ? (
                          <>
                            <td className="max-w-[14rem] text-sm font-medium text-slate-700 dark:text-slate-200">
                              {toLatinProductName(unit.productType || sourceArrival.productType) || 'Tanlanmagan'}
                            </td>
                            <td className="tabular-nums font-medium">{displayTare(unit)}</td>
                            <td className="tabular-nums font-medium">{displayGross(unit)}</td>
                            <td className="tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                              {displayNetto(unit)}
                            </td>
                            <td className="text-center px-2 py-2">
                              {unitDefective ? (
                                <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                  <AlertTriangle className="h-3 w-3" />
                                  Qaytarilgan
                                </span>
                              ) : isNotInOneC(unit.wagonNumber) ? (
                                <span
                                  className="inline-flex items-center gap-1 rounded-lg border-2 border-rose-400 bg-rose-50 px-2 py-1 text-xs font-bold text-rose-800 dark:border-rose-700 dark:bg-rose-950/60 dark:text-rose-200 shadow-xs"
                                  title="Bu vagon uchun SHGKM plombasi yoki tarozi ma’lumoti 1C ga kiritilmagan! Tarozibon adminga murojaat qilsin — Admin 1C ma'lumotlarini admin/integrations/1c orqali qo'lda to'g'irlab beradi."
                                >
                                  <AlertTriangle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                                  SHGKM plombasi 1C ga kiritilmagan
                                </span>
                              ) : (
                                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                                  {unitStatusLabel(unit)}
                                </span>
                              )}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="max-w-[14rem] text-sm font-medium text-slate-700 dark:text-slate-200">
                              {toLatinProductName(unit.productType || sourceArrival.productType) || 'Tanlanmagan'}
                            </td>
                            <td className="tabular-nums font-medium">{displayTare(unit)}</td>
                            <td className="tabular-nums font-medium">{displayGross(unit)}</td>
                            <td className="tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                              {displayNetto(unit)}
                            </td>
                            <td className="text-center px-2 py-2">
                              {prog.hasSeal ? (
                                renderSealBadges(unit)
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => openInstallSealModal([row])}
                                  className="inline-flex items-center gap-1 rounded-md border border-dashed border-amber-400 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300 transition cursor-pointer"
                                  title="Plomba raqamini kiritish va o‘rnatish"
                                >
                                  <Tag className="h-3 w-3 text-amber-600" />
                                  + Plomba o‘rnatish
                                </button>
                              )}
                            </td>
                            <td className="text-center px-2 py-2">
                              <div className="flex items-center justify-center gap-1.5">
                                <span
                                  title={prog.scale ? `Tarozibon: ${unit.sealConfirmedByScaleName || 'Tasdiqlangan'}` : 'Tarozibon tasdig‘i kutilmoqda'}
                                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold transition ${
                                    prog.scale
                                      ? 'border border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300'
                                      : 'border border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-500'
                                  }`}
                                >
                                  <Lock className="h-3 w-3" />
                                  {prog.scale ? 'Tarozi' : '—'}
                                </span>
                                <span
                                  title={prog.security ? `Qo‘riqlash: ${unit.sealConfirmedBySecurityName || 'Tasdiqlangan'}` : 'Qo‘riqlash tasdig‘i kutilmoqda'}
                                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold transition ${
                                    prog.security
                                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                                      : 'border border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-500'
                                  }`}
                                >
                                  <Shield className="h-3 w-3" />
                                  {prog.security ? 'Qo‘riqlash' : '—'}
                                </span>
                              </div>
                            </td>
                          </>
                        )}
                        <td>
                          {isExited ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Yakunlangan
                            </span>
                          ) : unitOneC || exited ? (
                            <span className="text-xs font-medium text-slate-400">Faqat ko‘rish</span>
                          ) : activeZone === 'tare' ? (
                            <div className="table-row-actions flex-wrap">
                              {unitDefective ? (
                                <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                                  {unit.loadingComment || 'Nomuvofiqlik aniqlangan'}
                                </span>
                              ) : needT ? (
                                <>
                                  <button
                                    type="button"
                                    className="table-row-ctrl !inline-flex !items-center !gap-1.5 !border-emerald-300 !bg-emerald-50 !text-emerald-800 hover:!bg-emerald-100 dark:!border-emerald-700 dark:!bg-emerald-950/40 dark:!text-emerald-300"
                                    disabled={defectSubmitting || sendingLoading}
                                    onClick={() => sendUnitToLoading(row)}
                                  >
                                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                                    Yuklashga jo‘natish
                                  </button>
                                  <button
                                    type="button"
                                    className="table-row-ctrl !inline-flex !items-center !gap-1.5 !border-amber-300 !bg-amber-50 !text-amber-800 hover:!bg-amber-100 dark:!border-amber-700 dark:!bg-amber-950/40 dark:!text-amber-300"
                                    disabled={defectSubmitting || sendingLoading}
                                    onClick={() => openTareReturn(row)}
                                  >
                                    <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} />
                                    Nomuvofiqlik
                                  </button>
                                </>
                              ) : (
                                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{unitStatusLabel(unit)}</span>
                              )}
                            </div>
                          ) : activeZone === 'gross' ? (
                            <div className="table-row-actions flex-wrap">
                              {unitDefective ? (
                                <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                                  {unit.loadingComment || 'Nomuvofiqlik aniqlangan'}
                                </span>
                              ) : needG ? (
                                <>
                                  <button
                                    type="button"
                                    className="table-row-ctrl !inline-flex !items-center !gap-1.5 !border-emerald-300 !bg-emerald-50 !text-emerald-800 hover:!bg-emerald-100 dark:!border-emerald-700 dark:!bg-emerald-950/40 dark:!text-emerald-300"
                                    disabled={defectSubmitting || sendingLoading}
                                    onClick={() => sendUnitToSeals(row)}
                                  >
                                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                                    Yuk tortishni yakunlash
                                  </button>
                                  <button
                                    type="button"
                                    className="table-row-ctrl !inline-flex !items-center !gap-1.5 !border-amber-300 !bg-amber-50 !text-amber-800 hover:!bg-amber-100 dark:!border-amber-700 dark:!bg-amber-950/40 dark:!text-amber-300"
                                    disabled={defectSubmitting || sendingLoading}
                                    onClick={() => openGrossReturn(row)}
                                  >
                                    <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} />
                                    Nomuvofiqlik
                                  </button>
                                </>
                              ) : (
                                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{unitStatusLabel(unit)}</span>
                              )}
                            </div>
                          ) : (
                            /* seals zone actions */
                            <div className="table-row-actions flex-wrap">
                              {isUnitDone || prog.done ? (
                                <div className="flex items-center justify-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                                    Muhrlangan
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => openSealReturn(row)}
                                    className="table-row-ctrl !inline-flex !items-center !gap-1.5 !border-amber-300 !bg-amber-50 !text-amber-800 hover:!bg-amber-100 dark:!border-amber-700 dark:!bg-amber-950/40 dark:!text-amber-300"
                                    title="Plomba shikastlangan yoki nomuvofiqlik aniqlanganda dalolatnoma bilan qayd etish va almashtirish"
                                  >
                                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" strokeWidth={2} />
                                    Nomuvofiqlik
                                  </button>
                                  {unit.defectActNumber ? (
                                    <button
                                      type="button"
                                      onClick={() => setSelectedDefectAct(row)}
                                      className="table-row-ctrl !inline-flex !items-center !gap-1 text-xs !border-amber-300 !bg-amber-50 !text-amber-800"
                                      title="Elektron dalolatnomani ko‘rish"
                                    >
                                      <FileText className="h-3 w-3 text-amber-600" />
                                      Dalolatnoma
                                    </button>
                                  ) : null}
                                </div>
                              ) : (
                                <>
                                  {!prog.hasSeal ? (
                                    <>
                                      {isNotInOneC(unit.wagonNumber) && (
                                        <span
                                          className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-800 dark:border-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
                                          title="Bu vagon 1C tarozi bazasida topilmadi. SHGKM plombasi yoki tarozi ma’lumoti 1C ga kiritilmagan. Adminga murojaat qiling — admin/integrations/1c orqali to’g‘irlanadi."
                                        >
                                          <AlertTriangle className="h-3 w-3 text-rose-600" />
                                          1C da yo’q
                                        </span>
                                      )}
                                        <button
                                        type="button"
                                        onClick={() => openInstallSealModal([row])}
                                        className="table-row-ctrl !inline-flex !items-center !gap-1.5 !border-amber-300 !bg-amber-50 !text-amber-800 hover:!bg-amber-100 font-semibold dark:!border-amber-700 dark:!bg-amber-950/40 dark:!text-amber-300"
                                        title="Plomba raqamini kiritish va o‘rnatish"
                                        >
                                        <Tag className="h-3.5 w-3.5 text-amber-600" strokeWidth={2} />
                                        Plomba o‘rnatish
                                        </button>
                                    </>
                                  ) : !prog.scale ? (
                                    <button
                                      type="button"
                                      onClick={() => startConfirm(row, 'Scale')}
                                      className="table-row-ctrl !inline-flex !items-center !gap-1.5 !border-emerald-300 !bg-emerald-50 !text-emerald-800 hover:!bg-emerald-100 font-semibold dark:!border-emerald-700 dark:!bg-emerald-950/40 dark:!text-emerald-300"
                                      title="Plomba o‘rnatilganligini tasdiqlash va Qo‘riqlashga o‘tkazish"
                                    >
                                      <Check className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.2} />
                                      Plomba o‘rnatildi
                                    </button>
                                  ) : isAdmin && !prog.security ? (
                                    <button
                                      type="button"
                                      onClick={() => startConfirm(row, 'Security')}
                                      className="table-row-ctrl !inline-flex !items-center !gap-1.5 !border-sky-300 !bg-sky-50 !text-sky-800 hover:!bg-sky-100 font-semibold dark:!border-sky-700 dark:!bg-sky-950/40 dark:!text-sky-300"
                                      title="Faqat Admin: plomba o‘rnatilganligini Qo‘riqlash nomidan tasdiqlash"
                                    >
                                      <Shield className="h-3.5 w-3.5 text-sky-600" strokeWidth={2.2} />
                                      Qo‘riqlash tasdig‘i
                                    </button>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                                      <Check className="h-3.5 w-3.5 text-sky-600" />
                                      Plomba o‘rnatilgan
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => openSealReturn(row)}
                                    className="table-row-ctrl !inline-flex !items-center !gap-1.5 !border-amber-300 !bg-amber-50 !text-amber-800 hover:!bg-amber-100 dark:!border-amber-700 dark:!bg-amber-950/40 dark:!text-amber-300"
                                    title="Plomba shikastlangan yoki nomuvofiqlik aniqlanganda dalolatnoma bilan qayd etish va almashtirish"
                                  >
                                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" strokeWidth={2} />
                                    Nomuvofiqlik
                                  </button>
                                  {unit.defectActNumber ? (
                                    <button
                                      type="button"
                                      onClick={() => setSelectedDefectAct(row)}
                                      className="table-row-ctrl !inline-flex !items-center !gap-1 text-xs !border-amber-300 !bg-amber-50 !text-amber-800"
                                      title="Elektron dalolatnomani ko‘rish"
                                    >
                                      <FileText className="h-3 w-3 text-amber-600" />
                                      Dalolatnoma
                                    </button>
                                  ) : null}
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </article>
    );
  };

  const board = () => {
    if (loading) {
      return (
        <div className="thub-empty">
          <p className="thub-empty__title">Yuklanmoqda…</p>
        </div>
      );
    }
    if (list.length === 0) {
      return (
        <div className="thub-empty">
          <TrainFront className="mx-auto mb-2 h-10 w-10 text-slate-300" strokeWidth={1.5} />
          <p className="thub-empty__title">Vagon yo‘q</p>
          <p className="thub-empty__text">{emptyHint()}</p>
        </div>
      );
    }

    return (
      <div className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900/40">
        {list.map((bundle, idx) => renderParty(bundle, idx))}
      </div>
    );
  };

  return (
    <div className="thub reestr scalehub">
      <section className="thub__main reestr-main">
        {viewedParty ? (
          <div className="marketing-order-page space-y-4">
            <div className="marketing-order-page__bar ui-card">
              <div className="marketing-order-page__bar-main">
                <ProductDetailBackButton onClick={() => {
                  if (fromQuery) {
                    navigate(fromQuery);
                  } else if (isAdmin) {
                    const pId = viewedParty?.arrival?.id || arrivalIdFromQuery;
                    navigate(`/dashboard?focus=kirish${pId ? `&party=${encodeURIComponent(pId)}` : ''}`);
                  } else {
                    closePartyView();
                  }
                }} />
                <div className="min-w-0">
                  <h2 className="marketing-order-page__title">
                    {activeZone === 'tare' ? 'Tara tortish' : 'Brutto / Netto (Yuk tortish)'}
                  </h2>
                  <p className="marketing-order-page__subtitle">{viewedParty.displayNumber}</p>
                </div>
              </div>
            </div>

            <section className="order-sheet-card">
              <header className="order-sheet-header">
                <div className="order-sheet-header__main">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                    <Weight className="h-6 w-6" strokeWidth={1.8} />
                  </div>
                  <div className="order-sheet-header__text">
                    <div className="order-sheet-header__title-row">
                      <span className="order-sheet-header__product">
                        {activeZone === 'tare' ? 'Tara tortish' : 'Brutto / Netto (Yuk tortish)'}
                      </span>
                      <span className="inline-flex rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
                        {viewedParty.total} ta vagon
                      </span>
                    </div>
                    <span className="order-sheet-header__code">{viewedParty.displayNumber}</span>
                  </div>
                </div>
                <div className="order-sheet-header__aside flex items-center gap-2">
                  <button
                    type="button"
                    onClick={closePartyView}
                    className="btn-secondary !text-xs !py-1.5 !px-3 inline-flex items-center gap-1.5 font-medium"
                    title="Bajarilishi kerak bo‘lgan ishlar navbatiga qaytish"
                  >
                    Ish navbati ({zoneCounts[activeZone]})
                  </button>
                </div>
              </header>
              <div className="order-sheet-body">
                {renderParty(viewedParty, 0)}
                {stageNote ? (
                  <p className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold ${stageNote.tone === 'done' ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'}`}>
                    {stageNote.tone === 'done' ? <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2} /> : null}
                    <span>{stageNote.text}</span>
                    {stageNote.at ? (
                      <span className="font-medium text-slate-500 dark:text-slate-400">· {formatDateTime(stageNote.at)}</span>
                    ) : null}
                  </p>
                ) : null}
              </div>
            </section>
          </div>
        ) : (
          <>
            <div className="marketing-order-page__bar ui-card mb-4">
              <div className="marketing-order-page__bar-main">
                {fromQuery ? (
                  <ProductDetailBackButton onClick={() => {
                    if (fromQuery) {
                      navigate(fromQuery);
                    } else if (isAdmin) {
                      navigate('/dashboard?focus=kirish');
                    }
                  }} />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                    {activeZone === 'tare' ? (
                      <Weight className="h-5 w-5" strokeWidth={1.8} />
                    ) : activeZone === 'gross' ? (
                      <Scale className="h-5 w-5" strokeWidth={1.8} />
                    ) : (
                      <Lock className="h-5 w-5" strokeWidth={1.8} />
                    )}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <h2 className="marketing-order-page__title">
                      {activeZone === 'tare' ? 'Tara tortish' : 'Brutto / Netto (Yuk tortish)'}
                    </h2>
                    <span className="inline-flex rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-bold text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
                      {loading ? '…' : `${zoneCounts[activeZone]} ta vagon`}
                    </span>
                  </div>
                  <p className="marketing-order-page__subtitle">
                    {activeZone === 'tare'
                      ? 'Kirishdagi tara tekshiruvi — 1C og‘irliklari kutilmaydi'
                      : 'Yuklangan vagonlar brutto og‘irligi, SHGKM plombasi va 1C integratsiyasi'}
                  </p>
                </div>
              </div>
              {activeZone !== 'tare' && <div className="marketing-order-page__bar-actions flex items-center gap-2">
                <button
                  type="button"
                  className="btn-secondary !text-xs !py-1.5 !px-3 inline-flex items-center gap-1.5 font-medium"
                  disabled={syncingOneC}
                  onClick={syncWithOneC}
                  title="1C dan tortish va plomba ma'lumotlarini yangilash"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncingOneC ? 'animate-spin' : ''}`} strokeWidth={2} />
                  {syncingOneC ? '1C dan olinmoqda…' : '1C bilan yangilash'}
                </button>
                {syncMessage ? (
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    ✓ {syncMessage}
                  </span>
                ) : null}
              </div>}
            </div>

            {activeZone !== 'tare' && unmatchedOneCWagons.size > 0 && (
              <div className="mb-3 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 dark:border-rose-700 dark:bg-rose-950/40">
                <div className="flex flex-wrap items-start gap-3">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-rose-900 dark:text-rose-100">
                      {unmatchedOneCWagons.size} ta vagon 1C tarozi bazasida topilmadi
                    </p>
                    <p className="mt-0.5 text-xs text-rose-700 dark:text-rose-300">
                      Ushbu vagonlar (
                      <span className="font-mono font-semibold">
                        {[...unmatchedOneCWagons].join(', ')}
                      </span>
                      ) uchun SHGKM plombasi yoki tarozi ma’lumoti 1C ga kiritilmagan.
                      Tarozibon adminga murojaat qilishi lozim.
                    </p>
                    {isAdmin && (
                      <a
                        href="/admin/integrations/1c"
                        className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-rose-800 underline hover:text-rose-900 dark:text-rose-300 dark:hover:text-rose-100"
                      >
                        Admin: 1C integratsiyasini qo’lda tahrirlash →
                      </a>
                    )}
                    {!isAdmin && (
                      <p className="mt-1 text-xs font-medium text-rose-700 dark:text-rose-400">
                        Adminga murojaat qiling — u /admin/integrations/1c sahifasida ma’lumotlarni to’g’irlab beradi.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
            {error ? <p className="mb-3 text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}

            <div className="thub__board">{board()}</div>
          </>
        )}
      </section>

      {/* Nomuvofiqlik qayd etish modal (Tara, Brutto yoki Plomba) */}
      {defectTarget ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/60 p-4 backdrop-blur-sm sm:items-center">
          <form
            onSubmit={submitDefect}
            className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in fade-in zoom-in-95 duration-150"
          >
            <header className="flex items-center justify-between border-b border-slate-100 px-6 py-5 dark:border-slate-800">
              <div className="flex min-w-0 items-center gap-3.5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300">
                  <AlertTriangle className="h-6 w-6" strokeWidth={2} />
                </span>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    Nomuvofiqlik qayd etish
                  </h3>
                  <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                    Vagon <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{defectTarget.row.unit.wagonNumber}</span> · {defectTarget.kind === 'tare' ? 'Tara bosqichi' : defectTarget.kind === 'gross' ? 'Brutto bosqichi' : 'Plomba bosqichi'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="admin-icon-btn !h-10 !w-10 rounded-full"
                aria-label="Yopish"
                disabled={defectSubmitting}
                onClick={() => setDefectTarget(null)}
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </header>
            <div className="space-y-4 px-6 py-5">
              <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                <div>
                  <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">Mahsulot</span>
                  <strong className="text-sm text-slate-900 dark:text-slate-100">
                    {toLatinProductName(defectTarget.row.unit.productType || defectTarget.row.arrival.productType) || '—'}
                  </strong>
                </div>
                <div>
                  <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                    {defectTarget.kind === 'tare' ? 'Tara' : defectTarget.kind === 'gross' ? 'Brutto' : 'Amaldagi plomba'}
                  </span>
                  <strong className="text-sm text-slate-900 dark:text-slate-100">
                    {defectTarget.kind === 'tare'
                      ? (defectTarget.row.unit.tareWeight ? `${defectTarget.row.unit.tareWeight} tn` : '—')
                      : defectTarget.kind === 'gross'
                        ? (defectTarget.row.unit.grossWeight ? `${defectTarget.row.unit.grossWeight} tn` : '—')
                        : (defectTarget.row.unit.sealNumber || 'Mavjud emas')}
                  </strong>
                </div>
              </div>

              {defectTarget.kind === 'seal' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Yangi plomba raqami
                    </label>
                    <input
                      type="text"
                      value={replacementSealNumber}
                      onChange={e => setReplacementSealNumber(e.target.value.toUpperCase())}
                      placeholder="Masalan: 4947220-25"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-sm font-bold uppercase text-slate-900 shadow-xs focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Elektron dalolatnoma
                    </label>
                    <input
                      type="text"
                      value={defectActNumberInput}
                      onChange={e => setDefectActNumberInput(e.target.value)}
                      placeholder="PL-20260915-0001"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-sm shadow-xs focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>
              )}

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {defectTarget.kind === 'seal' ? 'Plomba shikastlanishi / nomuvofiqlik sababi' : 'Nomuvofiqlik / nuqson sababi'} <span className="text-rose-500">*</span>
                </span>
                <textarea
                  value={defectReason}
                  onChange={event => setDefectReason(event.target.value)}
                  rows={3}
                  autoFocus
                  className="w-full rounded-2xl border border-slate-300 bg-white p-3.5 text-sm leading-relaxed text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                  placeholder={
                    defectTarget.kind === 'tare'
                      ? 'Masalan: bo‘sh vagonda qoldiq aniqlandi yoki texnik nosozlik...'
                      : defectTarget.kind === 'gross'
                        ? 'Masalan: ortiqcha yuklama yoki netto me’yoridan ortiq...'
                        : 'Masalan: plomba simi uzilgan, tamg‘asi shikastlangan, yangi plombaga almashtirildi...'
                  }
                />
              </label>
              {defectError ? (
                <p className="text-sm font-medium text-rose-600 dark:text-rose-300">{defectError}</p>
              ) : null}
              <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-3.5 dark:border-amber-900/60 dark:bg-amber-950/30">
                <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-200">
                  {defectTarget.kind === 'tare'
                    ? 'Ushbu vagon «Nomuvofiqlik aniqlangan» holatiga o‘tadi va estakadaga yuborilmaydi.'
                    : defectTarget.kind === 'gross'
                      ? 'Ushbu vagon ortiqcha yukni kamaytirish uchun yuklashga qaytariladi.'
                      : 'Ushbu vagon bo‘yicha shikastlangan plomba dalolatnomasi shakllanadi, yangi plomba biriktiriladi va saqlanadi.'}
                </p>
              </div>
            </div>
            <footer className="flex justify-end gap-2.5 border-t border-slate-100 px-6 py-4 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <button
                type="button"
                className="btn-secondary !h-11 !px-5"
                disabled={defectSubmitting}
                onClick={() => setDefectTarget(null)}
              >
                Bekor qilish
              </button>
              <button
                type="submit"
                className="btn-primary !h-11 !px-5 !bg-amber-600 hover:!bg-amber-700 inline-flex items-center gap-2 font-semibold shadow-md shadow-amber-500/20"
                disabled={defectSubmitting}
              >
                <AlertTriangle className="h-4 w-4" strokeWidth={2} />
                {defectSubmitting ? 'Qayd etilmoqda…' : 'Nomuvofiqlikni qayd etish'}
              </button>
            </footer>
          </form>
        </div>
      ) : null}

      {/* Plomba o‘rnatish modal */}
      {installSealTarget && installSealTarget.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <form
            onSubmit={submitInstallSeal}
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in fade-in zoom-in-95 duration-150"
          >
            <header className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  <Tag className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100">Plomba o‘rnatish va biriktirish</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {installSealTarget.length === 1
                      ? `Vagon: ${installSealTarget[0].unit.wagonNumber}`
                      : `${installSealTarget.length} ta tanlangan vagon`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
                onClick={() => setInstallSealTarget(null)}
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="space-y-4 px-6 py-5">
              {installSealTarget.length > 1 && (
                <div className="max-h-24 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="flex flex-wrap gap-1.5">
                    {installSealTarget.map(r => (
                      <span
                        key={r.unit.id}
                        className="inline-flex items-center rounded-md bg-white px-2 py-0.5 font-mono text-xs font-bold text-slate-700 shadow-2xs border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700"
                      >
                        {r.unit.wagonNumber}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Plomba raqami / belgisi <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-400">Tezkor:</span>
                    <button
                      type="button"
                      onClick={() => setInstallSealNumber('SHGKM')}
                      className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 cursor-pointer"
                    >
                      SHGKM
                    </button>
                    <button
                      type="button"
                      onClick={() => setInstallSealNumber('UNG-')}
                      className="rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700 hover:bg-slate-200 border border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 cursor-pointer"
                    >
                      UNG-
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  autoFocus
                  value={installSealNumber}
                  onChange={e => setInstallSealNumber(e.target.value.toUpperCase())}
                  placeholder="Masalan: SHGKM yoki 010-17189"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-base font-bold uppercase text-slate-900 shadow-xs focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="space-y-2.5 pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={installSealEnteredUng}
                    onChange={e => setInstallSealEnteredUng(e.target.checked)}
                    className="size-4 rounded border-slate-300 accent-emerald-600"
                  />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Tarozi UNG dasturiga kiritilganligini tasdiqlash
                  </span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={installSealConfirmNow}
                    onChange={e => setInstallSealConfirmNow(e.target.checked)}
                    className="size-4 rounded border-slate-300 accent-emerald-600"
                  />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Darhol «Plomba o‘rnatildi» holatiga o‘tkazish (tasdiqlash)
                  </span>
                </label>
              </div>

              {installSealError ? (
                <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900">
                  {installSealError}
                </p>
              ) : null}
            </div>

            <footer className="flex justify-end gap-2.5 border-t border-slate-100 px-6 py-4 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <button
                type="button"
                className="btn-secondary !h-10 !px-4"
                disabled={installSealSubmitting}
                onClick={() => setInstallSealTarget(null)}
              >
                Bekor qilish
              </button>
              <button
                type="submit"
                className="btn-primary !h-10 !px-5 !bg-emerald-600 hover:!bg-emerald-700 inline-flex items-center gap-2 font-semibold shadow-md shadow-emerald-600/20 text-white"
                disabled={installSealSubmitting}
              >
                <Check className="h-4 w-4" strokeWidth={2.2} />
                {installSealSubmitting ? 'Saqlanmoqda…' : 'Saqlash va tasdiqlash'}
              </button>
            </footer>
          </form>
        </div>
      )}

      {/* Tasdiqlash dialogi */}
      {confirmTarget && (
        <ConfirmDialog
          open={Boolean(confirmTarget)}
          title={confirmTarget.confirmRole === 'Security' ? 'Plombani tasdiqlash (Qo‘riqlash)' : 'Plomba o‘rnatilganligini tasdiqlash (Tarozibon)'}
          variant="default"
          loading={confirmSubmitting}
          error={confirmError}
          onConfirm={executeConfirmation}
          onCancel={() => setConfirmTarget(null)}
          confirmLabel={confirmTarget.confirmRole === 'Security' ? 'Tasdiqlash' : 'Plomba o‘rnatildi'}
          cancelLabel="Bekor qilish"
          message={
            confirmTarget.kind === 'unit' ? (
              <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                <p>
                  Vagon <strong className="font-mono text-slate-900 dark:text-slate-100">{confirmTarget.row.unit.wagonNumber}</strong> dagi plomba {confirmTarget.confirmRole === 'Security' ? 'Qo‘riqlash xizmati nomidan tekshirilib tasdiqlanadi.' : 'o‘rnatilganligi tasdiqlanadi va Qo‘riqlash ko‘rigiga o‘tkaziladi.'}
                </p>
                {confirmTarget.row.unit.sealNumber ? (
                  <p className="text-xs text-slate-500">
                    Plomba raqami: <strong className="font-mono text-slate-800 dark:text-slate-200">{confirmTarget.row.unit.sealNumber}</strong>
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                <p>
                  Tanlangan <strong>{confirmTarget.rows.length} ta</strong> vagonning barcha plombalari {confirmTarget.confirmRole === 'Security' ? 'Qo‘riqlash xizmati nomidan' : 'Tarozibon tomonidan'} bir vaqtda tasdiqlanadi.
                </p>
              </div>
            )
          }
        />
      )}

      {/* Elektron dalolatnoma ko'rish */}
      {selectedDefectAct && (
        <SealDefectActView
          arrival={selectedDefectAct.arrival}
          unit={selectedDefectAct.unit}
          onClose={() => setSelectedDefectAct(null)}
        />
      )}
    </div>
  );
}
