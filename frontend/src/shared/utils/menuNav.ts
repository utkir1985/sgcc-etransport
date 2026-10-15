import type { MenuItem } from '../types';

export type OrderListView = 'all' | 'faol' | 'tasdiq' | 'yakun';

export function parseOrderListView(raw: string | null): OrderListView | null {
  if (raw === 'all' || raw === 'faol' || raw === 'tasdiq' || raw === 'yakun') return raw;
  if (raw === 'active') return 'faol';
  return null;
}

const CORE_NESTED_KEYS = new Set([
  'registry',
  'empty-wagons',
  'order-approvals',
  'order-dispatch-approvals',
  'order-deputy-approvals',
  'transport-entered',
  'transport-tared',
  'transport-loading',
  'transport-loaded',
  'transport-dispatched',
  'transport-defective',
  'history-all',
  'history-entries',
  'history-loads',
  'history-exits',
  'history-defects',
  'seals',
  'weighing',
  'weighing-tare',
  'weighing-gross',
  'weighing-seals',
]);

function item(
  key: string,
  label: string,
  path: string,
  icon: string,
  children?: MenuItem[],
): MenuItem {
  return children?.length ? { key, label, path, icon, children } : { key, label, path, icon };
}

function fromMap(
  byKey: Map<string, MenuItem>,
  key: string,
  fallback: MenuItem,
): MenuItem {
  const found = byKey.get(key);
  return found ? { ...fallback, ...found, label: fallback.label, path: fallback.path, icon: fallback.icon } : fallback;
}

function ordersRailway(): MenuItem {
  return item('orders-railway', 'Temir yo‘l', '/orders/railway', 'TrainFront');
}

function ordersRoad(): MenuItem {
  return item('orders-road', 'Avtotransport', '/orders/road', 'Truck');
}

function buildOrdersItem(byKey: Map<string, MenuItem>, role?: string): MenuItem {
  const base = fromMap(byKey, 'orders', item('orders', 'Buyurtmalar', '/orders/railway', 'FileText'));

  if (role === 'Marketing' || role === 'Admin') {
    return { ...base, path: '/orders/railway', children: [ordersRailway(), ordersRoad()] };
  }

  return { ...base, path: '/orders/railway', children: undefined };
}

function buildLoadingDocsItem(_role?: string): MenuItem {
  return item('loading-docs', 'Yuklash jarayonlari', '/registry', 'FileCheck', [
    item('registry', 'Yuk xatlari', '/registry', 'FileCheck'),
    item('empty-wagons', 'Kiritish xizmat xatlari', '/empty-wagons?work=entryLetters', 'Factory'),
    item('defect-acts', 'Dalolatnomalar', '/empty-wagons?work=defectArchive', 'FileText'),
  ]);
}

function buildGateCheckItem(): MenuItem {
  return item(
    'wagon-gate-check',
    'Tekshirish va kiritish',
    '/empty-wagons?work=gateCheck',
    'Shield',
  );
}

function buildRailwayWagonIntakeItem(byKey: Map<string, MenuItem>): MenuItem {
  return {
    ...fromMap(
      byKey,
      'empty-wagons',
      item('empty-wagons', 'Vagonlarni kiritish', '/empty-wagons', 'ArrowDownToLine'),
    ),
    key: 'railway-wagon-entry',
    label: 'Vagonlarni kiritish',
    path: '/empty-wagons',
    icon: 'ArrowDownToLine',
    children: undefined,
  };
}

function buildFleetWagonsItem(byKey: Map<string, MenuItem>): MenuItem {
  return fromMap(
    byKey,
    'railway-intake',
    item('railway-intake', 'Vagonlar reestri', '/railway-intake', 'Train'),
  );
}

function buildTransportItem(byKey: Map<string, MenuItem>): MenuItem {
  const base = fromMap(
    byKey,
    'transport',
    item('transport', 'Majmuadagi vagonlar', '/transport/tared', 'TrainFront'),
  );
  return {
    ...base,
    label: 'Majmuadagi vagonlar',
    path: '/transport/tared',
    children: [
      item('transport-tared', 'Tara qilingan', '/transport/tared', 'Scale'),
      item('transport-loading', 'Yuklanmoqda', '/transport/loading', 'Clock'),
      item('transport-loaded', 'Yuklangan', '/transport/loaded', 'PackageCheck'),
      item('transport-dispatched', 'Chiqishga tayyor', '/transport/ready', 'TrainFront'),
    ],
  };
}

