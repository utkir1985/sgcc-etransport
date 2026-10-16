import type { DailyPlan, EmptyWagonArrival, MonthlyOrder } from '../types';
import { ROLE_MENUS } from '../../modules/admin/rbacCatalog';
import { toLatinProductName } from './cyrillicToLatin';
import { formatDateDisplay } from './dates';
import { hasDefectAct } from '../constants/defectActTypes';

export interface RoleNotification {
  id: string;
  title: string;
  subtitle: string;
  to: string;
  badge?: string;
  createdAt: string;
  priority: number;
}

const WAGON_STAGE_LABELS: Record<string, string> = {
  RailwayInspected: 'Vagon raqami kiritilgan',
  KengsoyInspection: 'Vagonni olib kirish',
  SecurityInspection: 'Kirish ruxsati',
  ReadyForEstakada: 'Tara kutilyapti',
  TareWeighing: 'Tara',
  EstakadaPlaced: 'Estakadaga qo‘yilgan',
  Loading: 'Yuklanmoqda',
  Loaded: 'Yuklangan',
  ToRailwayScale: 'Brutto kutilyapti',
  GrossWeighed: 'Brutto o‘lchangan',
  SealInstallation: 'Plomba o‘rnatish',
  SealPending: 'Plomba tasdiqi',
  Sealed: 'Muhrlangan',
};

const DEPT_BY_ROLE: Record<string, string> = {
  Marketing: 'MS va MX xizmati',
  MarketingStaff: 'MS va MX xizmati',
  Management: 'MS va MX xizmati',
  Railway: "Temir yo'l sexi",
  Warehouse: 'TM va XA smena muxandisi',
  Security: "Qo'riqlash xizmati",
  Permit: 'Ruxsatnoma byurosi',
  Dispatching: 'ICHDX smena boshlig‘i',
  DispatchSupervisor: 'ICHDX boshlig‘i',
};

const PATH_MENU_KEYS: Record<string, string[]> = {
  '/empty-wagons': ['empty-wagons'],
  '/railway-intake': ['railway-intake'],
  '/weighing': ['weighing'],
  '/loading': ['loading'],
  '/seals': ['seals'],
  '/seals/scale': ['seals'],
  '/seals/security': ['seals'],
  '/registry': ['registry'],
  '/registry/create': ['registry-create'],
  '/registry/approve': ['registry-approve'],
  '/registry/agree': ['registry', 'registry-agree-security', 'registry-agree-permit'],
  '/registry/agree/permit': ['registry-agree-permit'],
  '/registry/agree/security': ['registry-agree-security'],
  '/plans': ['plans', 'plans-accounting'],
  '/orders': ['orders'],
  '/order-approvals': ['order-approvals'],
  '/order-deputy-approvals': ['order-deputy-approvals'],
  '/order-dispatch-approvals': ['order-dispatch-approvals'],
};

function canOpenPath(role: string, path: string): boolean {
  if (role === 'Admin') return true;
  const base = path.split('?')[0];
  if (base.startsWith('/seals')) {
    return new Set(ROLE_MENUS[role] ?? []).has('seals');
  }
  const keys = PATH_MENU_KEYS[base]
    ?? (base.startsWith('/transport') ? ['transport'] : undefined)
    ?? (base.startsWith('/orders') ? ['orders'] : undefined);
  if (!keys) return false;
  const menus = new Set(ROLE_MENUS[role] ?? []);
  if (keys.some(k => menus.has(k))) return true;
  if (base === '/registry/create' && menus.has('registry')) return true;
  if (base === '/registry/approve' && menus.has('registry')) return true;
  return false;
}

function stageOf(a: EmptyWagonArrival): string {
  return a.stage || 'KengsoyInspection';
}

function parseList(value?: string[] | string | null): string[] {
  if (Array.isArray(value)) return value.map(v => v.trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map(v => v.trim()).filter(Boolean);
  }
  return [];
}

function dateMeta(iso?: string): string {
  if (!iso) return '';
  return formatDateDisplay(iso.slice(0, 10));
}

function emptyWagonsLink(id: string, step?: 1 | 2 | 'defectActs' | 'gateCheck'): string {
  const sp = new URLSearchParams();
  if (step === 'defectActs') sp.set('work', 'defectActs');
  else if (step === 'gateCheck') sp.set('work', 'gateCheck');
  else if (step) sp.set('step', String(step));
  sp.set('arrivalId', id);
  return `/empty-wagons?${sp.toString()}`;
}

