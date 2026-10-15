import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  BadgeCheck,
  Calendar,
  Check,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  ClipboardPen,
  FilePen,
  FilePlus,
  FileText,
  Forklift,
  Handshake,
  History,
  Lock,
  LogIn,
  LogOut,
  RefreshCw,
  Scale,
  Send,
  ShieldCheck,
  TrainFront,
  type LucideIcon,
} from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../shared/contexts/AuthContext';
import { api } from '../../../shared/services/api';
import type {
  EmptyWagonArrival,
  EmptyWagonUnit,
  LoadingRegistry,
  MonthlyOrder,
} from '../../../shared/types';
import { LOGISTICS_TYPES } from '../../../shared/constants/logisticsTypes';
import { subscribeOrdersChanged, startAutoRefresh } from '../../../shared/utils/realtimeSync';
import {
  computeDashboardOverview,
  formatDashboardTon,
  type DashboardOverview,
} from '../../../shared/utils/dashboardOverview';
import {
  buildWagonFlowMetrics,
  isPartyEntryFinished,
} from '../../../shared/utils/wagonFlowTiles';
import { computeTransportFlowMetrics } from '../utils/transportHub';
import { localDateKey, wagonCountOf, loadedWagonCountOf, registryWagonCountOf } from '../utils/sharedPanels';
import { usesSequentialWorkflow, isRegistryReturned, registryRejectionSummary } from '../../../shared/utils/registryWorkflow';
import { formatOrderPeriod } from '../../../shared/utils/dates';
import { excludeOneCArrivals, excludeOneCOrders } from '../../../shared/utils/oneCSources';
import { HubZoneTabs } from '../../../shared/components/HubZoneTabs';
import type { HubZoneTone } from '../../../shared/components/HubZoneTabs';
import { ROLE_MENUS } from '../../admin/rbacCatalog';
import { FlowOwnerSequence } from '../../../shared/components/FlowOwnerSequence';
import { computeOrderFulfillment } from '../../../shared/components/OrderFulfillmentStatus';
import { isReadyForWaybill } from '../../../shared/utils/wagonQueueState';

type ProcessSegment = 'orders' | 'wagons';

interface StepTile {
  key: string;
  title: string;
  owner: string;
  /** Bir nechta ishtirokchi ketma-ketligi (1 → 2 → …) */
  ownerSequence?: string[];
  /** ownerSequence dagi har bir bosqich bajarilganmi */
  ownerSequenceDone?: boolean[];
  /** Joriy foydalanuvchining ichki zanjirdagi indeksi */
  ownerSequenceRoleIndex?: number;
  /** Navbati kelgan ichki bosqich indeksi */
  ownerSequenceActiveIndex?: number;
  desc: string;
  to: string;
  icon: LucideIcon;
  count: number;
  mine: boolean;
  /** Rol shu panelni ochishi mumkinmi */
  canOpen: boolean;
  /** Bosqich tasdiqlangan vaqt (ISO) */
  approvedAt?: string | null;
  /** Actual event time for display; null means the timestamp was not recorded. */
  actualApprovedAt?: string | null;
  /** Qaytarish / e’tibor signali */
  alert?: {
    tone: 'danger';
    label: string;
    detail?: string;
  } | null;
  /** Maxsus belgilangan bosqich raqami (masalan, 1, 2...) */
  stepNumber?: number;
  /** Hisoblagichdan (jami qadamlar sonidan) chiqarib tashlash */
  skipCount?: boolean;
}

function maxIso(...vals: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  let bestMs = -1;
  for (const v of vals) {
    if (!v) continue;
    const ms = Date.parse(v);
    if (!Number.isNaN(ms) && ms >= bestMs) {
      bestMs = ms;
      best = v;
    }
  }
  return best;
}