function buildReportsHubItem(byKey: Map<string, MenuItem>): MenuItem[] {
  // Statistika (diagrammalar) va Jarayonlar tarixi (jurnal) — ikki alohida band
  const base = fromMap(byKey, 'history', item('history', 'Jarayonlar tarixi', '/history', 'History'));
  return [
    item('statistics', 'Statistika', '/stats', 'BarChart3'),
    { ...base, label: 'Jarayonlar tarixi', path: '/history', icon: 'History', children: undefined },
  ];
}

function buildNormativeDocsItem(byKey: Map<string, MenuItem>): MenuItem {
  return fromMap(
    byKey,
    'normative-docs',
    item('normative-docs', 'Normativ hujjatlar', '/normative-docs', 'BookOpen'),
  );
}

/**
 * Sfera Balance — alohida tizim; E-Transport ichida bitta asosiy panel
 * (Mahsulot ishlab chiqarish ko‘rsatkichlari) → mahsulot guruhlari → sahifalar.
 * full=true (sfera.admin) — Sferaning admin bo‘limlari ham ko‘rinadi.
 */
export function buildSferaItems(full = false): MenuItem[] {
  const lpg = [
    item('sfera-lpg', 'Real vaqtdagi ko‘rsatkichlar', '/sfera?p=lpg', 'LayoutDashboard'),
    item('sfera-lpg-daily', 'Sutkalik ko‘rsatkichlar', '/sfera?p=lpg-daily', 'CalendarRange'),
    item('sfera-lpg-monthly', 'Oylik ko‘rsatkichlar', '/sfera?p=lpg-monthly', 'CalendarRange'),
    item('sfera-lpg-yearly', 'Yillik ko‘rsatkichlar', '/sfera?p=lpg-yearly', 'CalendarDays'),
    ...(full ? [
      item('sfera-lpg-flow', 'Kiruvchi gaz', '/sfera?p=lpg-flow', 'ArrowDownToLine'),
      item('sfera-lpg-minute', 'Sfera telemetriyasi', '/sfera?p=lpg-minute', 'Clock'),
      item('sfera-lpg-sources', 'Ma’lumot manbalari', '/sfera?p=lpg-sources', 'Database'),
      item('sfera-lpg-calc', 'Hisoblashlar', '/sfera?p=lpg-calc', 'Sigma'),
      item('sfera-lpg-history', 'V1/V2 tahlili', '/sfera?p=lpg-history', 'TrendingUp'),
      item('sfera-lpg-settings', 'Sozlamalar', '/sfera?p=lpg-settings', 'SlidersHorizontal'),
    ] : []),
  ];
  const cond = [
    item('sfera-cond', 'Real vaqtdagi ko‘rsatkichlar', '/sfera?p=cond', 'LayoutDashboard'),
    item('sfera-cond-hourly', 'Soatlik ko‘rsatkichlar', '/sfera?p=cond-hourly', 'Clock'),
    item('sfera-cond-daily', 'Sutkalik ko‘rsatkichlar', '/sfera?p=cond-daily', 'CalendarRange'),
    item('sfera-cond-monthly', 'Oylik ko‘rsatkichlar', '/sfera?p=cond-monthly', 'CalendarRange'),
    item('sfera-cond-yearly', 'Yillik ko‘rsatkichlar', '/sfera?p=cond-yearly', 'CalendarDays'),
    ...(full ? [
      item('sfera-cond-flow', 'Kiruvchi gaz kondensati', '/sfera?p=cond-flow', 'ArrowDownToLine'),
      item('sfera-cond-telemetry', 'Silindr telemetriyasi', '/sfera?p=cond-telemetry', 'Clock'),
      item('sfera-cond-settings', 'Sozlamalar', '/sfera?p=cond-settings', 'SlidersHorizontal'),
    ] : []),
  ];
  return [
    {
      ...item('sfera', 'Mahsulot ishlab chiqarish ko‘rsatkichlari', '/sfera?p=lpg', 'Factory'),
      children: [
        { ...item('sfera-lpg-group', 'Suyultirilgan gaz', '/sfera?p=lpg', 'Flame'), children: lpg },
        { ...item('sfera-cond-group', 'Gaz kondensati', '/sfera?p=cond', 'Droplets'), children: cond },
      ],
    },
  ];
}

function buildLoadingItem(byKey: Map<string, MenuItem>): MenuItem {
  return fromMap(
    byKey,
    'loading',
    item('loading', 'Yuklash (TM va XA)', '/loading', 'PackageOpen'),
  );
}