function pendingDefectActUnits(a: EmptyWagonArrival) {
  return (a.wagons ?? []).filter(u => u.status === 'Returned' && !hasDefectAct(u));
}

function resolveWagonTarget(role: string, a: EmptyWagonArrival): string | null {
  const stage = stageOf(a);
  if (pendingDefectActUnits(a).length > 0 && (role === 'Railway' || role === 'Admin') && canOpenPath(role, '/empty-wagons')) {
    return emptyWagonsLink(a.id, 'defectActs');
  }
  if (stage === 'RailwayInspected') {
    if (role === 'Dispatching' || role === 'Admin') return '/empty-wagons';
    if (canOpenPath(role, '/railway-intake')) return '/railway-intake';
  }
  if (stage === 'KengsoyInspection' && (role === 'Railway' || role === 'Admin')) {
    return emptyWagonsLink(a.id, 1);
  }
  if (stage === 'SecurityInspection' && (role === 'Security' || role === 'Permit' || role === 'Admin')) {
    return emptyWagonsLink(a.id, 'gateCheck');
  }
  if ((stage === 'ReadyForEstakada' || stage === 'TareWeighing') && (role === 'Scale' || role === 'Admin')) {
    const needsTare = (a.wagons ?? []).some(u => u.status !== 'Returned' && !String(u.tareWeight ?? '').trim())
      || ((a.wagons ?? []).length === 0 && !String(a.tareWeight ?? '').trim());
    if (needsTare && canOpenPath(role, '/weighing')) return '/weighing';
  }
  if ((stage === 'ReadyForEstakada' || stage === 'TareWeighing') && (role === 'Railway' || role === 'Admin')) {
    return emptyWagonsLink(a.id, 2);
  }
  if (stage === 'EstakadaPlaced' || stage === 'Loading') {
    if ((role === 'Warehouse' || role === 'Admin') && canOpenPath(role, '/loading')) return '/loading';
  }
  if (['GrossWeighed', 'SealInstallation', 'SealPending', 'ToRailwayScale'].includes(stage)) {
    if (role === 'Economist' && canOpenPath(role, '/registry/create')) return `/registry/create?arrivalId=${a.id}`;
    if (canOpenPath(role, '/seals')) return '/seals';
    if (canOpenPath(role, '/registry')) return '/registry';
  }
  if (stage === 'Sealed') {
    if (role === 'Economist' && canOpenPath(role, '/registry/create')) {
      return `/registry/create?arrivalId=${a.id}`;
    }
    if (canOpenPath(role, '/registry')) return '/registry';
    if (canOpenPath(role, '/seals')) return '/seals';
  }

  const dept = DEPT_BY_ROLE[role];
  const notified = parseList(a.notifiedDepartments);
  if (dept && notified.includes(dept) && canOpenPath(role, '/empty-wagons')) {
    return emptyWagonsLink(a.id);
  }
  return null;
}

