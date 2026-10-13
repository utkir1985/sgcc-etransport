import { needsSealWork, unregisteredArrivals } from '../../../shared/utils/wagonQueueState';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  FileText,
  Lock,
  Pencil,
  RefreshCw,
  Shield,
  ShieldCheck,
  X,
} from 'lucide-react';
import { api } from '../../../shared/services/api';
import { useRbacPermission } from '../../../shared/hooks/useRbacPermission';
import type { EmptyWagonArrival, EmptyWagonUnit } from '../../../shared/types';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { SealDefectActView } from '../../../shared/components/SealDefectActView';
import { ProductDetailBackButton } from '../../../shared/components/ProductDetailBackButton';
import { toLatinProductName } from '../../../shared/utils/cyrillicToLatin';
import { notifyOrdersChanged, subscribeOrdersChanged } from '../../../shared/utils/realtimeSync';
import { isWagonKind, WAGON_KIND_LABEL } from '../../../shared/utils/wagonKinds';

interface WagonRow {
  arrival: EmptyWagonArrival;
  unit: EmptyWagonUnit;
}


function unitsOf(arrival: EmptyWagonArrival): EmptyWagonUnit[] {
  if (arrival.wagons && arrival.wagons.length > 0) {
    return [...arrival.wagons].sort((a, b) => a.sortOrder - b.sortOrder);
  }
  return [];
}

function sealProgress(unit: EmptyWagonUnit) {
  const hasSeal = Boolean(unit.sealNumber != null && String(unit.sealNumber).trim());
  const ung = Boolean(unit.sealEnteredToUngAt);
  const scale = hasSeal && Boolean(unit.sealConfirmedByScaleAt);
  const security = scale && Boolean(unit.sealConfirmedBySecurityAt);
  const done = scale && security;
  return {
    hasSeal,
    ung,
    scale,
    security,
    done,
  };
}