/**
 * Barcha rollarda 5 ta asosiy panel:
 * Boshqaruv paneli → Buyurtmalar → Yuklash jarayonlari → Majmuadagi vagonlar → Hisobotlar va reja.
 * Tarozi, TM/XA va boshqa ish panellari faqat tegishli rolning qo‘shimcha bandlari.
 */
export function augmentMenuItems(menu: MenuItem[], role?: string, sferaFull = false): MenuItem[] {
  // Sfera panellari Normativ hujjatlardan keyin turadi
  const base = buildMenuItems(menu, role);
  const at = base.findIndex(entry => entry.key === 'normative-docs');
  const sfera = buildSferaItems(sferaFull);
  return at >= 0 ? [...base.slice(0, at + 1), ...sfera, ...base.slice(at + 1)] : [...base, ...sfera];
}

function buildMenuItems(menu: MenuItem[], role?: string): MenuItem[] {
  const byKey = new Map(menu.map(entry => [entry.key, entry]));

  const dashboard = fromMap(
    byKey,
    'dashboard',
    item('dashboard', 'Boshqaruv paneli', '/dashboard', 'LayoutDashboard'),
  );
  const orders = buildOrdersItem(byKey, role);
  const loadingDocs = buildLoadingDocsItem(role);
  const transport = buildTransportItem(byKey);
  // Tarix, reja va hisobotlar bitta menyu bandida; ichki bo‘limlar ReportsHistoryTabs orqali ochiladi.
  const reportsHub = buildReportsHubItem(byKey);
  const normativeDocs = buildNormativeDocsItem(byKey);

  const extras = menu.filter(entry =>
    entry.key !== 'dashboard'
    && entry.key !== 'orders'
    && entry.key !== 'transport'
    && entry.key !== 'history'
    && entry.key !== 'reports'
    && entry.key !== 'plans'
    && !CORE_NESTED_KEYS.has(entry.key),
  );

  const isAdmin = role?.toLowerCase() === 'admin' || role === 'Admin';
  if (isAdmin) {
    const wagonReestr = buildFleetWagonsItem(byKey);
    const loadingWork = buildLoadingItem(byKey);
    const otherExtras = extras.filter(entry => entry.key !== 'railway-intake' && entry.key !== 'seals' && entry.key !== 'weighing' && entry.key !== 'weighing-hub' && entry.key !== 'loading');
    return [
      dashboard,
      orders,
      loadingDocs,
      transport,
      ...reportsHub,
      normativeDocs,
      wagonReestr,
      loadingWork,
      ...otherExtras,
    ];
  }

  if (role === 'Railway') {
    const wagonIntake = buildRailwayWagonIntakeItem(byKey);
    const wagonReestr = extras.find(entry => entry.key === 'railway-intake');
    const otherExtras = extras.filter(entry => entry.key !== 'railway-intake');
    return [
      dashboard,
      orders,
      loadingDocs,
      transport,
      ...reportsHub,
      normativeDocs,
      wagonIntake,
      ...(wagonReestr ? [wagonReestr] : []),
      ...otherExtras,
    ];
  }

  if (role === 'Permit') {
    const agreePermit = extras.filter(entry => entry.key === 'registry-agree-permit');
    const rest = extras.filter(entry => entry.key !== 'registry-agree-permit' && entry.key !== 'registry-agree-security');
    return [
      dashboard,
      orders,
      loadingDocs,
      transport,
      ...reportsHub,
      normativeDocs,
      ...rest,
      ...agreePermit,
    ];
  }

  if (role === 'Security') {
    const agreeSecurity = extras.filter(entry => entry.key === 'registry-agree-security');
    const rest = extras.filter(entry => entry.key !== 'registry-agree-permit' && entry.key !== 'registry-agree-security' && entry.key !== 'seals');
    return [
      dashboard,
      orders,
      loadingDocs,
      transport,
      ...reportsHub,
      normativeDocs,
      buildGateCheckItem(),
      ...rest,
      ...agreeSecurity,
    ];
  }

  if (role === 'Scale') {
    const rest = extras.filter(entry => entry.key !== 'seals' && entry.key !== 'weighing' && entry.key !== 'weighing-hub');
    return [
      dashboard,
      orders,
      loadingDocs,
      transport,
      ...reportsHub,
      normativeDocs,
      ...rest,
    ];
  }

  if (role === 'Warehouse') {
    const loadingWork = buildLoadingItem(byKey);
    const rest = extras.filter(entry => entry.key !== 'loading');
    return [
      dashboard,
      orders,
      loadingDocs,
      transport,
      ...reportsHub,
      normativeDocs,
      loadingWork,
      ...rest,
    ];
  }

  if (role === 'Economist') {
    const createPanel = fromMap(
      byKey,
      'registry-create',
      item('registry-create', 'Yuk xati shakllantirish', '/registry/create', 'FileText'),
    );
    return [
      dashboard,
      orders,
      loadingDocs,
      transport,
      ...reportsHub,
      normativeDocs,
      createPanel,
      ...extras.filter(entry => entry.key !== 'seals' && entry.key !== 'registry-create'),
    ];
  }

  if (role === 'Dispatching' || role === 'DispatchSupervisor') {
    const approvePanel = fromMap(
      byKey,
      'registry-approve',
      item('registry-approve', 'Yuk xatini tasdiqlash', '/registry/approve', 'FileCheck'),
    );
    return [
      dashboard,
      orders,
      loadingDocs,
      transport,
      ...reportsHub,
      normativeDocs,
      approvePanel,
      ...extras.filter(entry => entry.key !== 'registry-approve'),
    ];
  }

  return [dashboard, orders, loadingDocs, transport, ...reportsHub, normativeDocs, ...extras];
}