function wagonActionTitle(role: string, a: EmptyWagonArrival): string | null {
  const stage = stageOf(a);
  const base = `${a.wagonCount} ta · ${toLatinProductName(a.productType) || a.arrivalNumber}`;
  const pendingDefects = pendingDefectActUnits(a);

  if (pendingDefects.length > 0 && (role === 'Railway' || role === 'Admin')) {
    return `Dalolatnoma tuzish: ${pendingDefects.length} ta nomuvofiq · ${a.arrivalNumber}`;
  }

  if (stage === 'RailwayInspected' && (role === 'Dispatching' || role === 'Admin')) {
    return `Temir yo‘l vagon kiritdi — xabarnoma yarating (${base})`;
  }
  if (stage === 'KengsoyInspection' && (role === 'Railway' || role === 'Admin')) {
    const returned = /Qo['‘]riqlash kamchilik|Tara kamchilik/i.test(a.notes || '');
    return returned
      ? /Tara kamchilik/i.test(a.notes || '')
        ? `Tara kamchilik — tuzatib / olib chiqing: ${base}`
        : `Qo‘riqlash kamchilik topdi — tuzatib qayta yuboring: ${base}`
      : `Qo‘riqlashga yuborish kerak: ${base}`;
  }
  if (stage === 'SecurityInspection' && (role === 'Security' || role === 'Permit' || role === 'Admin')) {
    return `Qo‘riqlash tekshiruvi: ${base}`;
  }
  if ((stage === 'ReadyForEstakada' || stage === 'TareWeighing') && (role === 'Scale' || role === 'Admin')) {
    const needsTare = (a.wagons ?? []).some(u => u.status !== 'Returned' && !String(u.tareWeight ?? '').trim())
      || ((a.wagons ?? []).length === 0 && !String(a.tareWeight ?? '').trim());
    if (needsTare) return `Tara tortish: ${base}`;
  }
  if ((stage === 'ReadyForEstakada' || stage === 'TareWeighing') && (role === 'Railway' || role === 'Admin')) {
    const allTared = (a.wagons ?? []).length > 0
      ? (a.wagons ?? []).every(u => u.status === 'Returned' || !!String(u.tareWeight ?? '').trim())
      : !!String(a.tareWeight ?? '').trim();
    return allTared
      ? `Estakadaga uzatish: ${base}`
      : `Tara kutilyapti, so‘ng estakada: ${base}`;
  }
  if ((stage === 'EstakadaPlaced' || stage === 'Loading') && (role === 'Warehouse' || role === 'Admin')) {
    return `Yuklash: ${base}`;
  }
  if (['GrossWeighed', 'SealInstallation', 'SealPending', 'ToRailwayScale'].includes(stage)) {
    if (role === 'Economist') {
      return `Plomba holati: ${base}`;
    }
    if (['Scale', 'Security', 'Admin'].includes(role)) {
      return `Plomba: ${base}`;
    }
  }
  if (stage === 'Sealed' && (role === 'Economist' || role === 'Admin')) {
    return `Yuk xatini shakllantirish: ${base}`;
  }

  const dept = DEPT_BY_ROLE[role];
  const notified = parseList(a.notifiedDepartments);
  // Faqat xabardor qilinadigan rollar — amal qiluvchi rollar o‘z bosqichi tugagach qayta chiqmasin
  if (
    dept
    && notified.includes(dept)
    && stage !== 'RailwayInspected'
    && ['Marketing', 'Management'].includes(role)
  ) {
    return `Bo‘sh vagonlar xabarnomasi: ${base}`;
  }
  if (
    ['Security', 'Permit'].includes(role)
    && dept
    && notified.includes(dept)
    && stage === 'KengsoyInspection'
  ) {
    return `Bo‘sh vagonlar xabarnomasi: ${base}`;
  }
  if (
    role === 'Warehouse'
    && dept
    && notified.includes(dept)
    && !['EstakadaPlaced', 'Loading', 'Loaded', 'ToRailwayScale', 'GrossWeighed', 'SealInstallation', 'SealPending', 'Sealed'].includes(stage)
  ) {
    return `Bo‘sh vagonlar xabarnomasi: ${base}`;
  }
  return null;
}

function orderNotifications(role: string, orders: MonthlyOrder[]): RoleNotification[] {
  const items: RoleNotification[] = [];
  for (const o of orders) {
    const num = o.orderNumber || o.productType;
    // MS va MX: xodim yuborgan buyurtma bo'lim boshlig'ida; qaytarilgani xodimga
    if (o.status === 'Draft' && o.headReviewStatus === 'Pending' && (role === 'Marketing' || role === 'Admin') && canOpenPath(role, '/orders/railway')) {
      items.push({
        id: `order-head-${o.id}`,
        title: `Ko‘rib chiqish: ${num}`,
        subtitle: o.headSubmittedByName ? `Xodim yubordi: ${o.headSubmittedByName}` : 'MS va MX xodimi yubordi',
        to: `/orders/${o.logisticsType === 'Road' ? 'road' : 'railway'}?view=tasdiq&open=${o.id}`,
        badge: `${o.totalWagons || 0} ta`,
        createdAt: o.headSubmittedAt || o.createdAt || '',
        priority: 1,
      });
    }
    if (o.status === 'Draft' && o.headReviewStatus === 'Returned' && role === 'MarketingStaff' && canOpenPath(role, '/orders/railway')) {
      items.push({
        id: `order-head-ret-${o.id}`,
        title: `Qaytarildi: ${num}`,
        subtitle: o.headReturnComment ? `Bo‘lim boshlig‘i: ${o.headReturnComment}` : 'Bo‘lim boshlig‘i tuzatish uchun qaytardi',
        to: `/orders/${o.logisticsType === 'Road' ? 'road' : 'railway'}?view=tasdiq&open=${o.id}`,
        badge: `${o.totalWagons || 0} ta`,
        createdAt: o.createdAt || '',
        priority: 1,
      });
    }
    if (o.status === 'PendingAccounting' && (role === 'Accounting' || role === 'Admin') && canOpenPath(role, '/orders/railway')) {
      items.push({
        id: `order-${o.id}`,
        title: `Buxgalteriya kelishuvi: ${num}`,
        subtitle: 'Buxgalteriya kelishuvi kutilmoqda',
        to: `/orders/railway?view=tasdiq&open=${o.id}`,
        badge: `${o.totalWagons || 0} ta`,
        createdAt: o.createdAt || '',
        priority: 1,
      });
    }
    if (
      o.status === 'PendingDeputyDirector'
      && (role === 'DeputyDirector' || role === 'Admin')
      && canOpenPath(role, '/orders/railway')
    ) {
      items.push({
        id: `order-dep-${o.id}`,
        title: `O‘rinbosar tasdig‘i: ${num}`,
        subtitle: 'Bosh direktor o‘rinbosari tasdig‘i kutilmoqda',
        to: `/orders/railway?view=tasdiq&open=${o.id}`,
        badge: `${o.totalWagons || 0} ta`,
        createdAt: o.createdAt || '',
        priority: 1,
      });
    }
    if (
      o.status === 'PendingDispatching'
      && (role === 'DispatchSupervisor' || role === 'Admin')
      && canOpenPath(role, '/orders/railway')
    ) {
      items.push({
        id: `order-d-${o.id}`,
        title: `ICHDX boshlig‘i ijroga qabul: ${num}`,
        subtitle: 'ICHDX boshlig‘i ijroga qabul qilishi kutilmoqda',
        to: `/orders/railway?view=tasdiq&open=${o.id}`,
        badge: `${o.totalWagons || 0} ta`,
        createdAt: o.createdAt || '',
        priority: 1,
      });
    }
  }
  return items;
}

function planNotifications(_role: string, _plans: DailyPlan[]): RoleNotification[] {
  return [];
}

/** Rol uchun hozir bajarilishi kerak bo‘lgan xabarnomalar (bosilsa jarayonga o‘tadi). */
export function buildRoleNotifications(
  role: string,
  arrivals: EmptyWagonArrival[],
  orders: MonthlyOrder[] = [],
  plans: DailyPlan[] = [],
): RoleNotification[] {
  if (!role) return [];

  const items: RoleNotification[] = [];

  for (const a of arrivals) {
    const title = wagonActionTitle(role, a);
    const to = resolveWagonTarget(role, a);
    if (!title || !to) continue;
    const st = stageOf(a);
    const stageLabel = WAGON_STAGE_LABELS[st] || st;
    items.push({
      id: `ew-${a.id}-${st}`,
      title,
      subtitle: `${stageLabel} · ${dateMeta(a.arrivalDate || a.createdAt)}`,
      to,
      badge: `${a.wagonCount} ta`,
      createdAt: a.createdAt || a.arrivalDate || '',
      priority: 0,
    });
  }

  items.push(...orderNotifications(role, orders));
  items.push(...planNotifications(role, plans));

  return items
    .sort((a, b) => a.priority - b.priority || (b.createdAt || '').localeCompare(a.createdAt || ''))
    .slice(0, 20);
}

const DISMISS_KEY = (userKey: string) => `etransport_notif_dismissed:${userKey}`;

export function getDismissedNotificationIds(userKey: string): Set<string> {
  if (!userKey) return new Set();
  try {
    const raw = localStorage.getItem(DISMISS_KEY(userKey));
    if (!raw) return new Set();
    const list = JSON.parse(raw) as string[];
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

export function dismissNotification(userKey: string, id: string): void {
  if (!userKey || !id) return;
  const next = getDismissedNotificationIds(userKey);
  next.add(id);
  try {
    localStorage.setItem(DISMISS_KEY(userKey), JSON.stringify([...next].slice(-300)));
  } catch {
    // ignore quota
  }
}

/** Bir nechta (yoki barcha) xabarnomalarni o‘qilgan deb belgilash. */
export function dismissNotifications(userKey: string, ids: string[]): void {
  if (!userKey || ids.length === 0) return;
  const next = getDismissedNotificationIds(userKey);
  for (const id of ids) {
    if (id) next.add(id);
  }
  try {
    localStorage.setItem(DISMISS_KEY(userKey), JSON.stringify([...next].slice(-300)));
  } catch {
    // ignore quota
  }
}

export function filterDismissedNotifications(
  items: RoleNotification[],
  userKey: string,
): RoleNotification[] {
  const dismissed = getDismissedNotificationIds(userKey);
  if (dismissed.size === 0) return items;
  return items.filter(n => !dismissed.has(n.id));
}