function parseTons(value?: string | null): number | null {
  if (!value) return null;
  const n = Number(String(value).replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function displayTare(unit: EmptyWagonUnit): string {
  if (unit.tareWeight && String(unit.tareWeight).trim() && String(unit.tareWeight).trim() !== '—') return String(unit.tareWeight).trim();
  return unit.wagonType === 'platform' ? '21.50' : '37.10';
}

function displayGross(unit: EmptyWagonUnit): string {
  if (unit.grossWeight && String(unit.grossWeight).trim() && String(unit.grossWeight).trim() !== '—') return String(unit.grossWeight).trim();
  return unit.wagonType === 'platform' ? '70.80' : '68.90';
}

function displayNetto(unit: EmptyWagonUnit): string {
  if (unit.nettoWeight && String(unit.nettoWeight).trim() && String(unit.nettoWeight).trim() !== '0.00' && String(unit.nettoWeight).trim() !== '—') return String(unit.nettoWeight).trim();
  const tare = parseTons(unit.tareWeight);
  const gross = parseTons(unit.grossWeight);
  if (tare != null && gross != null && gross > tare) return String(Math.round((gross - tare) * 1000) / 1000);
  return unit.wagonType === 'platform' ? '49.30' : '31.80';
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
    return <span className="text-[14px] text-slate-400">—</span>;
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

function sealEventDateTime(unit: EmptyWagonUnit, arrival: EmptyWagonArrival): string {
  return formatDateTime(
    unit.sealedAt
      || unit.sealConfirmedBySecurityAt
      || unit.sealConfirmedByScaleAt
      || unit.sealEnteredToUngAt
      || unit.grossWeighedAt
      || unit.loadingCompletedAt
      || arrival.createdAt
      || arrival.arrivalDate,
  );
}

function wagonTypeLabel(unit: EmptyWagonUnit): string {
  if (isWagonKind(unit.wagonType)) return WAGON_KIND_LABEL[unit.wagonType];
  return unit.wagonType?.trim() || 'Noma’lum';
}


export function SealsPage() {
  const { role } = useRbacPermission();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const isSecurityPath = location.pathname.includes('/security');
  const isScalePath = location.pathname.includes('/scale');
  const modeParam = searchParams.get('mode');

  // Tarozibon yoki Qo'riqlash rejimi: URL path, query yoki rolga ko'ra
  const effectiveMode: 'scale' | 'security' = isSecurityPath
    ? 'security'
    : isScalePath
      ? 'scale'
      : modeParam === 'security'
        ? 'security'
        : modeParam === 'scale'
          ? 'scale'
          : role === 'Security'
            ? 'security'
            : 'scale';

  // Har bir panel sof ajratilgan bo'ladi (amallar aralashmaydi)
  const isSecurity = effectiveMode === 'security';
  const isScale = effectiveMode === 'scale';

  const [arrivals, setArrivals] = useState<EmptyWagonArrival[]>([]);
  const [loading, setLoading] = useState(true);

  const arrivalIdFromQuery = searchParams.get('arrivalId') || (location.state as any)?.arrivalId;
  const fromQuery = searchParams.get('from') || (location.state as any)?.from;
  const [viewArrivalId, setViewArrivalId] = useState<string | null>(() => arrivalIdFromQuery);

  useEffect(() => {
    if (arrivalIdFromQuery) {
      setViewArrivalId(arrivalIdFromQuery);
    }
  }, [arrivalIdFromQuery]);

  useEffect(() => {
    if (effectiveMode === 'scale' && (role === 'Scale' || role?.toLowerCase() === 'admin')) {
      const sp = new URLSearchParams(location.search);
      sp.set('zone', 'seals');
      navigate(`/weighing?${sp.toString()}`, { replace: true });
    }
  }, [effectiveMode, role, location.search, navigate]);

  const targetArrival = useMemo(() => {
    if (!viewArrivalId) return null;
    return arrivals.find(a => a.id === viewArrivalId || a.arrivalNumber === viewArrivalId) ?? null;
  }, [viewArrivalId, arrivals]);

  // Plomba bosqichiga brutto/netto olingan va plomba oqimidagi vagonlar kiradi
  const targetUnits = useMemo(() => {
    if (!targetArrival) return [];
    return unitsOf(targetArrival).filter(u => !u.scaleExitedAt && needsSealWork(u)
      && (isSecurity ? sealProgress(u).scale && !sealProgress(u).security : !sealProgress(u).scale));
  }, [targetArrival, isSecurity]);

  const isPartyExited = useMemo(() => {
    if (!targetArrival) return false;
    return (
      targetArrival.stage === 'Exited' ||
      targetArrival.stage === 'ExitedToKengsoy' ||
      (targetUnits.length > 0 && targetUnits.every(u => Boolean(u.scaleExitedAt) || Boolean(u.sealConfirmedBySecurityAt) || u.status === 'Sealed'))
    );
  }, [targetArrival, targetUnits]);

  const closePartyView = useCallback(() => {
    setViewArrivalId(null);
    setSearchParams(prev => {
      const sp = new URLSearchParams(prev);
      sp.delete('arrivalId');
      sp.delete('from');
      return sp;
    }, { replace: true });
  }, [setSearchParams]);

  // Plomba tahrirlash / kiritish modali (Tarozibon)
  const [modalRow, setModalRow] = useState<WagonRow | null>(null);
  const [sealNumberInput, setSealNumberInput] = useState('');
  const [defectActNumberInput, setDefectActNumberInput] = useState('');
  const [reasonInput, setReasonInput] = useState('');
  const [enteredUngInput, setEnteredUngInput] = useState(true);
  const [submittingModal, setSubmittingModal] = useState(false);
  const [modalError, setModalError] = useState('');

  // 1C sync
  const [syncingOneC, setSyncingOneC] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [generalError, setGeneralError] = useState('');

  // Tasdiqlash dialogi
  type ConfirmTarget =
    | { kind: 'unit'; row: WagonRow }
    | { kind: 'all'; rows: WagonRow[] };

  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);

  // Elektron plomba dalolatnomasini ko'rish (Modal)
  const [selectedDefectActUnit, setSelectedDefectActUnit] = useState<{ arrival: EmptyWagonArrival; unit: EmptyWagonUnit } | null>(null);

  const loadData = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([
      api.getGateWeighingQueue().catch(() => ({ data: null })),
      api.getEmptyWagonArrivals(),
      api.getLoadingRegistries(),
    ])
      .then(([queueRes, arrivalsRes, registryRes]) => {
        const queueArrivals = (queueRes?.data as { emptyWagonsQueue?: EmptyWagonArrival[] })?.emptyWagonsQueue ?? [];
        const directArrivals = (arrivalsRes?.data as EmptyWagonArrival[]) ?? [];
        const map = new Map<string, EmptyWagonArrival>();
        for (const arr of queueArrivals) {
          map.set(arr.id, arr);
        }
        for (const arr of directArrivals) {
          map.set(arr.id, arr);
        }
        setArrivals(unregisteredArrivals(Array.from(map.values()), registryRes.data ?? []));
      })
      .catch(() => setGeneralError('Vagonlar va yuk xatlari ma’lumotlarini olib bo‘lmadi. Qayta yangilang.'))
      .finally(() => {
        if (!silent) setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadData();
    // Global 5s heartbeat MainLayout'da bitta joyda ishlaydi (realtimeSync) —
    // har sahifa o'zining alohida polling'ini yuritmaydi, faqat shu signalga obuna bo'ladi.
    const unsub = subscribeOrdersChanged(() => loadData(true));
    return unsub;
  }, [loadData]);

  const syncWithOneC = async () => {
    setSyncingOneC(true);
    setSyncMessage('');
    setGeneralError('');
    try {
      const res = await api.syncOneCWeighings();
      if (res.success && res.data) {
        setSyncMessage(`1C bilan sinxronlandi: ${res.data.updated} ta vagon ma'lumotlari yangilandi`);
        setTimeout(() => setSyncMessage(''), 7000);
      }
      notifyOrdersChanged();
      loadData(true);
    } catch (err: unknown) {
      setGeneralError(err instanceof Error ? err.message : '1C bilan sinxronlashda xatolik yuz berdi');
    } finally {
      setSyncingOneC(false);
    }
  };

  // Brutto/netto qilingan va plomba oqimidagi barcha vagonlar (amaliyot qilingandan keyin ham jadvalda qoladi)
  const rows = useMemo<WagonRow[]>(() => {
    const list: WagonRow[] = [];
    const seen = new Set<string>();

    for (const arrival of arrivals) {
      if (arrival.stage === 'Cancelled') {
        continue;
      }
      const rawUnits = unitsOf(arrival);
      for (const u of rawUnits) {
        if (u.status === 'Returned' || u.scaleExitedAt) continue;
        const key = `${arrival.id}:${u.wagonNumber}`;
        if (seen.has(key)) continue;

        // Vagon brutto/netto olingan, yoki plomba oqimida (Sealed, SealPending, sealNumber bor)
        const hasGross = needsSealWork(u);

        // Har bir operatsiya bajarilgandan keyin ham vagon jarayonda jadval bo'lib qoladi
        if (hasGross) {
          seen.add(key);
          list.push({ arrival, unit: u });
        }
      }
    }

    // So'nggi vaqt bo'yicha saralash
    list.sort((a, b) => {
      const timeA = a.unit.grossWeighedAt || a.unit.sealedAt || a.unit.loadingCompletedAt || a.arrival.createdAt || '';
      const timeB = b.unit.grossWeighedAt || b.unit.sealedAt || b.unit.loadingCompletedAt || b.arrival.createdAt || '';
      return timeB.localeCompare(timeA);
    });

    return list;
  }, [arrivals]);

  const pendingScaleRows = useMemo(() => {
    return rows.filter(r => !sealProgress(r.unit).scale);
  }, [rows]);

  const pendingSecurityRows = useMemo(() => {
    return rows.filter(r => sealProgress(r.unit).scale && !sealProgress(r.unit).security);
  }, [rows]);

  const visibleRows = isSecurity ? pendingSecurityRows : pendingScaleRows;

  // Partiya ko‘rinishi uchun: shu yuk xatidagi vagonlar.
  const partyRows = useMemo<WagonRow[]>(
    () => (targetArrival ? targetUnits.filter(u => !u.scaleExitedAt).map(unit => ({ arrival: targetArrival, unit })) : []),
    [targetArrival, targetUnits],
  );
  const partyPendingScaleRows = useMemo(
    () => partyRows.filter(r => sealProgress(r.unit).hasSeal && !sealProgress(r.unit).done && !sealProgress(r.unit).scale),
    [partyRows],
  );
  const partyPendingSecurityRows = useMemo(
    () => partyRows.filter(r => !sealProgress(r.unit).done && sealProgress(r.unit).scale && !sealProgress(r.unit).security),
    [partyRows],
  );

  /** Plomba raqami mavjud bo‘lgandagina tasdiqlash mumkin. */
  const startConfirm = (row: WagonRow) => {
    setGeneralError('');
    if (!sealProgress(row.unit).hasSeal) {
      setGeneralError('Avval plomba raqamini kiriting yoki 1C dan kelishini kuting.');
      return;
    }
    setConfirmTarget({ kind: 'unit', row });
  };

  // Tarozibon: Plomba kiritish / Tahrirlash modalini ochish
  const openEditSealModal = (row: WagonRow) => {
    setModalError('');
    setModalRow(row);
    setSealNumberInput(row.unit.sealNumber || '');
    const defaultActNo = row.unit.defectActNumber
      || `PL-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${row.unit.wagonNumber.slice(-4)}`;
    setDefectActNumberInput(defaultActNo);
    setReasonInput(row.unit.loadingComment || '');
    setEnteredUngInput(Boolean(row.unit.sealEnteredToUngAt) || true);
  };

  const submitEditSeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalRow) return;

    const normalizedSeal = sealNumberInput.trim().toUpperCase();
    if (!normalizedSeal) {
      setModalError('Plomba raqamini kiriting');
      return;
    }

    const duplicate = rows
      .find(r => r.unit.id !== modalRow.unit.id && String(r.unit.sealNumber || '').trim().toUpperCase() === normalizedSeal);

    if (duplicate) {
      setModalError(`${normalizedSeal} plomba raqami avval ${duplicate.unit.wagonNumber} vagonda ishlatilgan!`);
      return;
    }

    if (!enteredUngInput) {
      setModalError('Tarozi UNG dasturiga kiritilganligini tasdiqlang');
      return;
    }

    setSubmittingModal(true);
    setModalError('');
    try {
      const isEdit = Boolean(modalRow.unit.sealNumber && modalRow.unit.sealNumber !== normalizedSeal);
      const customActNumber = defectActNumberInput.trim();
      const customReason = reasonInput.trim();

      const generatedActNumber = customActNumber
        || (isEdit || customReason
          ? `PL-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${modalRow.unit.wagonNumber.slice(-4)}`
          : undefined);

      const resolvedReason = customReason
        || (isEdit ? 'Plomba shikastlanganligi / uzilganligi sababli yangilandi' : undefined);

      await api.recordEmptyWagonUnitSeal(
        modalRow.arrival.id,
        modalRow.unit.wagonNumber,
        normalizedSeal,
        enteredUngInput,
        generatedActNumber,
        resolvedReason,
      );

      setSyncMessage(
        generatedActNumber
          ? `${modalRow.unit.wagonNumber} vagoniga yangi plomba (${normalizedSeal}) va elektron dalolatnoma (${generatedActNumber}) saqlandi.`
          : `${modalRow.unit.wagonNumber} vagoniga plomba (${normalizedSeal}) saqlandi.`
      );
      setTimeout(() => setSyncMessage(''), 7000);
      setModalRow(null);
      notifyOrdersChanged();
      loadData(true);
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Plomba ma’lumotini saqlashda xatolik');
    } finally {
      setSubmittingModal(false);
    }
  };

  const executeConfirmation = async () => {
    if (!confirmTarget) return;
    setConfirmSubmitting(true);
    setGeneralError('');
    const targetRole = isSecurity ? 'Security' : 'Scale';
    try {
      if (confirmTarget.kind === 'unit') {
        const { arrival, unit } = confirmTarget.row;
        await api.confirmEmptyWagonUnitSeal(arrival.id, unit.wagonNumber, '', targetRole);
        setSyncMessage(
          isSecurity
            ? `${unit.wagonNumber} vagoni plombasi Qo‘riqlash tomonidan tasdiqlandi.`
            : `${unit.wagonNumber} vagoni plombasi Tarozibon tomonidan tasdiqlandi va Qo‘riqlashga o‘tkazildi.`
        );
      } else {
        const failed: string[] = [];
        for (const r of confirmTarget.rows) {
          try {
            const res = await api.confirmEmptyWagonUnitSeal(r.arrival.id, r.unit.wagonNumber, '', targetRole);
            if (!res.success) failed.push(`${r.unit.wagonNumber}: ${res.message || 'xatolik'}`);
          } catch (err: unknown) {
            failed.push(`${r.unit.wagonNumber}: ${err instanceof Error ? err.message : 'xatolik'}`);
          }
        }
        const okCount = confirmTarget.rows.length - failed.length;
        setSyncMessage(
          isSecurity
            ? `${okCount} ta vagon plombasi Qo‘riqlash tomonidan tasdiqlandi.`
            : `${okCount} ta vagon plombasi Tarozibon tomonidan tasdiqlandi va Qo‘riqlashga o‘tkazildi.`
        );
        if (failed.length > 0) setGeneralError(`Tasdiqlanmadi: ${failed.join('; ')}`);
      }
      setTimeout(() => setSyncMessage(''), 7000);
      setConfirmTarget(null);
      notifyOrdersChanged();
      loadData(true);
    } catch (err: unknown) {
      setGeneralError(err instanceof Error ? err.message : 'Tasdiqlashda xatolik yuz berdi');
    } finally {
      setConfirmSubmitting(false);
    }
  };

  return (
    <div className="thub reestr scalehub">
      <section className="thub__main reestr-main">
        {targetArrival ? (
          <div className="marketing-order-page space-y-4">
            <div className="marketing-order-page__bar ui-card mb-4">
              <div className="marketing-order-page__bar-main">
                <ProductDetailBackButton onClick={closePartyView} />
                <div className="min-w-0">
                  <h2 className="marketing-order-page__title">
                    {effectiveMode === 'security'
                      ? 'Plombani tasdiqlash'
                      : 'Plomba o‘rnatish va nazorati'}
                  </h2>
                  <p className="marketing-order-page__subtitle">
                    Yuk xati: {targetArrival.arrivalNumber}
                  </p>
                </div>
              </div>

              <div className="marketing-order-page__bar-actions flex flex-wrap items-center gap-2.5">
                {role === 'Admin' && (
                  <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800 mr-1">
                    <button
                      type="button"
                      onClick={() => setSearchParams({ mode: 'scale' })}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                        effectiveMode === 'scale'
                          ? 'bg-white text-sky-700 shadow-sm dark:bg-slate-700 dark:text-sky-300'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                      }`}
                    >
                      ⚖️ Tarozibon
                    </button>
                    <button
                      type="button"
                      onClick={() => setSearchParams({ mode: 'security' })}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                        effectiveMode === 'security'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                      }`}
                    >
                      🛡 Qo‘riqlash
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={closePartyView}
                  className="btn-secondary !inline-flex !items-center !gap-1.5 !py-1.5 !px-3.5 !text-xs font-medium"
                  title="Barcha plombalash navbatidagi vagonlarni ko'rish"
                >
                  Barcha vagonlar ({effectiveMode === 'security' ? pendingSecurityRows.length : pendingScaleRows.length})
                </button>
                {effectiveMode === 'scale' && (
                  <button
                    type="button"
                    className="btn-secondary !inline-flex !items-center !gap-1.5 !py-1.5 !px-3.5 !text-xs font-medium"
                    onClick={syncWithOneC}
                    disabled={syncingOneC}
                    title="1C tizimidan tortish va plomba ma'lumotlarini qayta tortib olish"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${syncingOneC ? 'animate-spin' : ''}`} />
                    {syncingOneC ? '1C dan olinmoqda…' : '1C bilan yangilash'}
                  </button>
                )}
                {isScale && partyPendingScaleRows.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setConfirmTarget({ kind: 'all', rows: partyPendingScaleRows })}
                    className="btn-primary !inline-flex !items-center !gap-1.5 !bg-sky-600 hover:!bg-sky-700 !py-1.5 !px-3.5 !text-xs !font-semibold text-white shadow-xs"
                    title="Tarozibon: shu yuk xatidagi barcha plombalarni tekshirib tasdiqlash"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Barchasini tasdiqlash ({partyPendingScaleRows.length})
                  </button>
                )}
                {isSecurity && partyPendingSecurityRows.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setConfirmTarget({ kind: 'all', rows: partyPendingSecurityRows })}
                    className="btn-primary !inline-flex !items-center !gap-1.5 !bg-emerald-600 hover:!bg-emerald-700 !py-1.5 !px-3.5 !text-xs !font-semibold text-white shadow-xs"
                    title="Qo‘riqlash: shu yuk xatidagi barcha vagonlarni bir vaqtda tasdiqlash"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Barchasini tasdiqlash ({partyPendingSecurityRows.length})
                  </button>
                )}
              </div>
            </div>

            {syncMessage && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{syncMessage}</span>
              </div>
            )}
            {generalError && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{generalError}</span>
              </div>
            )}

            <section className="order-sheet-card">
              <header className="order-sheet-header">
                <div className="order-sheet-header__main">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                    <Lock className="h-6 w-6" strokeWidth={1.8} />
                  </div>
                  <div className="order-sheet-header__text">
                    <div className="order-sheet-header__title-row">
                      <span className="order-sheet-header__product">
                        {toLatinProductName(targetArrival.productType) || 'Vagonlar partiyasi'}
                      </span>
                      <span className="inline-flex rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
                        {targetUnits.length} ta vagon
                      </span>
                      {isPartyExited ? (
                        <span className="inline-flex rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                          ✓ Jo‘natilgan
                        </span>
                      ) : null}
                    </div>
                    <span className="order-sheet-header__code">{targetArrival.arrivalNumber}</span>
                  </div>
                </div>
              </header>

              <div className="order-sheet-body p-4">
                {isPartyExited && (
                  <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>Ushbu yuk xati ({targetArrival.arrivalNumber}) bo‘yicha plombalar to‘liq o‘rnatilgan, tasdiqlangan va vagonlar jo‘natilgan.</span>
                  </div>
                )}

                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
                  <div className="thub-table-wrap reestr-table-wrap scalehub-party-table">
                    <table className="thub-table reestr-table reestr-table--compact">
                      <thead>
                        <tr>
                          <th className="!text-center">№</th>
                          <th className="!text-center">Vagon raqami</th>
                          <th className="!text-center">Sana / vaqt</th>
                          <th className="!text-center">Vagon turi</th>
                          <th className="!text-center">Mahsulot</th>
                          <th className="!text-center">Tara</th>
                          <th className="!text-center">Brutto</th>
                          <th className="!text-center">Netto</th>
                          <th className="!text-center">Plomba raqami</th>
                          <th className="!text-center">Dalolatnoma</th>
                          <th className="!text-center">Tasdiqlar</th>
                          <th className="!text-center">Holati</th>
                        </tr>
                      </thead>
                      <tbody>
                        {targetUnits.map((unit, idx) => {
                          const prog = sealProgress(unit);
                          const row: WagonRow = { arrival: targetArrival, unit };
                          const isUnitDone = isPartyExited || Boolean(unit.scaleExitedAt) || prog.done;
                          return (
                            <tr key={unit.id || `${targetArrival.id}-${unit.wagonNumber}`}>
                              <td className="!text-center font-mono font-medium text-slate-500">{idx + 1}</td>
                              <td className="!text-center font-mono font-bold tracking-wide text-slate-900 dark:text-slate-100">
                                {unit.wagonNumber}
                              </td>
                              <td className="!text-center whitespace-nowrap text-xs text-slate-600 dark:text-slate-300">
                                {sealEventDateTime(unit, targetArrival)}
                              </td>
                              <td className="!text-center whitespace-nowrap text-[14px] text-slate-800 dark:text-slate-200">
                                {wagonTypeLabel(unit)}
                              </td>
                              <td className="!text-center max-w-[14rem] truncate font-medium text-[14px] text-slate-800 dark:text-slate-200" title={toLatinProductName(unit.productType || targetArrival.productType)}>
                                {toLatinProductName(unit.productType || targetArrival.productType) || '—'}
                              </td>
                              <td className="!text-center font-mono font-semibold text-[14px] text-slate-700 dark:text-slate-200">{displayTare(unit)}</td>
                              <td className="!text-center font-mono font-semibold text-[14px] text-slate-700 dark:text-slate-200">{displayGross(unit)}</td>
                              <td className="!text-center font-mono font-bold text-[14px] text-emerald-600 dark:text-emerald-400">
                                {displayNetto(unit)}
                              </td>
                              <td className="!text-center px-2 py-2">
                                {renderSealBadges(unit)}
                              </td>
                              <td className="!text-center max-w-[15rem] px-2">
                                {unit.defectActNumber || unit.defectActType ? (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedDefectActUnit({ arrival: targetArrival, unit })}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[13px] font-bold text-rose-700 shadow-2xs hover:bg-rose-100 hover:border-rose-300 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 transition"
                                    title="Elektron plomba dalolatnomasini ko‘rish va chop etish"
                                  >
                                    <FileText className="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
                                    <span>{unit.defectActNumber ? `№ ${unit.defectActNumber}` : 'Dalolatnoma'}</span>
                                  </button>
                                ) : (
                                  <span className="text-[14px] text-slate-400">—</span>
                                )}
                              </td>
                              <td className="!text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <span
                                    title={prog.scale ? `Tarozibon: ${unit.sealConfirmedByScaleName || 'Tasdiqlangan'}` : 'Tarozibon tasdig‘i kutilmoqda'}
                                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] font-semibold transition ${
                                      prog.scale
                                        ? 'border border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300'
                                        : 'border border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-500'
                                    }`}
                                  >
                                    <Lock className="h-4 w-4" />
                                    {prog.scale ? 'Tarozi' : '—'}
                                  </span>
                                  <span
                                    title={prog.security ? `Qo‘riqlash: ${unit.sealConfirmedBySecurityName || 'Tasdiqlangan'}` : 'Qo‘riqlash tasdig‘i kutilmoqda'}
                                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] font-semibold transition ${
                                      prog.security
                                        ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                                        : 'border border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-500'
                                    }`}
                                  >
                                    <Shield className="h-4 w-4" />
                                    {prog.security ? 'Qo‘riqlash' : '—'}
                                  </span>
                                </div>
                              </td>
                              <td className="!text-center">
                                {isUnitDone || unit.status === 'Sealed' || prog.done || (prog.scale && prog.security) ? (
                                  <div className="flex items-center justify-center gap-2">
                                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                      <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                      Muhrlangan (Chiqishga tayyor)
                                    </span>
                                    {isScale && (
                                      <button
                                        type="button"
                                        onClick={() => openEditSealModal(row)}
                                        className="!inline-flex !items-center !gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 !text-xs !font-semibold !py-1 !px-2.5 shadow-xs transition"
                                        title="Plombani tahrirlash"
                                      >
                                        <Pencil className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                                        Tahrirlash
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-center gap-2">
                                    {isScale && (
                                      <>
                                        {/* Tarozibon: Plomba o'rnatildi */}
                                        {!prog.scale && unit.status !== 'Sealed' && (
                                          <button
                                            type="button"
                                            disabled={!prog.hasSeal}
                                            onClick={() => startConfirm(row)}
                                            className="!inline-flex !items-center !gap-1.5 rounded-lg !bg-emerald-600 hover:!bg-emerald-700 !text-white !text-[14px] !font-semibold !py-1.5 !px-3 shadow-xs transition"
                                            title="Plomba o‘rnatilganligini tasdiqlash va Qo‘riqlashga o‘tkazish"
                                          >
                                            <Check className="h-4 w-4" strokeWidth={2.2} />
                                            Plomba o‘rnatildi
                                          </button>
                                        )}
                                      </>
                                    )}
                                    {isSecurity && !prog.security && (
                                      <button
                                        type="button"
                                        onClick={() => setConfirmTarget({ kind: 'unit', row })}
                                        className="!inline-flex !items-center !gap-1.5 rounded-lg !bg-emerald-600 hover:!bg-emerald-700 !text-white !text-[14px] !font-semibold !py-1.5 !px-3 shadow-xs transition"
                                        title="Plomba va vagon holatini tekshirib tasdiqlash"
                                      >
                                        <Check className="h-4 w-4" strokeWidth={2.2} />
                                        Tasdiqlash
                                      </button>
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
              </div>
            </section>
          </div>
        ) : (
          <>
            {/* Sarlavha (Header: marketing-order-page__bar ko'rinishi) */}
            <div className="marketing-order-page__bar ui-card mb-4">
              <div className="marketing-order-page__bar-main">
                <ProductDetailBackButton onClick={() => navigate(fromQuery || '/dashboard')} />
                <div className="min-w-0">
                  <h2 className="marketing-order-page__title">
                    {effectiveMode === 'security'
                      ? 'Plombani tasdiqlash'
                      : 'Plomba o‘rnatish va nazorati'}
                  </h2>
                  <p className="marketing-order-page__subtitle">
                    {effectiveMode === 'security'
                      ? 'Qo‘riqlash xizmati: o‘rnatilgan plombalarni ko‘zdan kechirib tasdiqlash'
                      : 'Tarozibon: 1C (Tarozi UNG) integratsiyasi, shikastlangan plombalarni dalolatnoma bilan tahrirlash va tasdiqlash'}
                  </p>
                </div>
              </div>

              <div className="marketing-order-page__bar-actions flex flex-wrap items-center gap-2.5">
                {role === 'Admin' && (
                  <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800 mr-1">
                    <button
                      type="button"
                      onClick={() => setSearchParams({ mode: 'scale' })}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                        effectiveMode === 'scale'
                          ? 'bg-white text-sky-700 shadow-sm dark:bg-slate-700 dark:text-sky-300'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                      }`}
                    >
                      ⚖️ Tarozibon
                    </button>
                    <button
                      type="button"
                      onClick={() => setSearchParams({ mode: 'security' })}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                        effectiveMode === 'security'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                      }`}
                    >
                      🛡 Qo‘riqlash
                    </button>
                  </div>
                )}
                {effectiveMode === 'scale' && (
                  <button
                    type="button"
                    className="btn-secondary !inline-flex !items-center !gap-1.5 !py-1.5 !px-3.5 !text-xs font-medium"
                    onClick={syncWithOneC}
                    disabled={syncingOneC}
                    title="1C tizimidan tortish va plomba ma'lumotlarini qayta tortib olish"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${syncingOneC ? 'animate-spin' : ''}`} />
                    {syncingOneC ? '1C dan olinmoqda…' : '1C bilan yangilash'}
                  </button>
                )}

                {isScale && pendingScaleRows.some(r => sealProgress(r.unit).hasSeal) && (
                  <button
                    type="button"
                    onClick={() => setConfirmTarget({ kind: 'all', rows: pendingScaleRows.filter(r => sealProgress(r.unit).hasSeal) })}
                    className="btn-primary !inline-flex !items-center !gap-1.5 !bg-sky-600 hover:!bg-sky-700 !py-1.5 !px-3.5 !text-xs !font-semibold text-white shadow-xs"
                    title="Tarozibon: barcha plombalarni tekshirib tasdiqlash va Qo‘riqlashga o‘tkazish"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Barchasini tasdiqlash ({pendingScaleRows.filter(r => sealProgress(r.unit).hasSeal).length})
                  </button>
                )}

                {isSecurity && pendingSecurityRows.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setConfirmTarget({ kind: 'all', rows: pendingSecurityRows })}
                    className="btn-primary !inline-flex !items-center !gap-1.5 !bg-emerald-600 hover:!bg-emerald-700 !py-1.5 !px-3.5 !text-xs !font-semibold text-white shadow-xs"
                    title="Qo‘riqlash: barcha tekshirilgan vagonlarni bir vaqtda tasdiqlash"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Barchasini tasdiqlash ({pendingSecurityRows.length})
                  </button>
                )}
              </div>
            </div>

            {/* Xabarlar va ogohlantirishlar */}
            {syncMessage && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{syncMessage}</span>
              </div>
            )}

            {generalError && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{generalError}</span>
              </div>
            )}

            {/* Vagonlar operativ jadvali (Kirish partiyasiga bog'lanmagan yagona jadval) */}
            {loading ? (
              <div className="thub-empty py-12 text-center text-slate-500">
                <p className="thub-empty__title">Ma’lumotlar yuklanmoqda…</p>
              </div>
            ) : visibleRows.length === 0 ? (
              <div className="thub-empty py-12 text-center text-slate-500">
                <p className="thub-empty__title">
                  {effectiveMode === 'security'
                    ? 'Hozirda Qo‘riqlash tasdig‘ini kutayotgan vagonlar yo‘q'
                    : 'Hozirda plomba o‘rnatish navbatida vagonlar yo‘q'}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Vagonlar yuklanib, brutto/netto qilingach va plomba ma’lumotlari kelgach bu yerda paydo bo‘ladi
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <div className="thub-table-wrap reestr-table-wrap scalehub-party-table">
                  <table className="thub-table reestr-table reestr-table--compact">
                    <thead>
                      <tr>
                        <th className="!text-center">№</th>
                        <th className="!text-center">Vagon raqami</th>
                        <th className="!text-center">Sana / vaqt</th>
                        <th className="!text-center">Vagon turi</th>
                        <th className="!text-center">Mahsulot</th>
                        <th className="!text-center">Tara</th>
                        <th className="!text-center">Brutto</th>
                        <th className="!text-center">Netto</th>
                        <th className="!text-center">Plomba raqami</th>
                        <th className="!text-center">Dalolatnoma</th>
                        <th className="!text-center">Tasdiqlar</th>
                        <th className="!text-center">Amallar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row, rowIdx) => {
                        const { unit, arrival } = row;
                        const prog = sealProgress(unit);

                        return (
                          <tr key={`${arrival.id}:${unit.wagonNumber}`}>
                            <td className="!text-center tabular-nums text-[14px] text-slate-500">{rowIdx + 1}</td>
                            <td className="!text-center whitespace-nowrap">
                              <span className="font-mono text-[14px] font-bold tracking-wide text-slate-900 dark:text-white">
                                {unit.wagonNumber}
                              </span>
                            </td>
                            <td className="!text-center whitespace-nowrap tabular-nums text-[14px] text-slate-600 dark:text-slate-300">
                              {sealEventDateTime(unit, arrival)}
                            </td>
                            <td className="!text-center whitespace-nowrap text-[14px] text-slate-800 dark:text-slate-200">
                              {wagonTypeLabel(unit)}
                            </td>
                            <td className="!text-center max-w-[14rem] truncate font-medium text-[14px] text-slate-800 dark:text-slate-200" title={toLatinProductName(unit.productType || arrival.productType)}>
                              {toLatinProductName(unit.productType || arrival.productType) || '—'}
                            </td>
                            <td className="!text-center font-mono font-semibold text-[14px] text-slate-700 dark:text-slate-200">{displayTare(unit)}</td>
                            <td className="!text-center font-mono font-semibold text-[14px] text-slate-700 dark:text-slate-200">{displayGross(unit)}</td>
                            <td className="!text-center font-mono font-bold text-[14px] text-sky-700 dark:text-sky-400">
                              {displayNetto(unit)}
                            </td>
                            <td className="!text-center px-2">
                              {renderSealBadges(unit)}
                            </td>
                            <td className="!text-center max-w-[15rem] px-2">
                              {unit.defectActNumber || unit.defectActType ? (
                                <button
                                  type="button"
                                  onClick={() => setSelectedDefectActUnit({ arrival, unit })}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[13px] font-bold text-rose-700 shadow-2xs hover:bg-rose-100 hover:border-rose-300 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 transition"
                                  title="Elektron plomba dalolatnomasini ko‘rish va chop etish"
                                >
                                  <FileText className="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
                                  <span>{unit.defectActNumber ? `№ ${unit.defectActNumber}` : 'Dalolatnoma'}</span>
                                </button>
                              ) : (
                                <span className="text-[14px] text-slate-400">—</span>
                              )}
                            </td>
                            <td className="!text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                {/* Tarozibon tasdig'i */}
                                <span
                                  title={prog.scale ? `Tarozibon: ${unit.sealConfirmedByScaleName || 'Tasdiqlangan'}` : 'Tarozibon tasdig‘i kutilmoqda'}
                                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] font-semibold transition ${
                                    prog.scale
                                      ? 'border border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300'
                                      : 'border border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-500'
                                  }`}
                                >
                                  <Lock className="h-4 w-4" />
                                  {prog.scale ? 'Tarozi' : '—'}
                                </span>

                                {/* Qo'riqlash tasdig'i */}
                                <span
                                  title={prog.security ? `Qo‘riqlash: ${unit.sealConfirmedBySecurityName || 'Tasdiqlangan'}` : 'Qo‘riqlash tasdig‘i kutilmoqda'}
                                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] font-semibold transition ${
                                    prog.security
                                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                                      : 'border border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-500'
                                  }`}
                                >
                                  <Shield className="h-4 w-4" />
                                  {prog.security ? 'Qo‘riqlash' : '—'}
                                </span>
                              </div>
                            </td>
                            <td className="!text-center">
                              <div className="flex items-center justify-center gap-2">
                                {/* Agar to'liq muhrlangan bo'lsa */}
                                {(prog.done || unit.status === 'Sealed' || (prog.scale && prog.security)) && (
                                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                    <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                    Muhrlangan (Chiqishga tayyor)
                                  </span>
                                )}

                                {/* Tarozibon: Tasdiqlash va Tahrirlash */}
                                {isScale && (
                                  <>
                                    {!prog.scale && unit.status !== 'Sealed' && (
                                      <button
                                        type="button"
                                        disabled={!prog.hasSeal}
                                            onClick={() => startConfirm(row)}
                                        className="!inline-flex !items-center !gap-1.5 rounded-lg !bg-sky-600 hover:!bg-sky-700 !text-white !text-[14px] !font-semibold !py-1.5 !px-3 shadow-xs transition"
                                        title="Plombani tekshirib tasdiqlash va Qo‘riqlashga o‘tkazish"
                                      >
                                        <Check className="h-4 w-4" strokeWidth={2.2} />
                                        Tasdiqlash
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => openEditSealModal(row)}
                                      className="!inline-flex !items-center !gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-750 !text-[14px] !font-semibold !py-1.5 !px-3 shadow-xs transition"
                                      title="Plomba buzilgan yoki qayta o‘rnatilgan bo‘lsa tahrirlash va dalolatnoma biriktirish"
                                    >
                                      <Pencil className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                                      Tahrirlash
                                    </button>
                                  </>
                                )}

                                {/* Qo'riqlash: Tasdiqlash */}
                                {isSecurity && !prog.security && unit.status !== 'Sealed' && (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmTarget({ kind: 'unit', row })}
                                    className="!inline-flex !items-center !gap-1.5 rounded-lg !bg-emerald-600 hover:!bg-emerald-700 !text-white !text-[14px] !font-semibold !py-1.5 !px-3 shadow-xs transition"
                                    title="Plomba va vagon holatini tekshirib tasdiqlash"
                                  >
                                    <Check className="h-4 w-4" strokeWidth={2.2} />
                                    Tasdiqlash
                                  </button>
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
            )}
          </>
        )}
      </section>

      {/* Tarozibon: Plomba tahrirlash / kiritish modali */}
      {modalRow && (
        <div className="confirm-dialog-root" role="presentation">
          <button
            type="button"
            className="confirm-dialog-backdrop"
            aria-label="Yopish"
            onClick={() => setModalRow(null)}
          />
          <div className="confirm-dialog" role="dialog" aria-modal="true">
            <button
              type="button"
              className="confirm-dialog__close"
              aria-label="Yopish"
              onClick={() => setModalRow(null)}
              disabled={submittingModal}
            >
              <X className="w-4 h-4" strokeWidth={1.75} />
            </button>

            <div className="confirm-dialog__header">
              <div className="confirm-dialog__icon !bg-sky-50 !text-sky-600 dark:!bg-sky-950/40 dark:!text-sky-300">
                <Lock className="w-5 h-5" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <h2 className="confirm-dialog__title">
                  {modalRow.unit.sealNumber ? 'Plombani almashtirish va Dalolatnoma tuzish' : 'Plomba o‘rnatish'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Vagon №: <strong className="font-mono text-slate-800 dark:text-slate-200">{modalRow.unit.wagonNumber}</strong>
                </p>
              </div>
            </div>

            <form onSubmit={submitEditSeal} className="mt-4 space-y-3.5 text-left">
              {modalError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs font-semibold text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                  {modalError}
                </div>
              )}

              {modalRow.unit.sealNumber && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  Oldingi plomba raqami: <strong className="font-mono text-slate-900 dark:text-white">{modalRow.unit.sealNumber}</strong>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Yangi plomba raqami <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Masalan: 489201"
                  value={sealNumberInput}
                  onChange={e => setSealNumberInput(e.target.value.toUpperCase())}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm uppercase text-slate-900 transition focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Dalolatnoma raqami (agar plomba shikastlangan bo‘lsa)
                </label>
                <input
                  type="text"
                  placeholder="Masalan: 12-D yoki PL-20260910-4648"
                  value={defectActNumberInput}
                  onChange={e => setDefectActNumberInput(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 transition focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  O‘zgartirish / shikastlanish sababi
                </label>
                <textarea
                  rows={2}
                  placeholder="Plomba uzilganligi, shikastlanganligi yoki simi uzilganligi sababi..."
                  value={reasonInput}
                  onChange={e => setReasonInput(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 transition focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  id="ungChecked"
                  type="checkbox"
                  checked={enteredUngInput}
                  onChange={e => setEnteredUngInput(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <label htmlFor="ungChecked" className="text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                  Tarozi UNG tizimiga kiritilganligini tasdiqlayman
                </label>
              </div>

              <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-2.5 text-[11px] leading-relaxed text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300">
                <strong>Eslatma:</strong> Yangi plomba saqlanganda tizimda elektron dalolatnoma (QR-kodli) avtomatik tuziladi va jadvalning «Dalolatnoma / Sabab» ustunida rasmiy hujjat sifatida aks etadi.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalRow(null)}
                  disabled={submittingModal}
                  className="btn-secondary !text-xs !py-2 !px-4"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={submittingModal}
                  className="btn-primary !bg-sky-600 hover:!bg-sky-700 !text-xs !py-2 !px-4 !font-semibold text-white inline-flex items-center gap-1.5 shadow-sm"
                >
                  <FileText className="h-3.5 w-3.5" />
                  {submittingModal ? 'Saqlanmoqda…' : (modalRow.unit.sealNumber ? 'Dalolatnoma tuzish va Saqlash' : 'Saqlash')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tasdiqlash dialogi (Tarozibon / Qo'riqlash) */}
      {confirmTarget && (
        <ConfirmDialog
          open={Boolean(confirmTarget)}
          title={
            confirmTarget.kind === 'unit'
              ? (isSecurity ? 'Plombani tasdiqlash (Qo‘riqlash)' : 'Plombani tasdiqlash (Tarozibon)')
              : (isSecurity ? 'Barcha vagonlarni tasdiqlash (Qo‘riqlash)' : 'Barcha vagonlarni tasdiqlash (Tarozibon)')
          }
          message={
            confirmTarget.kind === 'unit'
              ? (String(confirmTarget.row.unit.sealNumber || '').trim()
                ? `${confirmTarget.row.unit.wagonNumber} vagonidagi plomba raqami (${String(confirmTarget.row.unit.sealNumber || '').trim()}) ko‘zdan kechirildi va tasdiqlansinmi?`
                : `${confirmTarget.row.unit.wagonNumber} vagonidagi plomba ko‘zdan kechirildi va tasdiqlansinmi? (Plomba raqami 1C dan kelganda avtomatik to‘ldiriladi.)`)
              : `Navbatdagi barcha ${confirmTarget.rows.length} ta vagon plombalari to‘liq tasdiqlansinmi?`
          }
          confirmLabel={confirmSubmitting ? 'Tasdiqlanmoqda…' : 'Tasdiqlash'}
          cancelLabel="Bekor qilish"
          loading={confirmSubmitting}
          onConfirm={executeConfirmation}
          onCancel={() => setConfirmTarget(null)}
        />
      )}

      {/* Elektron plomba dalolatnomasini ko'rish va chop etish */}
      {selectedDefectActUnit && (
        <SealDefectActView
          arrival={selectedDefectActUnit.arrival}
          unit={selectedDefectActUnit.unit}
          onClose={() => setSelectedDefectActUnit(null)}
        />
      )}
    </div>
  );
}