function formatApprovedAt(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** path → menu keys that grant access */
const PATH_MENU_KEYS: Record<string, string[]> = {
  '/railway-intake': ['railway-intake'],
  '/empty-wagons': ['empty-wagons'],
  '/weighing': ['weighing', 'seals'],
  '/loading': ['loading'],
  '/seals': ['seals'],
  '/seals/scale': ['seals', 'weighing'],
  '/seals/security': ['seals'],
  '/registry': ['registry'],
  '/registry/create': ['registry-create'],
  '/registry/approve': ['registry-approve'],
  '/registry/agree': ['registry', 'registry-agree-security', 'registry-agree-permit'],
  '/registry/agree/permit': ['registry-agree-permit'],
  '/registry/agree/security': ['registry-agree-security'],
  '/orders': ['orders'],
  '/transport': ['transport'],
  '/history': ['history'],
  '/order-approvals': ['order-approvals'],
  '/order-deputy-approvals': ['order-deputy-approvals'],
  '/order-dispatch-approvals': ['order-dispatch-approvals'],
  '/plans': ['plans', 'plans-accounting'],
  '/shipments': ['shipments'],
};

function roleMenuKeys(role: string): Set<string> {
  if (role.toLowerCase() === 'admin' || role === 'Admin') {
    return new Set(Object.keys(PATH_MENU_KEYS).flatMap(p => PATH_MENU_KEYS[p]));
  }
  return new Set(ROLE_MENUS[role] ?? []);
}

function canOpenPath(role: string, path: string): boolean {
  if (role.toLowerCase() === 'admin' || role === 'Admin') return true;
  const base = path.split('?')[0];
  if (base.startsWith('/seals')) {
    return roleMenuKeys(role).has('seals');
  }
  const keys = PATH_MENU_KEYS[base]
    ?? (base.startsWith('/transport') ? ['transport'] : undefined)
    ?? (base.startsWith('/orders') ? ['orders'] : undefined);
  if (!keys) return false;
  const menus = roleMenuKeys(role);
  if (keys.some(k => menus.has(k))) return true;
  if (base === '/registry/create' && menus.has('registry')) return true;
  if (base === '/registry/approve' && menus.has('registry')) return true;
  return false;
}

function roleSeesSegment(role: string, segment: ProcessSegment): boolean {
  if (role.toLowerCase() === 'admin' || role === 'Admin') return true;
  const menus = roleMenuKeys(role);
  if (segment === 'wagons') {
    return ['empty-wagons', 'railway-intake', 'weighing', 'loading', 'seals', 'registry'].some(k => menus.has(k));
  }
  return [
    'orders',
    'order-approvals',
    'order-deputy-approvals',
    'order-dispatch-approvals',
    'shipments',
  ].some(k => menus.has(k));
}

/** Temir yo‘l ishi 3 ta yo‘nalish — zanjirdagi mos bosqichdan ochiladi. */
type RailwayWorkQuery = 'toSecurity' | 'toEstakada' | 'toKengsoy' | 'gateCheck';

function emptyWagonsHref(opts?: {
  work?: RailwayWorkQuery;
  registryId?: string;
  arrivalId?: string;
  party?: string;
}): string {
  const sp = new URLSearchParams();
  if (opts?.work) sp.set('work', opts.work);
  if (opts?.registryId) sp.set('registryId', opts.registryId);
  if (opts?.arrivalId) sp.set('arrivalId', opts.arrivalId);
  if (opts?.party) sp.set('party', opts.party);
  const q = sp.toString();
  return q ? `/empty-wagons?${q}` : '/empty-wagons';
}

function weighingHref(zone: 'tare' | 'gross' | 'seals', arrivalId?: string): string {
  const sp = new URLSearchParams({ zone });
  if (arrivalId) sp.set('arrivalId', arrivalId);
  return `/weighing?${sp.toString()}`;
}

function withFromDashboard(
  url: string,
  stage?: { key: string; state: 'done' | 'current' | 'ahead'; at?: string | null },
  from = '/dashboard',
): string {
  if (!url) return url;
  const [base, query] = url.split('?');
  const sp = new URLSearchParams(query || '');
  if (!sp.has('from')) {
    sp.set('from', from);
  }
  // Target pages show a "completed" note for a finished step instead of the live action.
  if (stage) {
    sp.set('stage', stage.key);
    sp.set('stageState', stage.state);
    if (stage.state === 'done' && stage.at) sp.set('stageAt', stage.at);
  }
  return `${base}?${sp.toString()}`;
}

function resolveOwner(owner: string | string[]): Pick<StepTile, 'owner' | 'ownerSequence'> {
  if (Array.isArray(owner)) {
    return {
      owner: owner.join(' · '),
      ownerSequence: owner,
    };
  }
  return { owner, ownerSequence: undefined };
}

function makeTile(
  role: string,
  key: string,
  title: string,
  owner: string | string[],
  desc: string,
  to: string,
  icon: LucideIcon,
  count: number,
  roles: string[],
  approvedAt?: string | null,
  alert?: StepTile['alert'],
  ownerSequenceDone?: boolean[],
): StepTile {
  const isAdmin = role.toLowerCase() === 'admin' || role === 'Admin';
  const mine = roles.some(r => r.toLowerCase() === role.toLowerCase());
  const { owner: ownerLabel, ownerSequence } = resolveOwner(owner);
  const seqDone = ownerSequence && ownerSequenceDone?.length === ownerSequence.length
    ? ownerSequenceDone
    : undefined;
  const ownerSequenceActiveIndex = ownerSequence
    ? (seqDone ? seqDone.findIndex(done => !done) : 0)
    : undefined;
  const ownerSequenceRoleIndex = ownerSequence
    ? roles.findIndex(r => r.toLowerCase() === role.toLowerCase())
    : undefined;
  return {
    key,
    title,
    owner: ownerLabel,
    ownerSequence,
    ownerSequenceDone: seqDone,
    ownerSequenceRoleIndex,
    ownerSequenceActiveIndex,
    desc,
    to,
    icon,
    count,
    mine,
    canOpen: isAdmin || mine,
    approvedAt: approvedAt ?? null,
    alert: alert ?? null,
  };
}

function sortPartiesNewestFirst(parties: EmptyWagonArrival[]): EmptyWagonArrival[] {
  return [...parties].sort((a, b) => Date.parse(b.createdAt || b.arrivalDate) - Date.parse(a.createdAt || a.arrivalDate));
}


function pickDefaultPartyId(parties: EmptyWagonArrival[], _registries?: LoadingRegistry[]): string | null {
  const sorted = sortPartiesNewestFirst(parties);
  const active = sorted.filter(a => !isPartyEntryFinished(a));
  return active[0]?.id ?? sorted[0]?.id ?? null;
}

function entryTiles(
  role: string,
  arrivals: EmptyWagonArrival[],
  registries: LoadingRegistry[],
  selectedPartyId?: string | null,
): StepTile[] {

  const targetArrival = selectedPartyId
    ? arrivals.find(a => a.id === selectedPartyId)
    : (arrivals.find(a => !isPartyEntryFinished(a)) ?? arrivals[0]);
  const scopedArrivals = targetArrival ? [targetArrival] : [];
  const partyArrivalId = targetArrival?.id;
  const isEntryDone = targetArrival ? isPartyEntryFinished(targetArrival) : false;

  const partyRegistries = partyArrivalId
    ? (() => {
        const targetId = partyArrivalId.toLowerCase();
        const targetNum = (targetArrival?.arrivalNumber ?? '').toLowerCase();
        const direct = registries.filter(r => {
          const rArrId = (r.emptyWagonArrivalId ?? '').toLowerCase();
          const rArrNum = (r.arrivalNumber ?? '').toLowerCase();
          return rArrId === targetId || (targetNum && rArrId === targetNum) || (targetNum && rArrNum === targetNum);
        });
        if (direct.length > 0) return direct;
        return registries.filter(r =>
          (r.wagonRoutes ?? []).some(w => {
            const sId = (w.sourceArrivalId ?? '').toLowerCase();
            const sNum = (w.sourceArrivalNumber ?? '').toLowerCase();
            return sId === targetId || (targetNum && sId === targetNum) || (targetNum && sNum === targetNum);
          }),
        );
      })()
    : registries;

  const m = buildWagonFlowMetrics(scopedArrivals, partyRegistries);
  const { approvedAt: at, ownerSequenceDone: seqDone } = m;
  const fallbackBaseAt = targetArrival?.createdAt || targetArrival?.arrivalDate || new Date().toISOString();

  // Vagonlarni kiritish: Kiritish xizmat xati (partiya) bo‘yicha 6 bosqich — Tara bilan yakunlanadi.
  return ensureMonotonicStepTimes([
    makeTile(role, 'w1', 'Vagonlarni kiritish uchun Xizmat xati', "Temir yo'l",
      'Kengsoyda bo‘sh vagonlarni qabul qilib jarayonga kiritish uchun xizmat xati rasmiylashtiriladi',
      partyArrivalId ? emptyWagonsHref({ arrivalId: partyArrivalId, party: partyArrivalId }) : '/empty-wagons',
      FilePen, 0, ['Railway'], isEntryDone ? (at.w1 || fallbackBaseAt) : at.w1),
    makeTile(role, 'w2', 'Tasdiqlash va ijro uchun yo‘naltirish', "ICHDX smena boshlig'i",
      'Xizmat xatini tasdiqlab ijro uchun tegishli xizmatlarga yo‘naltiriladi',
      partyArrivalId ? emptyWagonsHref({ arrivalId: partyArrivalId, party: partyArrivalId }) : '/empty-wagons',
      Send, isEntryDone ? 0 : m.intake.length, ['Dispatching', 'DispatchSupervisor'],
      isEntryDone ? (targetArrival?.entryPermitShiftApprovedAt || at.w2 || fallbackBaseAt) : at.w2),
    makeTile(role, 'w3', 'Vagonlarni kiritish', "Temir yo'l",
      'Vagonlarni qo‘riqlash tekshiruvigacha olib borish',
      emptyWagonsHref({ work: 'toSecurity', arrivalId: m.toSecurity[0]?.id ?? partyArrivalId, party: m.toSecurity[0]?.id ?? partyArrivalId }),
      LogIn, isEntryDone ? 0 : m.toSecurity.length, ['Railway'],
      isEntryDone ? (targetArrival?.entryPermitShiftApprovedAt || targetArrival?.entryPermitPermitApprovedAt || at.w3 || fallbackBaseAt) : at.w3),
    makeTile(role, 'entry-permit', 'Vagonlarni kiritishni kelishish', 'Ruxsatnoma byurosi',
      'Ruxsatnoma byurosi vagonlarni kiritishni kelishadi',
      emptyWagonsHref({ work: 'gateCheck', arrivalId: partyArrivalId, party: partyArrivalId }),
      Handshake, isEntryDone || seqDone.w4[0] ? 0 : m.security.length, ['Permit'],
      isEntryDone
        ? (targetArrival?.entryPermitPermitApprovedAt || at.w4 || fallbackBaseAt)
        : (seqDone.w4[0] ? (targetArrival?.entryPermitPermitApprovedAt ?? at.w4) : null)),
    makeTile(role, 'entry-security', 'Vagonlarni tekshirish va kiritish', "Qo‘riqlash xizmati",
      'Qo‘riqlash xizmati vagonlarni tekshirib zavod hududiga kiritadi',
      emptyWagonsHref({ work: 'gateCheck', arrivalId: partyArrivalId, party: partyArrivalId }),
      // Qo'riqlash bosqichi faqat Ruxsatnoma byurosi kelishuvi (w4[0]) tugagandan keyin
      // "JARAYONDA" bo'lishi kerak — avval shart teskari yozilgani uchun ikkalasi bir vaqtda
      // faol (JARAYONDA) ko'rinardi.
      ShieldCheck, isEntryDone || !seqDone.w4[0] || seqDone.w4[1] ? 0 : m.security.length, ['Security'],
      isEntryDone
        ? (targetArrival?.entryPermitSecurityApprovedAt || at.w4 || fallbackBaseAt)
        : (seqDone.w4[1] ? (targetArrival?.entryPermitSecurityApprovedAt ?? at.w4) : null)),
    makeTile(role, 'w5', 'Tara tekshiruvi', 'Tarozibon',
      'Tarozibon kirishdagi tara amali bajarilganini tasdiqlaydi; 1C og‘irliklari chiqish bosqichida olinadi',
      weighingHref('tare', m.tarePending[0]?.id ?? partyArrivalId),
      Scale,
      isEntryDone ? 0 : m.tarePending.length,
      ['Scale'],
      isEntryDone ? (at.w5 || fallbackBaseAt) : at.w5)
  ]);
}

/** Yuklash va chiqarish jarayoni doirasi: yuk xati (reyestr) yoki hali yuk xatisiz vagonlar fondi. */
type LoadingScope =
  | { kind: 'registry'; registry: LoadingRegistry }
  | { kind: 'pool' };

const POOL_SCOPE_ID = 'pool';

function wagonKeyOf(arrivalId: string, wagonNumber: string): string {
  return `${arrivalId.toLowerCase()}:${wagonNumber.trim().toLowerCase()}`;
}

/** Yuk xatiga kiritilgan vagonlar (chiqib ketmagan reyestrlar bo‘yicha). */
function registeredWagonKeys(registries: LoadingRegistry[]): Set<string> {
  const keys = new Set<string>();
  for (const r of registries) {
    // Chiqib ketgan reyestr vagonlari ham fondga qaytmaydi (kalit partiya+vagon bo‘yicha).
    for (const w of r.wagonRoutes ?? []) {
      const arrId = w.sourceArrivalId || r.emptyWagonArrivalId;
      if (arrId && w.wagonNumber) keys.add(wagonKeyOf(arrId, w.wagonNumber));
    }
  }
  return keys;
}

function inLoadingCycleUnit(u: EmptyWagonUnit): boolean {
  const st = u.status ?? '';
  return st === 'Estakada' || st === 'Loading' || st === 'Loaded' || st === 'GrossWeighed'
    || st === 'SealPending' || st === 'Sealed' || st === 'ToRailwayScale'
    || Boolean(u.loadingBatchNumber?.trim() || u.loadingStartedAt || u.loadingCompletedAt);
}

/** Reyestr vagonlari bilan cheklangan partiya nusxalari (boshqa partiyalardan kelgan vagonlar ham). */
function scopeArrivalsForRegistry(arrivals: EmptyWagonArrival[], registry: LoadingRegistry): EmptyWagonArrival[] {
  const routes = registry.wagonRoutes ?? [];
  const byArrival = new Map<string, Set<string>>();
  for (const w of routes) {
    const arrId = (w.sourceArrivalId || registry.emptyWagonArrivalId || '').toLowerCase();
    const num = (w.wagonNumber || '').trim().toLowerCase();
    if (!arrId || !num) continue;
    if (!byArrival.has(arrId)) byArrival.set(arrId, new Set());
    byArrival.get(arrId)!.add(num);
  }
  if (byArrival.size === 0 && registry.emptyWagonArrivalId) {
    const arr = arrivals.find(a => a.id.toLowerCase() === registry.emptyWagonArrivalId.toLowerCase());
    return arr ? [arr] : [];
  }
  const scoped: EmptyWagonArrival[] = [];
  for (const [arrId, nums] of byArrival) {
    const arr = arrivals.find(a => a.id.toLowerCase() === arrId);
    if (!arr) continue;
    const wagons = (arr.wagons ?? []).filter(u => nums.has((u.wagonNumber || '').trim().toLowerCase()));
    scoped.push({ ...arr, wagons, wagonCount: wagons.length || arr.wagonCount });
  }
  return scoped;
}

/** Yuk xatisiz fond: yuklash zanjiridagi, hali hech bir reyestrga kiritilmagan vagonlar. */
function scopeArrivalsForPool(
  arrivals: EmptyWagonArrival[],
  registries: LoadingRegistry[],
  selectedPartyId?: string | null,
): EmptyWagonArrival[] {
  const registered = registeredWagonKeys(registries);
  // Eski reyestrlar (vagon ro‘yxatisiz) butun partiyani qamraydi.
  const wholePartyRegistered = new Set(
    registries
      .filter(r => (r.wagonRoutes ?? []).length === 0 && r.emptyWagonArrivalId)
      .map(r => r.emptyWagonArrivalId.toLowerCase()),
  );
  const scoped: EmptyWagonArrival[] = [];
  const candidateArrivals = selectedPartyId
    ? arrivals.filter(a => a.id.toLowerCase() === selectedPartyId.toLowerCase())
    : arrivals;
  const poolArrivals = candidateArrivals.length > 0 ? candidateArrivals : arrivals;

  for (const arr of poolArrivals) {
    const s = arr.stage || 'KengsoyInspection';
    if (s === 'Cancelled' || s === 'Exited') continue;
    if (wholePartyRegistered.has(arr.id.toLowerCase())) continue;
    const wagons = (arr.wagons ?? []).filter(u =>
      !u.scaleExitedAt && u.status !== 'Returned' && inLoadingCycleUnit(u) && !registered.has(wagonKeyOf(arr.id, u.wagonNumber || '')),
    );
    if (wagons.length === 0) continue;
    scoped.push({ ...arr, wagons, wagonCount: wagons.length });
  }
  return scoped;
}

function isRegistryFullyFinished(r: LoadingRegistry): boolean {
  return Boolean(r.exitedToKengsoyAt) && r.isSentToOneC && r.isSentToENakl;
}

function pickDefaultLoadingScopeId(registries: LoadingRegistry[], poolCount: number): string | null {
  const active = sortRegistriesNewestFirst(registries).find(r => !isRegistryFullyFinished(r));
  if (active) return active.id;
  if (poolCount > 0) return POOL_SCOPE_ID;
  return sortRegistriesNewestFirst(registries)[0]?.id ?? (poolCount >= 0 ? POOL_SCOPE_ID : null);
}

function registryTime(r: LoadingRegistry): number {
  const t = Date.parse(r.preparedAt || r.economistApprovedAt || r.exitedToKengsoyAt || '');
  return Number.isNaN(t) ? 0 : t;
}

/** Yangisidan eskisiga; sana bo‘lmasa raqam bo‘yicha (WB-0926-007 > WB-0926-006). */
function sortRegistriesNewestFirst(registries: LoadingRegistry[]): LoadingRegistry[] {
  return [...registries].sort((a, b) => {
    const byTime = registryTime(b) - registryTime(a);
    if (byTime !== 0) return byTime;
    return (b.registryNumber || '').localeCompare(a.registryNumber || '', undefined, { numeric: true });
  });
}

/**
 * Vagonlarni yuklash va chiqarish: yuk xati (reyestr) bo‘yicha 10 bosqich.
 * Kiritish jarayonidan mustaqil — reyestr vagonlari turli partiyalardan bo‘lishi mumkin.
 */
function loadingTiles(
  role: string,
  arrivals: EmptyWagonArrival[],
  registries: LoadingRegistry[],
  scope: LoadingScope,
  selectedPartyId?: string | null,
): StepTile[] {
  const scopedArrivals = scope.kind === 'registry'
    ? scopeArrivalsForRegistry(arrivals, scope.registry)
    : scopeArrivalsForPool(arrivals, registries, selectedPartyId);
  const scopedRegistries = scope.kind === 'registry' ? [scope.registry] : [];
  const m = buildWagonFlowMetrics(scopedArrivals, scopedRegistries);
  const { approvedAt: at } = m;
  const oneCPendingCount = scope.kind === 'registry'
    ? 0
    : scopedArrivals.reduce((sum, a) => {
        const units = (a.wagons ?? []).filter(u => u.status !== 'Returned');
        if (units.length === 0) return sum + (m.gross.some(g => g.id === a.id) ? 1 : 0);
        return sum + units.filter(u => {
          const isLoaded = u.status === 'Loaded' || u.status === 'ToRailwayScale' || u.status === 'GrossWeighed' || u.status === 'SealPending' || Boolean(u.loadingCompletedAt);
          return isLoaded && !isReadyForWaybill(u);
        }).length;
      }, 0);
  const oneCReady = oneCPendingCount === 0;
  const completedReg = scope.kind === 'registry' ? scope.registry : null;
  const partyArrivalId = scope.kind === 'registry'
    ? (scope.registry.emptyWagonArrivalId || scopedArrivals[0]?.id)
    : scopedArrivals[0]?.id;
  const partyFinished = Boolean(completedReg && isRegistryFullyFinished(completedReg));

  const tiles: StepTile[] = [
    {
      ...makeTile(role, 'w6', 'Mahsulotni yuklash', 'TM va XA sexi',
        'Estakadadagi vagonlarni yuklaydi',
        '/loading',
        Forklift,
        0,
        ['Warehouse'],
        at.w6 || (scopedArrivals.length > 0 ? (scopedArrivals[0]?.arrivalDate || '2026-01-01T00:00:00Z') : '2026-01-01T00:00:00Z')),
      stepNumber: 1,
    },
    {
      ...makeTile(role, 'w-1c-integration', '1C integratsiyasi', ['1C tizimi'],
        'Yuklangan vagonlarning Brutto, Netto va plomba ma’lumotlari 1C tarozi tizimidan olinadi',
        scope.kind === 'registry'
          ? (partyFinished
              ? weighingHref('gross', partyArrivalId ?? undefined)
              : weighingHref('gross', m.gross[0]?.id ?? partyArrivalId ?? undefined))
          : weighingHref('gross'),
        RefreshCw,
        oneCPendingCount,
        ['Scale', 'Security', 'Economist', 'Dispatching', 'Admin', 'Warehouse', 'Railway', 'Permit', 'Marketing', 'Accounting', 'DeputyDirector', 'DispatchSupervisor', '*'],
        scope.kind === 'registry'
          ? (scope.registry.preparedAt || at.w7 || at.w8 || new Date().toISOString())
          : (oneCReady ? (at.w7 || at.w8 || at.w6 || new Date().toISOString()) : null)),
      stepNumber: 2,
    },
    {
      ...makeTile(role, 'registry-create', 'Yuk xatini shakllantirish', 'ICHDX iqtisodchisi',
        '1C dan o‘tgan vagonlar zaxirasidan poyezd tarkibini tanlab, yangi yuk xati shakllantiriladi',
        completedReg ? `/registry?expanded=reg:${completedReg.id}` : '/registry/create',
        FilePlus,
        scope.kind === 'registry'
          ? 0
          : scopedArrivals.reduce((sum, a) => sum + (a.wagons ?? []).filter(u => u.status !== 'Returned' && (isReadyForWaybill(u) || Boolean(u.defectActNumber?.trim()))).length, 0),
        ['Economist', 'Admin'],
        scope.kind === 'registry'
          ? (scope.registry.preparedAt || scope.registry.economistApprovedAt || m.splitApprovedAt.registryCreate || new Date().toISOString())
          : null,
        m.registryAlert),
      stepNumber: 3,
    },
    {
      ...makeTile(role, 'registry-approve', 'Yuk xatini tasdiqlash', "ICHDX smena boshlig'i",
        'ICHDX smena boshlig‘i shakllantirilgan yuk xatini ko‘rib chiqib, tasdiqlaydi',
        completedReg
          ? `/registry?expanded=reg:${completedReg.id}`
          : (partyArrivalId ? `/registry/approve?arrivalId=${partyArrivalId}` : '/registry/approve'),
        ClipboardCheck,
        scope.kind === 'registry'
          ? (completedReg?.isApprovedByShiftSupervisor ? 0 : 1)
          : (m.regShiftPending?.length ?? 0),
        ['DispatchSupervisor', 'Dispatching', 'Admin'],
        scope.kind === 'registry' ? completedReg?.shiftSupervisorApprovedAt : (m.regShiftPending?.length === 0 ? m.approvedAt.w9 : null)),
      stepNumber: 4,
    },
    {
      ...makeTile(role, 'w10', 'Yuk xatini kelishish', 'Ruxsatnoma byurosi',
        'Ruxsatnoma byurosi yuk xatini kelishadi',
        partyFinished && completedReg
          ? `/registry?expanded=reg:${completedReg.id}`
          : (partyArrivalId ? `/registry/agree/permit?arrivalId=${partyArrivalId}` : '/registry/agree/permit'),
        Handshake,
        scope.kind === 'registry'
          ? (completedReg?.isApprovedByPermit ? 0 : (completedReg?.isApprovedByShiftSupervisor ? 1 : 0))
          : (m.regPermit?.length ?? 0),
        ['Permit'],
        scope.kind === 'registry' ? completedReg?.permitApprovedAt : null),
      stepNumber: 5,
    },
    {
      ...makeTile(role, 'exit-security', 'Vagonlarni tekshirib chiqarish', 'Qo‘riqlash xizmati',
        'Qo‘riqlash xizmati chiqayotgan vagonlar va yuk xatini tekshiradi',
        partyArrivalId ? `/registry/agree/security?arrivalId=${partyArrivalId}` : '/registry/agree/security',
        ShieldCheck,
        scope.kind === 'registry'
          ? (completedReg?.isApprovedBySecurity ? 0 : (completedReg?.isApprovedByPermit ? 1 : 0))
          : (m.regSecurity?.length ?? 0),
        ['Security'],
        scope.kind === 'registry' ? completedReg?.securityApprovedAt : null),
      stepNumber: 6,
    },
    {
      ...makeTile(role, 'exit-railway', 'Vagonlarni chiqarish', 'Temir yo‘l',
        'Temir yo‘l kelishilgan vagonlarni olib chiqadi',
        emptyWagonsHref(completedReg ? { work: 'toKengsoy', registryId: completedReg.id } : { work: 'toKengsoy', arrivalId: partyArrivalId, party: partyArrivalId }),
        LogOut,
        scope.kind === 'registry'
          ? (completedReg?.exitedToKengsoyAt ? 0 : (completedReg?.isApprovedBySecurity ? 1 : 0))
          : (m.toKengsoy?.length ?? 0),
        ['Railway'],
        scope.kind === 'registry' ? completedReg?.exitedToKengsoyAt : null),
      stepNumber: 7,
    },
    {
      ...makeTile(
        role,
        'w12',
        'Yuk xatini ro‘yxatdan o‘tkazish',
        'ICHDX iqtisodchisi',
        'Chiqarilgan yuk xatini tegishli elektron tizimlarda ro‘yxatdan o‘tkazadi',
        completedReg
          ? `/registry?expanded=reg:${completedReg.id}`
          : '/registry',
        BadgeCheck,
        scope.kind === 'registry' ? (completedReg?.exitedToKengsoyAt && (!completedReg.isSentToOneC || !completedReg.isSentToENakl) ? 1 : 0) : (m.regComparePending?.length ?? 0),
        ['Economist'],
        scope.kind === 'registry' && completedReg?.exitedToKengsoyAt && completedReg.isSentToOneC && completedReg.isSentToENakl
          ? (completedReg.sentToENaklAt || completedReg.sentToOneCAt || completedReg.exitedToKengsoyAt)
          : null,
      ),
      stepNumber: 8,
    },
  ];

  // Completion inferred from downstream steps must not invent an event timestamp.
  const withActualTimes = (items: StepTile[]): StepTile[] => {
    if (completedReg && !usesSequentialWorkflow(completedReg)) return items;
    const units = scopedArrivals.flatMap(a => a.wagons ?? []);
    const actualTimes: Record<string, string | null | undefined> = {
      w6: maxIso(...units.map(u => u.loadingCompletedAt)),
      'w-1c-integration': maxIso(...units.map(u => u.sealedAt)),
      'registry-create': completedReg?.preparedAt,
      'registry-approve': completedReg?.shiftSupervisorApprovedAt,
      w10: completedReg?.permitApprovedAt,
      'exit-security': completedReg?.securityApprovedAt,
      'exit-railway': completedReg?.exitedToKengsoyAt,
      w12: completedReg?.isSentToOneC && completedReg.isSentToENakl
        ? maxIso(completedReg.sentToOneCAt, completedReg.sentToENaklAt) : null,
    };
    return items.map(t => ({ ...t, actualApprovedAt: actualTimes[t.key] ?? null }));
  };

  // Yuk xati bo‘yicha keyingi bosqich o‘tilgan bo‘lsa, oldingilari ham o‘tilgan: reyestr
  // shakllangan → yuklash tugagan; chiqarilgan → kelishuv va tekshiruv tugagan.
  // (Eski/1C orqali kelgan yozuvlarda ayrim tasdiq vaqtlari bo‘lmasligi mumkin.)
  if (completedReg) {
    const reg = completedReg;
    const impliedAt: Record<string, string | null | undefined> = {
      w6: reg.preparedAt,
      'w-1c-integration': reg.preparedAt,
      'registry-create': reg.preparedAt,
    };
    if (reg.exitedToKengsoyAt) {
      impliedAt['registry-approve'] = reg.shiftSupervisorApprovedAt || reg.preparedAt;
      impliedAt.w10 = reg.permitApprovedAt || reg.exitedToKengsoyAt;
      impliedAt['exit-security'] = reg.securityApprovedAt || reg.exitedToKengsoyAt;
      impliedAt['exit-railway'] = reg.exitedToKengsoyAt;
    }
    return withActualTimes(tiles.map(t => {
      const implied = impliedAt[t.key];
      if (!implied || (t.approvedAt && (!t.ownerSequenceDone || t.ownerSequenceDone.every(Boolean)))) return t;
      return {
        ...t,
        approvedAt: t.approvedAt ?? implied,
        count: 0,
        ownerSequenceDone: t.ownerSequenceDone?.map(() => true),
        ownerSequenceActiveIndex: t.ownerSequenceDone ? t.ownerSequenceDone.length : t.ownerSequenceActiveIndex,
      };
    }));
  }
  return withActualTimes(tiles);
}

function sortOrdersNewestFirst(orders: MonthlyOrder[]): MonthlyOrder[] {
  return [...orders].sort((a, b) => {
    const byPeriod = (b.year - a.year) || (b.month - a.month);
    if (byPeriod !== 0) return byPeriod;
    return Date.parse(b.createdAt || '') - Date.parse(a.createdAt || '');
  });
}

function orderTiles(role: string, orders: MonthlyOrder[], orderId?: string | null): StepTile[] {
  const scoped = orderId
    ? orders.filter(o => o.id === orderId)
    : [];
  const drafts = scoped.filter(o => o.status === 'Draft' || o.status === 'ReturnedToMarketing');
  const accounting = scoped.filter(o => o.status === 'PendingAccounting');
  const deputyOrder = scoped.filter(o => o.status === 'PendingDeputyDirector' || o.status === 'ReadyForDispatch');
  const ichdxOrder = scoped.filter(o => o.status === 'PendingDispatching');

  const pastSubmit = scoped.filter(o =>
    !['Draft', 'ReturnedToMarketing'].includes(o.status),
  );
  const pastAccounting = scoped.filter(o =>
    !['Draft', 'ReturnedToMarketing', 'PendingAccounting'].includes(o.status),
  );
  const pastDeputy = scoped.filter(o =>
    ['PendingDispatching', 'Active', 'Completed'].includes(o.status)
    || Boolean(o.deputyApprovedAt),
  );
  const pastDispatch = scoped.filter(o =>
    ['Active', 'Completed'].includes(o.status) || Boolean(o.dispatchApprovedAt),
  );

  const o1At = maxIso(...pastSubmit.map(o => o.submittedAt), ...pastSubmit.map(o => o.createdAt));
  const o2At = maxIso(...pastAccounting.map(o => o.approvedAt));
  const o3At = maxIso(...pastDeputy.map(o => o.deputyApprovedAt));
  const o4At = maxIso(...pastDispatch.map(o => o.dispatchApprovedAt));

  // Tanlangan buyurtma bo‘lsa — har bir bosqich shu buyurtmaning o‘zini ochadi («Orqaga» — boshqaruv paneliga)
  const focus = scoped[0];
  const focusLink = focus
    ? `/orders/${focus.logisticsType === 'Road' ? 'road' : 'railway'}?view=${
      focus.status === 'Active' ? 'faol'
        : ['Completed', 'Cancelled', 'Rejected'].includes(focus.status) ? 'yakun'
          : 'tasdiq'
    }&open=${focus.id}`
    : null;

  return [
    makeTile(role, 'o1', 'Buyurtma yaratish', 'Mahsulotlarni sotish va marketing xizmati',
      'Oylik buyurtmani yaratadi',
      focusLink ?? '/orders', ClipboardPen, drafts.length, ['Marketing', 'Management'], o1At),
    makeTile(role, 'o2', 'Buyurtmani kelishish', 'Buxgalteriya',
      'Buyurtmani kelishadi',
      focusLink ?? '/orders/railway?view=tasdiq', Handshake, accounting.length, ['Accounting'], o2At),
    makeTile(role, 'o3', 'Buyurtmani tasdiqlash va ijro uchun yuborish', 'Bosh direktor o\'rinbosari',
      'Kelishilgan buyurtmani tasdiqlab ijroga yuboradi',
      focusLink ?? '/orders/railway?view=tasdiq', Send, deputyOrder.length, ['DeputyDirector'], o3At),
    makeTile(role, 'o4', 'Ijro uchun qabul qilish', 'Ishlab chiqarish dispetcherlik xizmati boshlig‘i',
      'Buyurtmani ijroga qabul qiladi',
      focusLink ?? '/orders/railway?view=tasdiq', ClipboardCheck, ichdxOrder.length, ['DispatchSupervisor'], o4At),
  ];
}





function useFlowFocus(tiles: StepTile[], isAdmin: boolean, loading: boolean) {
  const progressIndex = useMemo(() => {
    const hasStarted = tiles.some(t => t.count > 0 || t.approvedAt != null);
    if (!hasStarted) return -1;
    if (tiles.length > 0 && tiles.every(t => t.approvedAt != null && (!t.ownerSequenceDone || t.ownerSequenceDone.every(Boolean)))) {
      return tiles.length;
    }

    // Bosqichlar ketma-ket tekshiriladi: navbatida faol vagon qolmagan (count === 0) va tasdiqlangan (approvedAt != null) bosqichlar to'liq yakunlangan hisoblanadi
    let maxApprovedIndex = -1;
    for (let i = 0; i < tiles.length; i++) {
      const isStepDone = tiles[i].approvedAt != null && tiles[i].count === 0 && (!tiles[i].ownerSequenceDone || tiles[i].ownerSequenceDone!.every(Boolean));
      if (isStepDone) {
        maxApprovedIndex = i;
      } else {
        break;
      }
    }

    const nextStep = maxApprovedIndex + 1;
    if (nextStep < tiles.length) {
      return nextStep;
    }

    const firstIncomplete = tiles.findIndex(t => t.count > 0 || !t.approvedAt || (t.ownerSequenceDone && !t.ownerSequenceDone.every(Boolean)));
    if (firstIncomplete >= 0) return firstIncomplete;
    return tiles.length;
  }, [tiles]);
  const allDone = progressIndex >= tiles.length && tiles.length > 0;
  const focusIndex = useMemo(() => {
    if (allDone) return tiles.length - 1;
    if (progressIndex >= 0) return progressIndex;
    if (isAdmin) return 0;
    return tiles.findIndex(t => t.mine);
  }, [tiles, progressIndex, isAdmin, allDone]);
  const flowRef = useRef<HTMLOListElement>(null);
  const currentTile = !allDone && progressIndex >= 0 && progressIndex < tiles.length
    ? tiles[progressIndex]
    : null;
  const focusTile = focusIndex >= 0 ? tiles[focusIndex] : null;
  const processStarted = progressIndex >= 0 || tiles.some(t => t.approvedAt != null);

  useEffect(() => {
    if (loading || focusIndex < 0 || !flowRef.current) return;
    const node = flowRef.current.querySelector<HTMLElement>(`[data-flow-i="${focusIndex}"]`);
    node?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [focusIndex, loading, tiles.length]);

  return { progressIndex, focusIndex, flowRef, currentTile, focusTile, processStarted, allDone };
}

/**
 * Zanjir bo'yicha bosqichlar vaqti doimo oldinga (xronologik) harakatlanishini ta'minlaydi.
 * Har bir keyingi bosqich vaqti o'zidan oldingi bosqichdan erta bo'lmasligini kafolatlaydi.
 */
function ensureMonotonicStepTimes(tiles: StepTile[]): StepTile[] {
  let prevTimestamp: number | null = null;
  return tiles.map(t => {
    if (!t.approvedAt) return t;
    const curTime = new Date(t.approvedAt).getTime();
    if (Number.isNaN(curTime)) return t;

    if (prevTimestamp !== null && curTime < prevTimestamp) {
      return {
        ...t,
        approvedAt: new Date(prevTimestamp).toISOString(),
      };
    }
    prevTimestamp = curTime;
    return t;
  });
}

function FlowStepList({
  tiles,
  progressIndex,
  allDone,
  processStarted,
  isAdmin,
  role,
  flowRef,
  numberOffset = 0,
  ariaLabel,
  restartNumbering = false,
  reverse = false,
  returnFocus,
}: {
  tiles: StepTile[];
  progressIndex: number;
  allDone: boolean;
  processStarted: boolean;
  isAdmin: boolean;
  role?: string;
  flowRef?: RefObject<HTMLOListElement | null>;
  /** Global step number offset (0-based index of first tile in full chain) */
  numberOffset?: number;
  ariaLabel: string;
  restartNumbering?: boolean;
  reverse?: boolean;
  /** Admin «Orqaga» bosganda boshqaruv panelining shu jarayon blokiga qaytadi. */
  returnFocus?: string;
}) {
  const returnTo = isAdmin && returnFocus ? (returnFocus.startsWith('/') ? returnFocus : `/dashboard?focus=${returnFocus}`) : '/dashboard';
  const displayTiles = ensureMonotonicStepTimes(tiles);
  return (
    <ol ref={flowRef} className={`flow${reverse ? ' flow--reverse' : ''}`} aria-label={ariaLabel}>
      {displayTiles.map((t, localI) => {
        const i = numberOffset + localI;
        const Icon = t.icon;
        const hasPendingWork = t.count > 0;
        const isPassed = t.approvedAt != null;
        const isSeqComplete = !t.ownerSequenceDone || t.ownerSequenceDone.every(Boolean);

        const done = allDone || (isPassed && !hasPendingWork && isSeqComplete);
        const current = !allDone && !done && (hasPendingWork || (processStarted && i === progressIndex));
        const pending = hasPendingWork;
        const waiting = current && !hasPendingWork;
        const isSequenceTurn = Boolean(
          current
          && t.ownerSequence
          && t.ownerSequenceActiveIndex !== undefined
          && t.ownerSequenceRoleIndex === t.ownerSequenceActiveIndex,
        );
        const isMyTurnDone = Boolean(
          t.ownerSequence
          && t.ownerSequenceRoleIndex !== undefined
          && t.ownerSequenceRoleIndex >= 0
          && t.ownerSequenceDone?.[t.ownerSequenceRoleIndex],
        );
        const waitingForOwner = t.ownerSequence && t.ownerSequenceActiveIndex !== undefined
          ? t.ownerSequence[t.ownerSequenceActiveIndex]
          : undefined;
        const canClick = isAdmin || (
          t.mine
          && (allDone || !t.ownerSequence || !current || isSequenceTurn || isMyTurnDone || done)
          && (role ? canOpenPath(role, t.to) : true)
        );
        const className = [
          'flow__item',
          done ? 'flow__item--done' : '',
          current ? 'flow__item--current' : '',
          pending ? 'flow__item--pending' : '',
          waiting ? 'flow__item--waiting' : '',
          !done && !current ? 'flow__item--ahead' : '',
          t.mine && !isAdmin ? 'flow__item--mine' : '',
          isAdmin ? 'flow__item--admin' : '',
          !canClick && !isAdmin ? 'flow__item--locked' : '',
          current && !isAdmin && t.mine && t.ownerSequence && !isSequenceTurn && !isMyTurnDone ? 'flow__item--sequence-waiting' : '',
          t.count > 0 ? 'flow__item--hot' : '',
          t.alert ? 'flow__item--alert' : '',
        ].filter(Boolean).join(' ');

        const displayedApprovedAt = t.actualApprovedAt === undefined ? t.approvedAt : t.actualApprovedAt;
        const approvedLabel = formatApprovedAt(displayedApprovedAt);
        const stepNo = t.stepNumber !== undefined
          ? t.stepNumber
          : (restartNumbering ? localI : i) + 1;
        const statusLabel = t.alert
          ? t.alert.label
          : done
            ? 'Bajarildi'
            : current && t.ownerSequence && waitingForOwner
              ? (!isAdmin && isSequenceTurn)
                ? 'Sizning navbatingiz'
                : `${waitingForOwner} kutilmoqda`
              : pending
                ? 'Jarayonda'
                : waiting
                  ? 'Kutilmoqda'
                  : 'Navbatda';

        const body = (
          <>
            <div className="flow__spine" aria-hidden>
              <span className={`flow__line flow__line--in${done || current ? ' flow__line--on' : ''}${done ? ' flow__line--done' : ''}${current ? ' flow__line--current' : ''}${localI === 0 ? ' flow__line--edge' : ''}`} />
              <span className="flow__node">
                {done ? (
                  <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                ) : (
                  <span className="flow__node-n">{stepNo}</span>
                )}
              </span>
              <span className={`flow__line flow__line--out${done ? ' flow__line--on flow__line--done' : ''}${localI === tiles.length - 1 ? ' flow__line--edge' : ''}`} />
            </div>
            <div className="flow__card" title={t.desc}>
              <div className="flow__card-top">
                <span className="flow__icon"><Icon className="w-4 h-4" strokeWidth={1.9} /></span>
                <p className="flow__title" title={t.title}>{t.title}</p>
                {t.alert ? (
                  <span className="flow__signal" title={t.alert.detail}>{t.alert.label}</span>
                ) : t.count > 0 ? (
                  <span className="flow__count">{t.count}</span>
                ) : null}
                  {!isAdmin && !canClick ? (
                    <Lock className="flow__lock" strokeWidth={1.75} />
                  ) : (!isAdmin && isSequenceTurn) ? (
                    <span className="flow__you">Siz</span>
                  ) : (!isAdmin && !t.ownerSequence && t.mine) ? (
                    <span className="flow__you">Siz</span>
                  ) : null}
              </div>
              {t.ownerSequence && t.ownerSequence.length > 1 ? (
                <FlowOwnerSequence
                  names={t.ownerSequence}
                  doneFlags={t.ownerSequenceDone}
                  activeIndex={current ? t.ownerSequenceActiveIndex : undefined}
                  currentIndex={t.ownerSequenceRoleIndex}
                  title={t.owner}
                />
              ) : (
                <p className="flow__owner" title={t.owner}>{t.owner}</p>
              )}
              {t.alert?.detail ? (
                <p className="flow__alert-detail" title={t.alert.detail}>{t.alert.detail}</p>
              ) : null}
              <div className="flow__status">
                <span className="flow__status-label">{statusLabel}</span>
                {done && approvedLabel ? (
                  <time className="flow__status-time" dateTime={displayedApprovedAt ?? undefined}>
                    {approvedLabel}
                  </time>
                ) : null}
              </div>
            </div>
          </>
        );

        return (
          <li key={t.key} data-flow-i={i} className={className}>
            {canClick ? (
              <Link
                to={withFromDashboard(t.to, { key: t.key, state: done ? 'done' : current ? 'current' : 'ahead', at: displayedApprovedAt }, returnTo)}
                state={{ from: returnTo }}
                className="flow__hit"
              >
                {body}
              </Link>
            ) : (
              <div className="flow__hit" aria-disabled>{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}


const WAGON_PHASES = [
  {
    key: 'kirish', title: 'Vagonlarni kiritish', start: 0, end: 6,
    icon: LogIn, reverse: false,
    hint: '1 → 6 · Xizmat xatidan tara og‘irligigacha · Chapdan o‘ngga',
  },
  {
    key: 'yuklash', title: 'Vagonlarni yuklash va chiqarish', start: 6, end: 13,
    icon: LogOut, reverse: false,
    hint: '1 → 8 · Mahsulot yuklash va 1C integratsiyasidan ro‘yxatdan o‘tkazishgacha · Chapdan o‘ngga',
  },
];

const UZ_MONTHS = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr',
];

function getPartyPeriod(p: EmptyWagonArrival): { year: number; month: number } {
  if (p.arrivalDate) {
    const d = new Date(p.arrivalDate);
    if (!isNaN(d.getTime())) {
      return {
        year: d.getFullYear(),
        month: d.getMonth() + 1,
      };
    }
  }
  const m = (p.arrivalNumber || '').match(/-(\d{2})(\d{2})-/);
  if (m) {
    return {
      month: parseInt(m[1], 10),
      year: 2000 + parseInt(m[2], 10),
    };
  }
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  };
}

function PartySelect({
  parties,
  value,
  onChange,
  disabled,
}: {
  parties: EmptyWagonArrival[];
  registries?: LoadingRegistry[];
  value: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'active' | 'all'>('active');
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(() => new Date().getMonth() + 1);
  const ref = useRef<HTMLDivElement>(null);

  const selected = parties.find(p => p.id === value || p.arrivalNumber === value);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => {
      document.removeEventListener('mousedown', close);
    };
  }, []);

  const availableYears = useMemo(() => {
    const set = new Set<number>();
    for (const p of parties) {
      set.add(getPartyPeriod(p).year);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [parties]);

  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);

  const availableMonthsForYear = useMemo(() => {
    const map = new Map<number, number>();
    for (const p of parties) {
      const period = getPartyPeriod(p);
      if (period.year === selectedYear) {
        map.set(period.month, (map.get(period.month) || 0) + 1);
      }
    }
    return Array.from(map.entries())
      .map(([m, count]) => ({
        month: m,
        label: UZ_MONTHS[m - 1] || `${m}-oy`,
        count,
      }))
      .sort((a, b) => b.month - a.month);
  }, [parties, selectedYear]);

  useEffect(() => {
    if (availableMonthsForYear.length > 0 && !availableMonthsForYear.some(m => m.month === selectedMonth)) {
      setSelectedMonth(availableMonthsForYear[0].month);
    }
  }, [availableMonthsForYear, selectedMonth]);

  const partiesWithStatus = useMemo(() => {
    return parties.map(p => {
      const finished = isPartyEntryFinished(p);
      return { party: p, finished };
    });
  }, [parties]);

  const activeCount = useMemo(
    () => partiesWithStatus.filter(x => !x.finished).length,
    [partiesWithStatus]
  );

  useEffect(() => {
    if (activeCount === 0 && tab === 'active') {
      setTab('all');
    }
  }, [activeCount, tab]);

  const filteredParties = useMemo(() => {
    return partiesWithStatus.filter(({ party: p, finished }) => {
      if (tab === 'active' && finished) return false;

      if (tab === 'all') {
        const period = getPartyPeriod(p);
        if (period.year !== selectedYear || period.month !== selectedMonth) return false;
      }

      return true;
    });
  }, [partiesWithStatus, tab, selectedYear, selectedMonth]);

  const label = selected
    ? selected.arrivalNumber
    : 'Partiyani tanlash';

  return (
    <div className="party-select party-select--dashboard-party" ref={ref}>
      <button
        type="button"
        className="party-select__trigger"
        onClick={() => !disabled && parties.length > 0 && setOpen(v => !v)}
        disabled={disabled || parties.length === 0}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="party-select__label flex items-center gap-1.5 min-w-0">
          <TrainFront className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        <ChevronDown className={`party-select__chev${open ? ' party-select__chev--open' : ''}`} strokeWidth={2.4} />
      </button>

      {open && parties.length > 0 ? (
        <div className="party-select__menu" onClick={e => e.stopPropagation()}>
          {/* Holat tablari va Yil/Oy tanlash */}
          <div className="p-2 border-b border-gray-100 dark:border-slate-800 space-y-1.5 bg-slate-50/70 dark:bg-slate-900/70">
            <div className="flex gap-1 p-0.5 rounded-lg bg-slate-200/70 dark:bg-slate-800 text-[11px] font-medium">
              <button
                type="button"
                onClick={() => setTab('active')}
                className={`flex-1 py-1 px-2 rounded-md transition-all text-center ${
                  tab === 'active'
                    ? 'bg-white shadow-xs text-sky-700 font-semibold dark:bg-slate-700 dark:text-sky-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                Jarayonda ({activeCount})
              </button>
              <button
                type="button"
                onClick={() => setTab('all')}
                className={`flex-1 py-1 px-2 rounded-md transition-all text-center ${
                  tab === 'all'
                    ? 'bg-white shadow-xs text-sky-700 font-semibold dark:bg-slate-700 dark:text-sky-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                Barchasi ({parties.length})
              </button>
            </div>

            {/* Yil va Oy filtrlari (Faqat Barchasi tabida ko‘rinadi) */}
            {tab === 'all' && availableYears.length > 0 ? (
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1 shrink-0">
                  <Calendar className="h-3 w-3 text-sky-600 dark:text-sky-400" />
                  Davr:
                </span>
                <select
                  value={selectedYear}
                  onChange={e => setSelectedYear(Number(e.target.value))}
                  className="w-[5.4rem] text-[11px] font-medium py-1 px-1.5 rounded-md border border-slate-200 bg-white text-slate-800 shadow-2xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                  title="Yilni tanlash"
                >
                  {availableYears.map(yr => (
                    <option key={yr} value={yr}>
                      {yr}-yil
                    </option>
                  ))}
                </select>
                <select
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(Number(e.target.value))}
                  className="flex-1 text-[11px] font-medium py-1 px-1.5 rounded-md border border-slate-200 bg-white text-slate-800 shadow-2xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                  title="Oyni tanlash"
                >
                  {availableMonthsForYear.map(m => (
                    <option key={m.month} value={m.month}>
                      {m.label} ({m.count} ta)
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          {/* Partiyalar ro‘yxati */}
          <ul className="party-select__list" role="listbox" aria-label="Partiyalar">
            {filteredParties.length > 0 ? (
              filteredParties.map(({ party: p, finished }) => {
                const isCurrent = p.id === value;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isCurrent}
                      className={`party-select__item${isCurrent ? ' party-select__item--active' : ''}`}
                      onClick={() => {
                        onChange(p.id);
                        setOpen(false);
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 w-full leading-tight">
                        <span className="party-select__item-main font-mono text-[12px] truncate">{p.arrivalNumber}</span>
                        {finished ? (
                          <span className="shrink-0 whitespace-nowrap rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                            Yakunlangan
                          </span>
                        ) : (
                          <span className="shrink-0 whitespace-nowrap rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
                            Jarayonda
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                        <span className="truncate">
                          {p.wagonCount} ta{p.productType ? ` · ${p.productType}` : ''}
                        </span>
                        {p.arrivalDate ? (
                          <span className="text-[10px] text-slate-400 shrink-0 whitespace-nowrap">
                            {new Date(p.arrivalDate).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit' })}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })
            ) : (
              <div className="py-6 px-3 text-center text-xs text-slate-400">
                <p>Mos keluvchi partiya topilmadi</p>
                {tab === 'active' && parties.length > activeCount && (
                  <button
                    type="button"
                    onClick={() => setTab('all')}
                    className="mt-2 text-xs font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-400"
                  >
                    Barcha partiyalarni ko‘rish ({parties.length}) →
                  </button>
                )}
              </div>
            )}
          </ul>

          {/* Pastki statistika */}
          <div className="px-2.5 py-1.5 border-t border-gray-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 text-[10px] text-slate-400 flex items-center justify-between shrink-0">
            <span className="shrink-0 whitespace-nowrap">Ko‘rsatilmoqda: {filteredParties.length} ta</span>
            <span className="shrink-0 whitespace-nowrap">Audit va arxiv</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}


/** Yuk xati (reyestr) tanlash — yuklash va chiqarish jarayoni doirasi. */
function getRegistryPeriod(r: LoadingRegistry): { year: number; month: number } {
  const d = r.preparedAt || r.economistApprovedAt || r.exitedToKengsoyAt;
  if (d) {
    const dt = new Date(d);
    if (!isNaN(dt.getTime())) {
      return { year: dt.getFullYear(), month: dt.getMonth() + 1 };
    }
  }
  const m = (r.registryNumber || '').match(/WB-(\d{2})(\d{2})-/i);
  if (m) {
    return {
      month: parseInt(m[1], 10),
      year: 2000 + parseInt(m[2], 10),
    };
  }
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  };
}

/** Yuk xati (reyestr) tanlash — yuklash va chiqarish jarayoni doirasi. */
function RegistrySelect({
  registries,
  poolCount,
  value,
  onChange,
  disabled,
}: {
  registries: LoadingRegistry[];
  poolCount: number;
  value: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'active' | 'all'>('active');
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(() => new Date().getMonth() + 1);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const availableYears = useMemo(() => {
    const set = new Set<number>();
    for (const r of registries) {
      set.add(getRegistryPeriod(r).year);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [registries]);

  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);

  const availableMonthsForYear = useMemo(() => {
    const map = new Map<number, number>();
    for (const r of registries) {
      const period = getRegistryPeriod(r);
      if (period.year === selectedYear) {
        map.set(period.month, (map.get(period.month) || 0) + 1);
      }
    }
    return Array.from(map.entries())
      .map(([m, count]) => ({
        month: m,
        label: UZ_MONTHS[m - 1] || `${m}-oy`,
        count,
      }))
      .sort((a, b) => b.month - a.month);
  }, [registries, selectedYear]);

  useEffect(() => {
    if (availableMonthsForYear.length > 0 && !availableMonthsForYear.some(m => m.month === selectedMonth)) {
      setSelectedMonth(availableMonthsForYear[0].month);
    }
  }, [availableMonthsForYear, selectedMonth]);

  const sorted = useMemo(() => sortRegistriesNewestFirst(registries), [registries]);
  const activeCount = sorted.filter(r => !isRegistryFullyFinished(r)).length;

  useEffect(() => {
    if (activeCount === 0 && tab === 'active') {
      setTab('all');
    }
  }, [activeCount, tab]);

  const list = useMemo(() => {
    if (tab === 'active') {
      return sorted.filter(r => !isRegistryFullyFinished(r));
    }
    return sorted.filter(r => {
      const period = getRegistryPeriod(r);
      return period.year === selectedYear && period.month === selectedMonth;
    });
  }, [sorted, tab, selectedYear, selectedMonth]);

  const selected = value && value !== POOL_SCOPE_ID ? registries.find(r => r.id === value) : null;
  const label = value === POOL_SCOPE_ID
    ? 'Yuk xatisiz vagonlar'
    : selected
      ? `${selected.registryNumber || 'Yuk xati'} · ${selected.arrivalNumber || 'Manba partiya'}`
      : 'Yuk xatini tanlash';
  const hasOptions = registries.length > 0 || poolCount > 0;

  return (
    <div className="party-select party-select--dashboard-party" ref={ref}>
      <button
        type="button"
        className="party-select__trigger"
        onClick={() => !disabled && hasOptions && setOpen(v => !v)}
        disabled={disabled || !hasOptions}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="party-select__label flex items-center gap-1.5 min-w-0">
          <FileText className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        <ChevronDown className={`party-select__chev${open ? ' party-select__chev--open' : ''}`} strokeWidth={2.4} />
      </button>

      {open && hasOptions ? (
        <div className="party-select__menu" onClick={e => e.stopPropagation()}>
          {/* Holat tablari va Yil/Oy filtrlari */}
          <div className="p-2 border-b border-gray-100 dark:border-slate-800 space-y-1.5 bg-slate-50/70 dark:bg-slate-900/70">
            <div className="flex gap-1 p-0.5 rounded-lg bg-slate-200/70 dark:bg-slate-800 text-[11px] font-medium">
              {(['active', 'all'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`flex-1 py-1 px-2 rounded-md transition-all text-center ${
                    tab === t
                      ? 'bg-white shadow-xs text-sky-700 font-semibold dark:bg-slate-700 dark:text-sky-300'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {t === 'active' ? `Jarayonda (${activeCount})` : `Barchasi (${registries.length})`}
                </button>
              ))}
            </div>

            {/* Yil va Oy filtrlari (Faqat Barchasi tabida ko‘rinadi) */}
            {tab === 'all' && availableYears.length > 0 ? (
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1 shrink-0">
                  <Calendar className="h-3 w-3 text-sky-600 dark:text-sky-400" />
                  Davr:
                </span>
                <select
                  value={selectedYear}
                  onChange={e => setSelectedYear(Number(e.target.value))}
                  className="w-[5.4rem] text-[11px] font-medium py-1 px-1.5 rounded-md border border-slate-200 bg-white text-slate-800 shadow-2xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                  title="Yilni tanlash"
                >
                  {availableYears.map(yr => (
                    <option key={yr} value={yr}>
                      {yr}-yil
                    </option>
                  ))}
                </select>
                <select
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(Number(e.target.value))}
                  className="flex-1 text-[11px] font-medium py-1 px-1.5 rounded-md border border-slate-200 bg-white text-slate-800 shadow-2xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                  title="Oyni tanlash"
                >
                  {availableMonthsForYear.map(m => (
                    <option key={m.month} value={m.month}>
                      {m.label} ({m.count} ta)
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          <ul className="party-select__list" role="listbox" aria-label="Yuk xatlari">
            {tab === 'active' || poolCount > 0 ? (
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === POOL_SCOPE_ID}
                  className={`party-select__item${value === POOL_SCOPE_ID ? ' party-select__item--active' : ''}`}
                  onClick={() => { onChange(POOL_SCOPE_ID); setOpen(false); }}
                >
                  <div className="flex items-center justify-between gap-2 w-full leading-tight">
                    <span className="party-select__item-main text-[12px] truncate">Yuk xatisiz vagonlar</span>
                    <span className="shrink-0 whitespace-nowrap rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                      {poolCount} ta
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                    Yuklash / brutto / plomba jarayonida, hali reyestrga kiritilmagan
                  </div>
                </button>
              </li>
            ) : null}
            {list.length > 0 ? (
              list.map(r => {
                const isCurrent = r.id === value;
                const finished = isRegistryFullyFinished(r);
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isCurrent}
                      className={`party-select__item${isCurrent ? ' party-select__item--active' : ''}`}
                      onClick={() => { onChange(r.id); setOpen(false); }}
                    >
                      <div className="flex items-center justify-between gap-2 w-full leading-tight">
                        <span className="party-select__item-main font-mono text-[12px] truncate">{r.registryNumber || '—'}</span>
                        {finished ? (
                          <span className="shrink-0 whitespace-nowrap rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                            Yakunlangan
                          </span>
                        ) : (
                          <span className="shrink-0 whitespace-nowrap rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
                            Jarayonda
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                        <span className="truncate">
                          Manba: {r.arrivalNumber || '—'} · {(r.wagonRoutes?.length || r.wagonCount || 0)} ta{r.productType ? ` · ${r.productType}` : ''}
                        </span>
                        {r.preparedAt ? (
                          <span className="text-[10px] text-slate-400 shrink-0 whitespace-nowrap">
                            {new Date(r.preparedAt).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit' })}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })
            ) : (
              <div className="py-6 px-3 text-center text-xs text-slate-400">
                <p>Mos keluvchi yuk xati topilmadi</p>
              </div>
            )}
          </ul>

          {/* Pastki statistika */}
          <div className="px-2.5 py-1.5 border-t border-gray-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 text-[10px] text-slate-400 flex items-center justify-between shrink-0">
            <span className="shrink-0 whitespace-nowrap">Ko‘rsatilmoqda: {list.length} ta</span>
            <span className="shrink-0 whitespace-nowrap">Audit va arxiv</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OrderSelect({
  orders,
  value,
  onChange,
  disabled,
}: {
  orders: MonthlyOrder[];
  value: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'active' | 'all'>('active');
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(() => new Date().getMonth() + 1);
  const ref = useRef<HTMLDivElement>(null);

  const selected = orders.find(o => o.id === value);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => {
      document.removeEventListener('mousedown', close);
    };
  }, [open]);

  const availableYears = useMemo(() => {
    const set = new Set<number>();
    for (const o of orders) {
      set.add(o.year);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [orders]);

  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);

  const availableMonthsForYear = useMemo(() => {
    const map = new Map<number, number>();
    for (const o of orders) {
      if (o.year === selectedYear) {
        map.set(o.month, (map.get(o.month) || 0) + 1);
      }
    }
    return Array.from(map.entries())
      .map(([m, count]) => ({
        month: m,
        label: UZ_MONTHS[m - 1] || `${m}-oy`,
        count,
      }))
      .sort((a, b) => b.month - a.month);
  }, [orders, selectedYear]);

  useEffect(() => {
    if (availableMonthsForYear.length > 0 && !availableMonthsForYear.some(m => m.month === selectedMonth)) {
      setSelectedMonth(availableMonthsForYear[0].month);
    }
  }, [availableMonthsForYear, selectedMonth]);

  const ordersWithStatus = useMemo(() => {
    return orders.map(o => {
      const finished = isOrderFlowFinished(o.status);
      const fulfillment = computeOrderFulfillment(o);
      return { order: o, finished, fulfillment };
    });
  }, [orders]);

  const activeCount = useMemo(
    () => ordersWithStatus.filter(x => !x.finished).length,
    [ordersWithStatus]
  );

  const filteredOrders = useMemo(() => {
    return ordersWithStatus.filter(({ order: o, finished }) => {
      if (tab === 'active' && finished) return false;
      if (tab === 'all') {
        if (o.year !== selectedYear || o.month !== selectedMonth) return false;
      }
      return true;
    });
  }, [ordersWithStatus, tab, selectedYear, selectedMonth]);

  const label = selected
    ? selected.orderNumber
    : 'Buyurtmani tanlash';

  return (
    <div className="party-select party-select--dashboard-order" ref={ref} onClick={e => e.stopPropagation()}>
      <button
        type="button"
        className="party-select__trigger"
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled && orders.length > 0) setOpen(v => !v);
        }}
        disabled={disabled || orders.length === 0}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="party-select__label flex items-center gap-1.5 min-w-0">
          <ClipboardList className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        <ChevronDown className={`party-select__chev${open ? ' party-select__chev--open' : ''}`} strokeWidth={2.4} />
      </button>

      {open && orders.length > 0 ? (
        <div className="party-select__menu" onClick={e => e.stopPropagation()}>
          {/* Holat tablari va Yil/Oy tanlash */}
          <div className="p-2 border-b border-gray-100 dark:border-slate-800 space-y-1.5 bg-slate-50/70 dark:bg-slate-900/70">
            {/* Holat tablari */}
            <div className="flex gap-1 p-0.5 rounded-lg bg-slate-200/70 dark:bg-slate-800 text-[11px] font-medium">
              <button
                type="button"
                onClick={() => setTab('active')}
                className={`flex-1 py-1 px-2 rounded-md transition-all text-center ${
                  tab === 'active'
                    ? 'bg-white shadow-xs text-sky-700 font-semibold dark:bg-slate-700 dark:text-sky-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                Jarayonda ({activeCount})
              </button>
              <button
                type="button"
                onClick={() => setTab('all')}
                className={`flex-1 py-1 px-2 rounded-md transition-all text-center ${
                  tab === 'all'
                    ? 'bg-white shadow-xs text-sky-700 font-semibold dark:bg-slate-700 dark:text-sky-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                Barchasi ({orders.length})
              </button>
            </div>

            {/* Yil va Oy filtrlari (Faqat Barchasi tabida ko‘rinadi) */}
            {tab === 'all' && availableYears.length > 0 ? (
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1 shrink-0">
                  <Calendar className="h-3 w-3 text-sky-600 dark:text-sky-400" />
                  Davr:
                </span>
                <select
                  value={selectedYear}
                  onChange={e => setSelectedYear(Number(e.target.value))}
                  className="w-[5.4rem] text-[11px] font-medium py-1 px-1.5 rounded-md border border-slate-200 bg-white text-slate-800 shadow-2xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                  title="Yilni tanlash"
                >
                  {availableYears.map(yr => (
                    <option key={yr} value={yr}>
                      {yr}-yil
                    </option>
                  ))}
                </select>
                <select
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(Number(e.target.value))}
                  className="flex-1 text-[11px] font-medium py-1 px-1.5 rounded-md border border-slate-200 bg-white text-slate-800 shadow-2xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                  title="Oyni tanlash"
                >
                  {availableMonthsForYear.map(m => (
                    <option key={m.month} value={m.month}>
                      {m.label} ({m.count} ta)
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          {/* Buyurtmalar ro‘yxati */}
          <ul className="party-select__list" role="listbox" aria-label="Buyurtmalar">
            {filteredOrders.length > 0 ? (
              filteredOrders.map(({ order: o, finished, fulfillment }) => {
                const isCurrent = o.id === value;
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isCurrent}
                      className={`party-select__item${isCurrent ? ' party-select__item--active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onChange(o.id);
                        setOpen(false);
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 w-full">
                        <span className="party-select__item-main font-mono text-[12px]">{o.orderNumber}</span>
                        {finished ? (
                          <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                            {o.status === 'Completed' ? 'Tugallangan' : o.status === 'Cancelled' ? 'Bekor qilingan' : o.status}
                          </span>
                        ) : (
                          <span className="shrink-0 rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
                            Faol
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        <span>
                          {formatOrderPeriod(o.year, o.month)}
                          {o.productType ? ` · ${o.productType}` : ''}
                        </span>
                        <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300">
                          {fulfillment.orderedWagons > 0 ? `${fulfillment.remainingWagons} vagon qoldiq` : `${fulfillment.remainingTons} t qoldiq`}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })
            ) : (
              <div className="py-6 px-3 text-center text-xs text-slate-400">
                <p>Mos keluvchi buyurtma topilmadi</p>
                {tab === 'active' && orders.length > activeCount && (
                  <button
                    type="button"
                    onClick={() => setTab('all')}
                    className="mt-2 text-xs font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-400"
                  >
                    Barcha buyurtmalarni ko‘rish ({orders.length}) →
                  </button>
                )}
              </div>
            )}
          </ul>

          {/* Pastki statistika */}
          <div className="px-2.5 py-1.5 border-t border-gray-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 text-[10px] text-slate-400 flex items-center justify-between">
            <span>Ko‘rsatilmoqda: {filteredOrders.length} ta</span>
            <span>Tizim arxivi saqlanadi</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function isOrderFlowFinished(status: string) {
  // Active — tasdiqlash zanjiri tugagan, lekin ishlab turgan amaldagi buyurtma.
  // Uni dashboarddan yashirmaymiz; faqat arxiv/yakuniy holatlar chetga olinadi.
  return ['Completed', 'Rejected', 'Cancelled'].includes(status);
}

function pickDefaultOrderId(orders: MonthlyOrder[]): string | null {
  const sorted = sortOrdersNewestFirst(orders);
  const active = sorted.filter(o => !isOrderFlowFinished(o.status));
  return active[0]?.id ?? null;
}

function OrderProcessSection({
  role,
  orders,
  loading,
  isAdmin,
  selectedOrderId,
}: {
  role: string;
  orders: MonthlyOrder[];
  loading: boolean;
  isAdmin: boolean;
  selectedOrderId: string | null;
  onSelectOrderId?: (orderId: string) => void;
}) {
  const sortedOrders = useMemo(
    () => sortOrdersNewestFirst(excludeOneCOrders(orders)),
    [orders],
  );
  const selectedOrder = useMemo(
    () => sortedOrders.find(o => o.id === selectedOrderId),
    [sortedOrders, selectedOrderId],
  );

  const tiles = useMemo(
    () => orderTiles(role, sortedOrders, selectedOrderId),
    [role, sortedOrders, selectedOrderId],
  );

  const { progressIndex, flowRef, processStarted, allDone } =
    useFlowFocus(tiles, isAdmin, loading);

  const stepStat = allDone
    ? tiles.length
    : processStarted
      ? progressIndex + 1
      : 0;

  return (
    <section className="bento-tile bento-tile--span bento-flow-wrap bento-flow-wrap--plans">
      <div className="flow-head">
        <div className="min-w-0 flex-1">
          <div className="flow-head__title-row">
            <h3 className="bento-steps-title">Buyurtma</h3>
            {selectedOrder ? (
              <span className="inline-flex items-center rounded-xl border border-sky-200 bg-white/90 px-2.5 py-1 text-xs font-semibold text-sky-900 shadow-sm dark:border-sky-500/35 dark:bg-slate-900/80 dark:text-sky-100">
                {selectedOrder.orderNumber}
              </span>
            ) : null}
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 hover:text-sky-800 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300 dark:hover:bg-sky-900/60"
              onClick={() => {
                const el = document.getElementById('intake-process-section') || document.getElementById('loading-process-section');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              <TrainFront className="w-3.5 h-3.5" strokeWidth={2} />
              <span>Tegishli yuklash jarayonlari</span>
            </button>
          </div>
        </div>
        {!loading && tiles.length > 0 ? (
          <div className="flow-head__stat" aria-label={`Bosqich ${stepStat} / ${tiles.length}`}>
            <strong>{stepStat}</strong>
            <span>/ {tiles.length}</span>
          </div>
        ) : null}
      </div>


      {loading ? (
        <div className="flow flow--skeleton" aria-hidden>
          {Array.from({ length: Math.min(6, tiles.length || 4) }).map((_, i) => (
            <div key={i} className="flow__item flow__item--skeleton" />
          ))}
        </div>
      ) : (
        <FlowStepList
          tiles={tiles}
          progressIndex={progressIndex}
          allDone={allDone}
          processStarted={processStarted}
          isAdmin={isAdmin}
          role={role}
          flowRef={flowRef}
          ariaLabel="1. Buyurtma"
        />
      )}
    </section>
  );
}

function WagonProcessSection({
  role,
  arrivals,
  registries,
  loading,
  isAdmin,
}: {
  role: string;
  arrivals: EmptyWagonArrival[];
  registries: LoadingRegistry[];
  loading: boolean;
  isAdmin: boolean;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const focusPhase = searchParams.get('focus');
  const partyFromUrl = searchParams.get('party');
  const scopeFromUrl = searchParams.get('scope') || searchParams.get('registry');

  // Admin bosqich sahifasidan «Orqaga» bilan qaytganda — o‘sha jarayon blokiga aniq va to'g'ri scroll qilinadi.
  useEffect(() => {
    if (!focusPhase || loading) return;
    const targetId = focusPhase.startsWith('wagon-process-') ? focusPhase : `wagon-process-${focusPhase}`;
    const performScroll = () => {
      const el = document.getElementById(targetId) || document.getElementById(`wagon-process-${focusPhase}`);
      if (el) {
        const headerOffset = 90; // Fixed navbar height (64px) + margin
        const elementPosition = el.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
        window.scrollTo({
          top: Math.max(0, offsetPosition),
          behavior: 'smooth',
        });
      }
    };

    const timer = setTimeout(performScroll, 80);
    const cleanupTimer = setTimeout(() => {
      setSearchParams(prev => {
        const p = new URLSearchParams(prev);
        p.delete('focus');
        p.delete('party');
        p.delete('scope');
        p.delete('registry');
        return p;
      }, { replace: true });
    }, 600);

    return () => {
      clearTimeout(timer);
      clearTimeout(cleanupTimer);
    };
  }, [focusPhase, loading, setSearchParams]);

  const parties = useMemo(() => {
    return sortPartiesNewestFirst(
      excludeOneCArrivals(arrivals).filter(a => {
        const s = a.stage || 'KengsoyInspection';
        return s !== 'Cancelled' && !a.arrivalNumber.startsWith('ZF-');
      }),
    );
  }, [arrivals]);

  // Faqat 1C dan avtomatik import qilingan reyestrlar (raqamida «-1C-») chiqarib tashlanadi.
  // Foydalanuvchi yaratgan yuk xati manba partiyasi 1C dan bo‘lsa ham ro‘yxatda qoladi.
  const opsRegistries = useMemo(
    () => registries.filter(r => !(r.registryNumber || '').includes('-1C-')),
    [registries],
  );

  // 1-blok uchun Kiritish xizmat xati
  const defaultPartyId = useMemo(() => pickDefaultPartyId(parties, opsRegistries), [parties, opsRegistries]);
  const [selectedPartyId, setSelectedPartyId] = useState<string | null>(() => {
    if (partyFromUrl) return partyFromUrl;
    try {
      const saved = localStorage.getItem('etransport_dashboard_selected_party_id');
      if (saved) return saved;
    } catch {
      // ignore
    }
    return defaultPartyId;
  });
  const [stagedPartyId, setStagedPartyId] = useState<string | null>(() => selectedPartyId ?? defaultPartyId);
  const [partyJustApplied, setPartyJustApplied] = useState(false);

  useEffect(() => {
    if (partyFromUrl) {
      setSelectedPartyId(partyFromUrl);
      setStagedPartyId(partyFromUrl);
      try {
        localStorage.setItem('etransport_dashboard_selected_party_id', partyFromUrl);
      } catch {
        // ignore
      }
    }
  }, [partyFromUrl]);

  useEffect(() => {
    if (parties.length > 0) {
      if (partyFromUrl) {
        const found = parties.find(
          p => p.id.toLowerCase() === partyFromUrl.toLowerCase() || p.arrivalNumber.toLowerCase() === partyFromUrl.toLowerCase()
        );
        if (found) {
          setSelectedPartyId(found.id);
          setStagedPartyId(found.id);
          return;
        }
      }
      const current = selectedPartyId;
      if (current) {
        const found = parties.find(
          p => p.id.toLowerCase() === current.toLowerCase() || p.arrivalNumber.toLowerCase() === current.toLowerCase()
        );
        if (found && found.id !== current) {
          setSelectedPartyId(found.id);
          setStagedPartyId(found.id);
          return;
        }
      }
      if (!selectedPartyId || !parties.some(p => p.id === selectedPartyId || p.arrivalNumber === selectedPartyId)) {
        if (defaultPartyId) {
          setSelectedPartyId(defaultPartyId);
          setStagedPartyId(defaultPartyId);
        }
      }
    }
  }, [parties, defaultPartyId, selectedPartyId, partyFromUrl]);

  useEffect(() => {
    setStagedPartyId(selectedPartyId);
  }, [selectedPartyId]);

  const hasUnappliedParty = stagedPartyId !== null && stagedPartyId !== selectedPartyId;

  const handleApplyParty = (e: React.MouseEvent) => {
    e.stopPropagation();
    const toApply = stagedPartyId || selectedPartyId || defaultPartyId;
    if (!toApply) return;
    setSelectedPartyId(toApply);
    try {
      localStorage.setItem('etransport_dashboard_selected_party_id', toApply);
    } catch {
      // ignore
    }
    setPartyJustApplied(true);
    setTimeout(() => setPartyJustApplied(false), 2000);
  };

  // 1-jarayon: Vagonlarni kiritish — Kiritish xizmat xati (partiya) bo‘yicha, Tara bilan yakunlanadi.
  const entry = useMemo(
    () => entryTiles(role, parties, opsRegistries, selectedPartyId),
    [role, parties, opsRegistries, selectedPartyId],
  );
  const entryFlow = useFlowFocus(entry, isAdmin, loading);

  // 2-jarayon: Vagonlarni yuklash va chiqarish — yuk xati (reyestr) bo‘yicha, kiritishdan mustaqil.
  // Yuklash fondi va reyestr doirasi barcha partiyalarni qamraydi (ichki ZF- fond vagonlari ham).
  const loadingArrivals = useMemo(
    () => arrivals.filter(a => (a.stage || 'KengsoyInspection') !== 'Cancelled'),
    [arrivals],
  );
  const poolCount = useMemo(
    () => scopeArrivalsForPool(loadingArrivals, opsRegistries).reduce((acc, a) => acc + (a.wagons?.length ?? 0), 0),
    [loadingArrivals, opsRegistries],
  );
  const defaultScopeId = useMemo(
    () => pickDefaultLoadingScopeId(opsRegistries, poolCount),
    [opsRegistries, poolCount],
  );
  const [selectedScopeId, setSelectedScopeId] = useState<string | null>(() => {
    if (scopeFromUrl) return scopeFromUrl;
    try {
      const saved = localStorage.getItem('etransport_dashboard_selected_registry_id');
      if (saved) return saved;
    } catch {
      // ignore
    }
    return defaultScopeId;
  });
  const [stagedScopeId, setStagedScopeId] = useState<string | null>(() => selectedScopeId ?? defaultScopeId);
  const [scopeJustApplied, setScopeJustApplied] = useState(false);

  useEffect(() => {
    if (scopeFromUrl) {
      setSelectedScopeId(scopeFromUrl);
      setStagedScopeId(scopeFromUrl);
      try {
        localStorage.setItem('etransport_dashboard_selected_registry_id', scopeFromUrl);
      } catch {
        // ignore
      }
    }
  }, [scopeFromUrl]);

  useEffect(() => {
    if (opsRegistries.length > 0 && scopeFromUrl) {
      const found = opsRegistries.find(
        r => r.id.toLowerCase() === scopeFromUrl.toLowerCase() || (r.registryNumber && r.registryNumber.toLowerCase() === scopeFromUrl.toLowerCase())
      );
      if (found) {
        setSelectedScopeId(found.id);
        setStagedScopeId(found.id);
      }
    }
  }, [opsRegistries, scopeFromUrl]);

  useEffect(() => {
    if (loading) return;
    const valid = selectedScopeId === POOL_SCOPE_ID || opsRegistries.some(r => r.id === selectedScopeId);
    if (!valid && defaultScopeId) {
      setSelectedScopeId(defaultScopeId);
      setStagedScopeId(defaultScopeId);
    }
  }, [loading, opsRegistries, defaultScopeId, selectedScopeId]);

  useEffect(() => {
    if (!selectedPartyId || loading) return;
    const matchReg = opsRegistries.find(r =>
      !isRegistryFullyFinished(r) && (
        (r.emptyWagonArrivalId ?? '').toLowerCase() === selectedPartyId.toLowerCase() ||
        (r.wagonRoutes ?? []).some(w => (w.sourceArrivalId ?? '').toLowerCase() === selectedPartyId.toLowerCase())
      ),
    );
    if (matchReg && matchReg.id !== selectedScopeId) {
      setSelectedScopeId(matchReg.id);
      setStagedScopeId(matchReg.id);
      try {
        localStorage.setItem('etransport_dashboard_selected_registry_id', matchReg.id);
      } catch {
        // ignore
      }
    }
  }, [selectedPartyId, opsRegistries, loading, selectedScopeId]);

  useEffect(() => {
    setStagedScopeId(selectedScopeId);
  }, [selectedScopeId]);

  const hasUnappliedScope = stagedScopeId !== null && stagedScopeId !== selectedScopeId;

  const handleApplyScope = (e: React.MouseEvent) => {
    e.stopPropagation();
    const toApply = stagedScopeId || selectedScopeId || defaultScopeId;
    if (!toApply) return;
    setSelectedScopeId(toApply);
    try {
      localStorage.setItem('etransport_dashboard_selected_registry_id', toApply);
    } catch {
      // ignore
    }
    setScopeJustApplied(true);
    setTimeout(() => setScopeJustApplied(false), 2000);
  };

  const loadingScope = useMemo<LoadingScope>(() => {
    const reg = selectedScopeId && selectedScopeId !== POOL_SCOPE_ID
      ? opsRegistries.find(r => r.id === selectedScopeId)
      : undefined;
    return reg ? { kind: 'registry', registry: reg } : { kind: 'pool' };
  }, [selectedScopeId, opsRegistries]);

  const exit = useMemo(
    () => loadingTiles(role, loadingArrivals, opsRegistries, loadingScope, selectedPartyId),
    [role, loadingArrivals, opsRegistries, loadingScope, selectedPartyId],
  );
  const exitFlow = useFlowFocus(exit, isAdmin, loading);

  const partyReturnedRegistries = useMemo(() => {
    return opsRegistries.filter(isRegistryReturned);
  }, [opsRegistries]);

  const flowAlertTile = exit.find(t => t.alert);

  const phases = [
    { ...WAGON_PHASES[0], tiles: entry, flow: entryFlow },
    { ...WAGON_PHASES[1], tiles: exit, flow: exitFlow },
  ];

  return (
    <div className="bento-tile--span flex flex-col gap-3 min-w-0">
      {!loading && partyReturnedRegistries.length > 0 ? (
        <div className="wagon-flow-alert" role="alert">
          <AlertTriangle className="wagon-flow-alert__icon" strokeWidth={2} />
          <div className="min-w-0">
            <p className="wagon-flow-alert__title">Yuk xati qaytarildi — iqtisodchi tahriri talab etiladi</p>
            {partyReturnedRegistries.flatMap(registryRejectionSummary).map((line, idx) => (
              <p key={idx} className="wagon-flow-alert__detail">{line}</p>
            ))}
          </div>
          {flowAlertTile && (flowAlertTile.canOpen || isAdmin) ? (
            <Link
              to={withFromDashboard(partyReturnedRegistries[0]?.id
                ? `/registry?expanded=reg:${partyReturnedRegistries[0].id}`
                : flowAlertTile.to)}
              state={{ from: '/dashboard' }}
              className="wagon-flow-alert__link"
            >
              Reyestrga o‘tish
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* Ikki mustaqil jarayon (kiritish — xizmat xati, yuklash-chiqarish — yuk xati) bitta
          umumiy kartada, ilon ko‘rinishida: kiritilgan vagonlar yuklash fondiga o‘tadi. */}
      <section
        id="wagon-process-section"
        className="bento-tile bento-flow-wrap wagon-process-panel wagon-process-panel--merged"
        aria-label="Vagonlar jarayoni"
      >
      <div className="wagon-process-panels">
        {phases.map((phase, phaseIdx) => {
          const { tiles, flow } = phase;
          const { progressIndex, flowRef, processStarted, allDone } = flow;
          const numberedTiles = tiles.filter(t => !t.skipCount);
          const stepCount = numberedTiles.length;
          const stepStat = allDone
            ? stepCount
            : processStarted
              ? Math.min(stepCount, Math.max(0, tiles.slice(0, progressIndex + 1).filter(t => !t.skipCount).length))
              : 0;
          const isEntry = phase.key === 'kirish';
          return (
            <div key={phase.key} className="wagon-process-panels__item flex flex-col gap-2.5 min-w-0">
              <section
                id={`wagon-process-${phase.key}`}
                style={{ scrollMarginTop: 90 }}
                className={`wagon-process-row${allDone ? ' wagon-process-row--done' : processStarted ? ' wagon-process-row--current' : ''}`}
                aria-labelledby={`wagon-phase-${phase.key}`}
              >
                <div className="wagon-process-row__head">
                  <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                    <h4 id={`wagon-phase-${phase.key}`} className="wagon-process-row__title">
                      {phase.title}
                    </h4>
                    {isEntry ? (
                      <>
                        <PartySelect
                          parties={parties}
                          registries={opsRegistries}
                          value={stagedPartyId ?? selectedPartyId}
                          onChange={id => {
                            setStagedPartyId(id);
                            setSelectedPartyId(id);
                            try {
                              if (id) {
                                localStorage.setItem('etransport_dashboard_selected_party_id', id);
                              } else {
                                localStorage.removeItem('etransport_dashboard_selected_party_id');
                              }
                            } catch {
                              // ignore
                            }
                            setPartyJustApplied(true);
                            setTimeout(() => setPartyJustApplied(false), 2000);
                          }}
                          disabled={loading}
                        />
                        <button
                          type="button"
                          className={`order-apply-btn${hasUnappliedParty ? ' order-apply-btn--pending' : ' order-apply-btn--idle'}${partyJustApplied ? ' order-apply-btn--applied' : ''}`}
                          onClick={handleApplyParty}
                          disabled={loading}
                          title="Tanlangan kiritish xizmat xatini qo‘llash va saqlash"
                        >
                          <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} />
                          <span>{partyJustApplied ? "Qo‘llandi" : "Qo‘llash"}</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <RegistrySelect
                          registries={opsRegistries}
                          poolCount={poolCount}
                          value={stagedScopeId ?? selectedScopeId}
                          onChange={id => {
                            setStagedScopeId(id);
                            setSelectedScopeId(id);
                            try {
                              localStorage.setItem('etransport_dashboard_selected_registry_id', id);
                            } catch {
                              // ignore
                            }
                            setScopeJustApplied(true);
                            setTimeout(() => setScopeJustApplied(false), 2000);
                          }}
                          disabled={loading}
                        />
                        <button
                          type="button"
                          className={`order-apply-btn${hasUnappliedScope ? ' order-apply-btn--pending' : ' order-apply-btn--idle'}${scopeJustApplied ? ' order-apply-btn--applied' : ''}`}
                          onClick={handleApplyScope}
                          disabled={loading}
                          title="Tanlangan yuk xatini qo‘llash va saqlash"
                        >
                          <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} />
                          <span>{scopeJustApplied ? "Qo‘llandi" : "Qo‘llash"}</span>
                        </button>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`wagon-phase__status ${allDone ? 'wagon-phase__status--done' : processStarted ? 'wagon-phase__status--live' : ''}`}>
                      {allDone ? 'TAYYOR' : processStarted ? 'JARAYONDA' : 'KUTILMOQDA'}
                    </span>
                    <div className="flow-head__stat" aria-label={`Bosqich ${loading ? 0 : stepStat} / ${stepCount}`}>
                      <strong>{loading ? 0 : stepStat}</strong>
                      <span>/ {stepCount}</span>
                    </div>
                  </div>
                </div>
                {loading ? (
                  <div className="flow flow--skeleton" aria-hidden>
                    {tiles.map(tile => <div key={tile.key} className="flow__item flow__item--skeleton" />)}
                  </div>
                ) : (
                  <FlowStepList
                    tiles={tiles}
                    progressIndex={progressIndex}
                    allDone={allDone}
                    processStarted={processStarted}
                    isAdmin={isAdmin}
                    role={role}
                    flowRef={flowRef}
                    numberOffset={0}
                    restartNumbering
                    reverse={false}
                    ariaLabel={phase.title}
                    returnFocus={
                      isEntry
                        ? `/dashboard?focus=kirish${selectedPartyId ? `&party=${encodeURIComponent(selectedPartyId)}` : ''}`
                        : `/dashboard?focus=yuklash${selectedScopeId ? `&scope=${encodeURIComponent(selectedScopeId)}` : ''}`
                    }
                  />
                )}
              </section>

              {phaseIdx === 0 && (
                <div className="wagon-process-divider" aria-hidden="true">
                  <div className="wagon-process-divider__line" />
                  <div className={`wagon-process-divider__pill ${entryFlow.allDone ? 'wagon-process-divider__pill--done' : ''}`}>
                    <ArrowDown className={`w-3.5 h-3.5 shrink-0 transition-colors ${entryFlow.allDone ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} strokeWidth={2.5} />
                    <span>Kiritilgan vagonlar yuklash fondiga o‘tadi</span>
                  </div>
                  <div className="wagon-process-divider__line" />
                </div>
              )}
            </div>
          );
        })}
      </div>
      </section>
    </div>
  );
}


type OverviewKey = 'orders' | 'wagons' | 'history';

const OVERVIEW_LINKS: Record<OverviewKey, string> = {
  orders: '/orders/railway?view=faol',
  wagons: '/transport/tared',
  history: '/history',
};

function renderWagonCount(total: number, _majmua?: number, isDanger = false) {
  if (total === 0) {
    return <span className="dash-wagon-count dash-wagon-count--zero text-slate-400 dark:text-slate-500 font-bold text-[18px]">0</span>;
  }

  return (
    <span
      className={`dash-wagon-count ${isDanger ? 'dash-wagon-count--danger text-rose-600 dark:text-rose-400 font-bold' : 'text-slate-800 dark:text-slate-100 font-bold'} text-[18px]`}
    >
      <span className="tabular-nums text-[18px]">{total}</span>
    </span>
  );
}

function WagonCountHoverBadge({
  total,
  majmua,
  loading,
  dash,
}: {
  total: number;
  majmua: number;
  loading: boolean;
  dash: string;
}) {
  if (loading) {
    return <span className="wagon-single-count">{dash}</span>;
  }

  const external = Math.max(0, total - majmua);

  return (
    <div className="relative group/wbadge inline-flex items-center">
      {/* Bitta yagona raqam (oldingidek 25) */}
      <span
        className="wagon-single-count tabular-nums cursor-pointer select-none"
        tabIndex={0}
        role="button"
        aria-label={`Jami ${total} ta vagon (shundan ${majmua} ta Majmua, ${external} ta Tashqi)`}
      >
        {total}
      </span>

      {/* 25 hover qilinganda 4 burchakli nozik ko'rsatkich (pastda chiqadi) */}
      <div
        className="pointer-events-none absolute right-0 top-[calc(100%+6px)] z-50 rounded border border-slate-300 bg-white px-2.5 py-1 shadow-sm transition-all duration-150 opacity-0 invisible -translate-y-1 group-hover/wbadge:opacity-100 group-hover/wbadge:visible group-hover/wbadge:translate-y-0 dark:border-slate-600 dark:bg-slate-800 whitespace-nowrap"
        role="tooltip"
      >
        {/* Bir qatorda Majmuaga tegishli va Tashqi vagonlar */}
        <div className="flex items-center gap-2 text-[11px]">
          <div className="inline-flex items-center gap-1.5 text-blue-700 dark:text-blue-300">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
            <span className="font-normal text-slate-600 dark:text-slate-400">Majmuaga tegishli:</span>
            <strong className="font-bold tabular-nums text-blue-800 dark:text-blue-200">
              {majmua} ta
            </strong>
          </div>

          <span className="h-2.5 w-px bg-slate-200 dark:bg-slate-600" />

          <div className="inline-flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 shrink-0" />
            <span className="font-normal text-slate-600 dark:text-slate-400">Tashqi vagonlar:</span>
            <strong className="font-bold tabular-nums text-indigo-800 dark:text-indigo-200">
              {external} ta
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardOverviewPanel({
  overview: _overview,
  loading,
  orders = [],
  arrivals = [],
  registries = [],
  selectedOrderId,
  onSelectOrderId,
}: {
  overview?: DashboardOverview;
  loading: boolean;
  role?: string;
  orders?: MonthlyOrder[];
  arrivals?: EmptyWagonArrival[];
  registries?: LoadingRegistry[];
  selectedOrderId: string | null;
  onSelectOrderId: (orderId: string) => void;
}) {
  const navigate = useNavigate();
  const dash = '—';
  const sortedOrders = useMemo(
    () => sortOrdersNewestFirst(excludeOneCOrders(orders)),
    [orders],
  );
  const activeExecutionOrders = useMemo(
    () => sortedOrders.filter(order => !isOrderFlowFinished(order.status)),
    [sortedOrders],
  );

  const orderFulfillments = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeOrderFulfillment>>();
    for (const o of activeExecutionOrders) {
      map.set(o.id, computeOrderFulfillment(o));
    }
    return map;
  }, [activeExecutionOrders]);

  const [stagedOrderId, setStagedOrderId] = useState<string | null>(selectedOrderId);
  const [justApplied, setJustApplied] = useState(false);

  useEffect(() => {
    setStagedOrderId(selectedOrderId);
  }, [selectedOrderId]);

  const activeId = stagedOrderId ?? selectedOrderId;

  const currentSelectedOrder = useMemo(() => {
    if (activeId) {
      const found = activeExecutionOrders.find(o => o.id === activeId)
        || sortedOrders.find(o => o.id === activeId);
      if (found) return found;
    }
    return activeExecutionOrders[0] || sortedOrders[0] || null;
  }, [activeId, activeExecutionOrders, sortedOrders]);

  const hasUnapplied = stagedOrderId !== null && stagedOrderId !== selectedOrderId;

  const handleApplyOrder = (e: React.MouseEvent) => {
    e.stopPropagation();
    const toApply = stagedOrderId || selectedOrderId || currentSelectedOrder?.id;
    if (!toApply) return;
    onSelectOrderId(toApply);
    setJustApplied(true);
    setTimeout(() => setJustApplied(false), 2000);
  };

  const currentFulfillment = useMemo(() => {
    if (!currentSelectedOrder) {
      return {
        orderedWagons: 0,
        orderedTons: 0,
        fulfilledWagons: 0,
        fulfilledTons: 0,
        remainingWagons: 0,
        remainingTons: 0,
      };
    }
    return orderFulfillments.get(currentSelectedOrder.id) || computeOrderFulfillment(currentSelectedOrder);
  }, [currentSelectedOrder, orderFulfillments]);

  const transportCounts = useMemo(
    () => computeTransportFlowMetrics(arrivals, registries),
    [arrivals, registries],
  );

  const historyCounts = useMemo(() => {
    const cleanArrivals = excludeOneCArrivals(arrivals);
    const today = localDateKey(new Date().toISOString());

    // 1. Bugun qabul qilingan vagonlar (har bir partiya faqat 1 marta hisoblanadi)
    const todayEntries = cleanArrivals.filter(a => {
      const stamp = a.arrivalDate || a.createdAt;
      return stamp && localDateKey(stamp) === today;
    });
    const entries = todayEntries.reduce((s, a) => s + wagonCountOf(a), 0);

    // 2. Bugun yuklangan vagonlar
    const loads = cleanArrivals.reduce((sum, a) => {
      if (a.loadingCompletedAt && localDateKey(a.loadingCompletedAt) === today) {
        return sum + loadedWagonCountOf(a);
      }
      const loadedWagonsToday = (a.wagons ?? []).filter(
        w => w.loadingCompletedAt && localDateKey(w.loadingCompletedAt) === today
      ).length;
      return sum + loadedWagonsToday;
    }, 0);

    // 3. Bugun Kengsoy stansiyasiga jo'natilgan vagonlar
    const todayExits = (registries || []).filter(r => {
      const stamp = r.exitedToKengsoyAt;
      return stamp && localDateKey(stamp) === today;
    });
    const exits = todayExits.reduce((s, r) => s + registryWagonCountOf(r), 0);

    return {
      all: entries + loads + exits,
      entries,
      loads,
      exits,
    };
  }, [arrivals, registries]);

  const goOrderFulfillment = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentSelectedOrder) return;
    navigate('/orders/railway?view=faol&open=' + currentSelectedOrder.id + '#order-fulfillment');
  };

  return (
    <section className="dash-kpi" aria-label="Boshqaruv ko‘rsatkichlari">
      <HubZoneTabs
        label="Kunlik holat"
        columns={3}
        size="tall"
        value={null}
        onChange={id => navigate(OVERVIEW_LINKS[id])}
        items={[
          {
            id: 'orders' as const,
            containerOnly: true,
            label: (
              <span className="order-header-wrap">
                <span>Buyurtmalar</span>
                <span className="order-header-wrap__controls">
                  <OrderSelect
                    orders={sortedOrders}
                    value={currentSelectedOrder?.id ?? null}
                    onChange={id => {
                      setStagedOrderId(id);
                      setJustApplied(false);
                    }}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className={`order-apply-btn${hasUnapplied ? ' order-apply-btn--pending' : ' order-apply-btn--idle'}${justApplied ? ' order-apply-btn--applied' : ''}`}
                    onClick={handleApplyOrder}
                    disabled={loading}
                    title="Tanlangan buyurtmani qo‘llash va saqlash"
                  >
                    <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} />
                    <span>{justApplied ? "Qo‘llandi" : "Qo‘llash"}</span>
                  </button>
                </span>
              </span>
            ),
            hint: (
              <span>
                {currentSelectedOrder?.productType ? `${currentSelectedOrder.productType} · ` : ''}
                Qoldiq yuk xati bilan kamayadi
              </span>
            ),
            icon: ClipboardList,
            tone: 'sky' as HubZoneTone,
            count: loading ? dash : activeExecutionOrders.length,
            metrics: [
              {
                label: 'Tanlangan buyurtma qoldig‘i',
                value: loading ? dash : currentFulfillment.remainingWagons,
                actionLabel: currentSelectedOrder?.orderNumber
                  ? `${currentSelectedOrder.orderNumber} ijro holatini ochish`
                  : undefined,
                onClick: currentSelectedOrder ? goOrderFulfillment : undefined,
              },
              {
                label: 'Tanlangan buyurtma hajmi, t',
                value: loading ? dash : formatDashboardTon(currentFulfillment.remainingTons),
                actionLabel: currentSelectedOrder?.orderNumber
                  ? `${currentSelectedOrder.orderNumber} ijro holatini ochish`
                  : undefined,
                onClick: currentSelectedOrder ? goOrderFulfillment : undefined,
              },
              {
                label: 'Jami faol buyurtmalar',
                value: loading ? dash : activeExecutionOrders.length,
                actionLabel: 'Faol buyurtmalarni filtrlash',
                tone: 'sky',
                onClick: (e: React.MouseEvent) => {
                  e.stopPropagation();
                  navigate('/orders/railway?view=faol');
                },
              },
            ],
          },
          {
            id: 'wagons' as const,
            label: 'Majmuadagi vagonlar',
            hint: 'Zavod hududida · SHGKM',
            icon: TrainFront,
            tone: 'sisterna' as HubZoneTone,
            className: 'hub-tab--transport-featured',
            containerOnly: true,
            count: (
              <WagonCountHoverBadge
                total={transportCounts.onSite.total}
                majmua={transportCounts.onSite.majmua}
                loading={loading}
                dash={dash}
              />
            ),
            metrics: [
              {
                label: 'Yuklashga tayyor',
                value: loading ? dash : renderWagonCount(transportCounts.tared.total, transportCounts.tared.majmua),
                actionLabel: 'Yuklashga tayyor vagonlar monitoringiga o‘tish',
                tone: 'sky',
                onClick: e => {
                  e.stopPropagation();
                  navigate('/transport/tared');
                },
              },
              {
                label: 'Yuklanmoqda',
                value: loading ? dash : renderWagonCount(transportCounts.loading.total, transportCounts.loading.majmua),
                actionLabel: 'Yuklanayotgan vagonlar monitoringiga o‘tish',
                tone: 'amber',
                onClick: e => {
                  e.stopPropagation();
                  navigate('/transport/loading');
                },
              },
              {
                label: 'Yuklangan',
                value: loading ? dash : renderWagonCount(transportCounts.loaded.total, transportCounts.loaded.majmua),
                actionLabel: 'Yuklangan vagonlar monitoringiga o‘tish',
                tone: 'default',
                onClick: e => {
                  e.stopPropagation();
                  navigate('/transport/loaded');
                },
              },
              {
                label: 'Chiqishga tayyor',
                value: loading ? dash : renderWagonCount(transportCounts.ready.total, transportCounts.ready.majmua),
                actionLabel: 'Chiqishga tayyor vagonlar monitoringiga o‘tish',
                tone: 'emerald',
                onClick: e => {
                  e.stopPropagation();
                  navigate('/transport/ready');
                },
              },
            ],
          },
          {
            id: 'history' as const,
            label: 'Bugungi jarayonlar',
            hint: 'Joriy kun faoliyati',
            icon: History,
            tone: 'done' as HubZoneTone,
            containerOnly: true,
            count: loading ? dash : historyCounts.all,
            metrics: [
              {
                label: 'Kirish',
                value: loading ? dash : historyCounts.entries,
                actionLabel: 'Bugungi kirish tarixini ochish',
                tone: 'sky',
                onClick: e => {
                  e.stopPropagation();
                  navigate('/history?tab=entries&period=today');
                },
              },
              {
                label: 'Yuklash',
                value: loading ? dash : historyCounts.loads,
                actionLabel: 'Bugungi yuklash tarixini ochish',
                tone: 'amber',
                onClick: e => {
                  e.stopPropagation();
                  navigate('/history?tab=loads&period=today');
                },
              },
              {
                label: 'Chiqish',
                value: loading ? dash : historyCounts.exits,
                actionLabel: 'Bugungi chiqish tarixini ochish',
                tone: 'emerald',
                onClick: e => {
                  e.stopPropagation();
                  navigate('/history?tab=exits&period=today');
                },
              },
            ],
          },
        ]}
      />
    </section>
  );
}


export default function DashboardPage() {
  const { user } = useAuth();
  const role = user?.role || '';
  const isAdmin = role.toLowerCase() === 'admin' || role === 'Admin';
  /** Kelishuv rollari ham yuklash zanjirini kuzatadi (amallar roli bo‘yicha qulflanadi). */
  const showWagons = roleSeesSegment(role, 'wagons')
    || role === 'Accounting'
    || role === 'DeputyDirector'
    // ICHDX boshlig‘i operatsion bosqichlarni bajarmaydi, lekin buyurtma
    // ijroga qabul qilingandan keyingi 12 bosqichni to‘liq kuzatishi kerak.
    || role === 'DispatchSupervisor';

  const [arrivals, setArrivals] = useState<EmptyWagonArrival[]>([]);
  const [orders, setOrders] = useState<MonthlyOrder[]>([]);
  const [registries, setRegistries] = useState<LoadingRegistry[]>([]);
  const [loading, setLoading] = useState(true);

  const sortedOrders = useMemo(
    () => sortOrdersNewestFirst(excludeOneCOrders(orders)),
    [orders],
  );
  const activeOrders = useMemo(
    () => sortedOrders.filter(o => !isOrderFlowFinished(o.status)),
    [sortedOrders],
  );

  const DASHBOARD_ORDER_STORAGE_KEY = 'etransport_dashboard_selected_order_id';

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('etransport_dashboard_selected_order_id');
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (sortedOrders.length === 0) {
      if (selectedOrderId !== null) setSelectedOrderId(null);
      return;
    }
    const savedId = (() => {
      try {
        return localStorage.getItem(DASHBOARD_ORDER_STORAGE_KEY);
      } catch {
        return null;
      }
    })();
    const candidateId = selectedOrderId || savedId;
    const exists = sortedOrders.some(o => o.id === candidateId);
    if (candidateId && exists) {
      if (selectedOrderId !== candidateId) setSelectedOrderId(candidateId);
      return;
    }
    const defaultId = pickDefaultOrderId(activeOrders) || sortedOrders[0]?.id || null;
    setSelectedOrderId(defaultId);
  }, [sortedOrders, activeOrders, selectedOrderId]);

  const handleApplyOrderId = (id: string) => {
    setSelectedOrderId(id);
    try {
      localStorage.setItem(DASHBOARD_ORDER_STORAGE_KEY, id);
    } catch (e) {
      console.error(e);
    }
  };

  const load = (silent = false) => {
    if (!silent) setLoading(true);
    Promise.allSettled([
      api.getEmptyWagonArrivals(),
      api.getOrders(LOGISTICS_TYPES.Railway),
      api.getLoadingRegistries(),
    ])
      .then(([arrivalsRes, ordersRes, regRes]) => {
        if (arrivalsRes.status === 'fulfilled') setArrivals(arrivalsRes.value.data ?? []);
        if (ordersRes.status === 'fulfilled') setOrders(ordersRes.value.data ?? []);
        if (regRes.status === 'fulfilled') setRegistries(regRes.value.data ?? []);
      })
      .finally(() => {
        if (!silent) setLoading(false);
      });
  };

  useEffect(() => {
    load();
    const unsub = subscribeOrdersChanged(() => load(true));
    const stopPoll = startAutoRefresh(() => load(true), 30000);
    return () => {
      unsub();
      stopPoll();
    };
  }, []);

  const overview = useMemo(
    () => computeDashboardOverview(orders, arrivals, registries),
    [orders, arrivals, registries],
  );

  return (
    <div className={`bento${showWagons ? ' bento--fit-processes' : ''}`}>
      <div className="bento__grid">
        <div className="bento-tile--span">
          <DashboardOverviewPanel
            overview={overview}
            loading={loading}
            role={role}
            orders={orders}
            arrivals={arrivals}
            registries={registries}
            selectedOrderId={selectedOrderId}
            onSelectOrderId={handleApplyOrderId}
          />
        </div>

        <OrderProcessSection
          role={role}
          orders={orders}
          loading={loading}
          isAdmin={isAdmin}
          selectedOrderId={selectedOrderId}
          onSelectOrderId={handleApplyOrderId}
        />
        {showWagons ? (
          <WagonProcessSection
            role={role}
            arrivals={arrivals}
            registries={registries}
            loading={loading}
            isAdmin={isAdmin}
          />
        ) : null}

      </div>
    </div>
  );
}