export function menuHasKey(items: MenuItem[], key: string): boolean {
  return items.some(entry => entry.key === key || (entry.children ? menuHasKey(entry.children, key) : false));
}

export function menuItemMatches(entry: MenuItem, pathname: string, search = ''): boolean {
  if (!entry.path) return false; // guruh sarlavhasi
  const [path, query] = entry.path.split('?');
  // Sfera: p bo‘lmasa — suyultirilgan gaz real vaqt sahifasi
  if (path === '/sfera') {
    if (pathname !== '/sfera') return false;
    const want = new URLSearchParams(query ?? '').get('p') ?? 'lpg';
    const have = new URLSearchParams(search.startsWith('?') ? search : `?${search}`).get('p') || 'lpg';
    return want === have;
  }

  // Umumiy band barcha ichki bo‘limlarda, jumladan filtrlangan tarixda ham faol qoladi.
  if (entry.key === 'history' && path === '/history' && !query) {
    return pathname === '/history';
  }
  if (entry.key === 'statistics') {
    return pathname === '/stats' || pathname === '/plans' || pathname === '/reports' || pathname.startsWith('/reports/');
  }

  if (pathname !== path && !pathname.startsWith(`${path}/`)) return false;
  // /registry arxivi /registry/create yaratish paneli bilan aralashmasin
  if (path === '/registry' && pathname.startsWith('/registry/')) return false;

  const have = new URLSearchParams(search.startsWith('?') ? search : search ? `?${search}` : '');

  if (path === '/weighing') {
    const zone = have.get('zone') || 'tare';
    const wantZone = query ? new URLSearchParams(query).get('zone') : null;
    if (wantZone) {
      return zone === wantZone;
    }
    return true;
  }

  if (query) {
    const want = new URLSearchParams(query);
    for (const [key, value] of want.entries()) {
      if (have.get(key) !== value) return false;
    }
    return true;
  }

  if (path === '/empty-wagons') {
    const work = have.get('work');
    return !work || work === 'intake';
  }

  if (path === '/history') {
    const tab = have.get('tab');
    return !tab || tab === 'timeline';
  }

  return true;
}

export function findActiveMenuItem(menu: MenuItem[], pathname: string, search = ''): MenuItem | undefined {
  return findActiveMenuTrail(menu, pathname, search)?.item;
}

export function findActiveMenuTrail(
  menu: MenuItem[],
  pathname: string,
  search = '',
): { item: MenuItem; parent?: MenuItem } | undefined {
  // Ichma-ich guruhlar (masalan, Sfera: panel → mahsulot → sahifa) — eng chuqur mos band
  const findDeep = (list: MenuItem[]): MenuItem | undefined => {
    for (const c of list) {
      if (c.children?.length) {
        const deep = findDeep(c.children);
        if (deep) return deep;
      } else if (menuItemMatches(c, pathname, search)) {
        return c;
      }
    }
    return undefined;
  };
  for (const entry of menu) {
    if (entry.children?.length) {
      const child = findDeep(entry.children);
      if (child) return { item: child, parent: entry };
    }

    if (menuItemMatches(entry, pathname, search)) {
      return { item: entry };
    }
  }

  return undefined;
}

export function isOrdersPath(pathname: string): boolean {
  return pathname === '/orders' || pathname.startsWith('/orders/');
}

export function isOrdersGroupPath(pathname: string): boolean {
  return isOrdersPath(pathname)
    || pathname === '/order-approvals'
    || pathname === '/order-dispatch-approvals'
    || pathname === '/order-deputy-approvals';
}
