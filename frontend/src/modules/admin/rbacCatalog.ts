import {
  type LucideIcon,
  Activity,
  BarChart3,
  Send,
  Target,
  BookOpen,
  Boxes,
  Building2,
  Calculator,
  Crown,
  Factory,
  FileCheck,
  FileSearch,
  FileText,
  History,
  LayoutDashboard,
  Lock,
  MapPinned,
  Megaphone,
  Package,
  PackageOpen,
  Plug,
  Scale,
  Shield,
  ShieldCheck,
  Train,
  TrainFront,
  Trash2,
  Truck,
  Users,
  Warehouse,
} from 'lucide-react';
import { ROLE_LABELS } from '../../shared/types';

export type RbacTone = 'blue' | 'emerald' | 'violet' | 'amber' | 'cyan' | 'rose' | 'indigo' | 'sky';

export interface RbacRoleDef {
  key: string;
  label: string;
  department: string;
  description: string;
  tone: RbacTone;
  seedUser: string;
  isSystem?: boolean;
  iconName?: string;
}

export interface RbacMenuItem {
  key: string;
  label: string;
  path: string;
  icon: LucideIcon;
}

export interface RbacModuleDef {
  key: string;
  label: string;
  description: string;
}

export type CrudFlag = 'C' | 'R' | 'U' | 'D' | 'A';

export interface RbacWorkflowAction {
  key: string;
  order: number;
  label: string;
  description: string;
  roles: string[];
}

export interface RbacResourceDef {
  key: string;
  module: string;
  label: string;
  description: string;
  apiPath: string;
  crudRoles: {
    C: string[];
    R: string[];
    U: string[];
    D: string[];
  };
  workflowActions?: RbacWorkflowAction[];
}

export interface RbacActionDef {
  key: string;
  module: string;
  label: string;
  description: string;
  flags: CrudFlag[];
  roles: string[];
  resourceKey?: string;
  order?: number;
}

export const RBAC_ROLES: RbacRoleDef[] = [
  {
    key: 'Admin',
    label: ROLE_LABELS.Admin,
    department: 'IT',
    description: 'Tizim administratori — barcha panellar va amallar.',
    tone: 'blue',
    seedUser: 'admin',
    isSystem: true,
    iconName: 'crown',
  },
  {
    key: 'Marketing',
    label: ROLE_LABELS.Marketing,
    department: 'MS va MX',
    description: 'Buyurtmalar yaratish, tahrirlash va kelishuvga yuborish.',
    tone: 'sky',
    seedUser: 'marketing',
    isSystem: true,
    iconName: 'megaphone',
  },
  {
    key: 'MarketingStaff',
    label: ROLE_LABELS.MarketingStaff,
    department: 'MS va MX',
    description: 'Buyurtma tayyorlaydi va bo‘lim boshlig‘iga yuboradi; barcha buyurtmalarni ko‘radi.',
    tone: 'sky',
    seedUser: 'ms_xodim',
    isSystem: true,
    iconName: 'user',
  },
  {
    key: 'Dispatching',
    label: ROLE_LABELS.Dispatching,
    department: 'ICHDX',
    description: 'ICHDX smena boshlig‘i — kiritish xizmat xatlari, jo‘natmalar va yuk xati tasdig‘i.',
    tone: 'cyan',
    seedUser: 'ichdx',
    isSystem: true,
    iconName: 'train',
  },
  {
    key: 'DispatchSupervisor',
    label: ROLE_LABELS.DispatchSupervisor,
    department: 'ICHDX',
    description: 'Buyurtma kelishuvi va ijroga qabul qilish.',
    tone: 'violet',
    seedUser: 'ichdx_boshliq',
    isSystem: true,
    iconName: 'crown',
  },
  {
    key: 'Accounting',
    label: ROLE_LABELS.Accounting,
    department: 'Buxgalteriya',
    description: 'Buyurtma kelishuvi va kunlik reja tasdiqlash.',
    tone: 'violet',
    seedUser: 'buxgalter',
    isSystem: true,
    iconName: 'calculator',
  },
  {
    key: 'Railway',
    label: ROLE_LABELS.Railway,
    department: 'Temir yo\'l sexi',
    description: 'Jo\'natmalarga vagon qo\'shish va vagonlar hisobi.',
    tone: 'amber',
    seedUser: 'temiryol',
    isSystem: true,
    iconName: 'train',
  },
  {
    key: 'Road',
    label: ROLE_LABELS.Road,
    department: 'Avtotransport',
    description: 'Avtopark va yo\'l jo\'natmalari.',
    tone: 'cyan',
    seedUser: 'avtotransport',
    isSystem: true,
    iconName: 'truck',
  },
  {
    key: 'Warehouse',
    label: ROLE_LABELS.Warehouse,
    department: 'TM va XA smena muxandisi',
    description: 'Yuklash jarayoni.',
    tone: 'emerald',
    seedUser: 'ombor',
    isSystem: true,
    iconName: 'warehouse',
  },
  {
    key: 'Scale',
    label: ROLE_LABELS.Scale,
    department: 'Tarozi',
    description: 'Tortish va muhr qo\'yish.',
    tone: 'rose',
    seedUser: 'tarozi',
    isSystem: true,
    iconName: 'scale',
  },
  {
    key: 'Permit',
    label: ROLE_LABELS.Permit,
    department: 'Ruxsatnoma byurosi',
    description: 'Ruxsatnomalar va yuk xati.',
    tone: 'violet',
    seedUser: 'ruxsatnoma',
    isSystem: true,
    iconName: 'shield',
  },
  {
    key: 'Security',
    label: ROLE_LABELS.Security,
    department: 'Qo\'riqlash',
    description: 'Nazorat punkti va chiqish tekshiruvi.',
    tone: 'emerald',
    seedUser: 'qoriqlash',
    isSystem: true,
    iconName: 'shield',
  },
  {
    key: 'Economist',
    label: ROLE_LABELS.Economist,
    department: 'ICHDX',
    description: 'Yuk xati yuritish.',
    tone: 'amber',
    seedUser: 'iqtisodchi',
    isSystem: true,
    iconName: 'calculator',
  },
  {
    key: 'Management',
    label: ROLE_LABELS.Management,
    department: 'Rahbariyat',
    description: 'Tahlil va hisobotlarni ko\'rish.',
    tone: 'blue',
    seedUser: 'rahbar',
    isSystem: true,
    iconName: 'crown',
  },
  {
    key: 'DeputyDirector',
    label: ROLE_LABELS.DeputyDirector,
    department: 'Bosh direktor o\'rinbosari',
    description: 'Buxgalteriya kelishuvidan keyin tasdiqlab ICHDXga yuborish.',
    tone: 'rose',
    seedUser: 'isayev',
    isSystem: true,
    iconName: 'shield',
  },
];

export const ROLE_ICON_MAP: Record<string, LucideIcon> = {
  crown: Crown,
  megaphone: Megaphone,
  calculator: Calculator,
  train: TrainFront,
  truck: Truck,
  warehouse: Warehouse,
  scale: Scale,
  shield: Shield,
  users: Users,
  boxes: Boxes,
  fileText: FileText,
  activity: Activity,
  BarChart3,
  Send,
  Target,
};

export const ROLE_ICON_OPTIONS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: 'crown', label: 'Toj / Rahbariyat', icon: Crown },
  { key: 'megaphone', label: 'Megafon / Marketing', icon: Megaphone },
  { key: 'calculator', label: 'Kalkulyator / Hisob', icon: Calculator },
  { key: 'train', label: 'Poyezd / Temir yo\'l', icon: TrainFront },
  { key: 'truck', label: 'Yuk mashinasi / Transport', icon: Truck },
  { key: 'warehouse', label: 'Ombor / Ishlab chiqarish', icon: Warehouse },
  { key: 'scale', label: 'Tarozi / O\'lchov', icon: Scale },
  { key: 'shield', label: 'Qalqon / Xavfsizlik', icon: Shield },
  { key: 'users', label: 'Xodimlar / Jamoa', icon: Users },
  { key: 'boxes', label: 'Qutilar / Logistika', icon: Boxes },
  { key: 'fileText', label: 'Hujjat / Xizmat xati', icon: FileText },
  { key: 'activity', label: 'Faollik / Jarayon', icon: Activity },
];

export function getRoleIcon(role: RbacRoleDef): LucideIcon {
  if (role.iconName && ROLE_ICON_MAP[role.iconName]) {
    return ROLE_ICON_MAP[role.iconName];
  }
  const defaultMap: Record<string, string> = {
    Admin: 'crown',
    Management: 'crown',
    DispatchSupervisor: 'crown',
    DeputyDirector: 'shield',
    Marketing: 'megaphone',
    MarketingStaff: 'megaphone',
    Accounting: 'calculator',
    Economist: 'calculator',
    Railway: 'train',
    Road: 'truck',
    Dispatching: 'truck',
    Warehouse: 'warehouse',
    Scale: 'scale',
    Security: 'shield',
    Permit: 'shield',
  };
  const iconKey = defaultMap[role.key];
  if (iconKey && ROLE_ICON_MAP[iconKey]) {
    return ROLE_ICON_MAP[iconKey];
  }
  return Shield;
}

const MENU_CATALOG: Record<string, RbacMenuItem> = {
  dashboard: { key: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  orders: { key: 'orders', label: 'Buyurtmalar', path: '/orders/railway', icon: FileText },
  'empty-wagons': { key: 'empty-wagons', label: 'Kiritish xizmat xatlari', path: '/empty-wagons', icon: Factory },
  registry: { key: 'registry', label: 'Yuk xatlari', path: '/registry', icon: FileCheck },
  transport: { key: 'transport', label: 'Majmuadagi vagonlar', path: '/transport/entered', icon: TrainFront },
  history: { key: 'history', label: 'Jarayonlar tarixi', path: '/history', icon: History },
  'order-approvals': { key: 'order-approvals', label: 'Buxgalteriya kelishuvi', path: '/order-approvals', icon: FileCheck },
  'order-deputy-approvals': { key: 'order-deputy-approvals', label: 'Buyurtmani tasdiqlash', path: '/order-deputy-approvals', icon: FileCheck },
  'order-dispatch-approvals': { key: 'order-dispatch-approvals', label: 'Ijroga qabul qilish', path: '/order-dispatch-approvals', icon: FileCheck },
  'railway-intake': { key: 'railway-intake', label: 'Vagonlar reestri', path: '/railway-intake', icon: Train },
  loading: { key: 'loading', label: 'Yuklash (TM va XA)', path: '/loading', icon: PackageOpen },
  weighing: { key: 'weighing', label: 'Tarozi va plombalash', path: '/weighing', icon: Scale },
  seals: { key: 'seals', label: 'Plomba o\'rnatish', path: '/seals', icon: Lock },
  'registry-approve': { key: 'registry-approve', label: 'Yuk xatini tasdiqlash', path: '/registry', icon: FileCheck },
  'registry-agree-permit': { key: 'registry-agree-permit', label: 'Yuk xatini kelishish (Ruxsatnoma)', path: '/registry/agree/permit', icon: FileCheck },
  'registry-agree-security': { key: 'registry-agree-security', label: 'Yuk xatini kelishish (Qo‘riqlash)', path: '/registry/agree/security', icon: ShieldCheck },
  'admin-users': { key: 'admin-users', label: 'Foydalanuvchilar', path: '/admin/users', icon: Users },
  'admin-roles': { key: 'admin-roles', label: 'Rollar va Huquqlar', path: '/admin/roles', icon: Shield },
  'admin-references': { key: 'admin-references', label: 'Ma\'lumotnomalar', path: '/admin/references', icon: BookOpen },
  'admin-integrations': { key: 'admin-integrations', label: 'Integratsiyalar', path: '/admin/integrations', icon: Plug },
  'admin-audit': { key: 'admin-audit', label: 'Audit Log', path: '/admin/audit', icon: FileSearch },
  'admin-trash': { key: 'admin-trash', label: 'O‘chirilganlar', path: '/admin/trash', icon: Trash2 },
  'admin-server-status': { key: 'admin-server-status', label: 'Server holati', path: '/admin/server-status', icon: Activity },
};

const CORE_MENUS = ['dashboard', 'orders', 'registry', 'empty-wagons', 'transport', 'history'] as const;

function withCore(...extras: string[]): string[] {
  return [...CORE_MENUS, ...extras];
}

/** Sidebar menyular — 5 ta asosiy panel + rolga xos ish panellari */
export const ROLE_MENUS: Record<string, string[]> = {
  Admin: withCore(
    'railway-intake',
    'order-dispatch-approvals',
    'order-deputy-approvals',
    'order-approvals',
    'admin-users',
    'admin-roles',
    'admin-references',
    'admin-integrations',
    'admin-audit',
    'admin-trash',
    'admin-server-status',
  ),
  Marketing: withCore(),
  MarketingStaff: withCore(),
  Dispatching: withCore('registry-approve'),
  DispatchSupervisor: withCore('order-dispatch-approvals', 'registry-approve'),
  Accounting: withCore('order-approvals'),
  DeputyDirector: withCore('order-deputy-approvals'),
  Railway: withCore('railway-intake'),
  Road: withCore(),
  Warehouse: withCore('loading'),
  Scale: withCore('weighing', 'seals'),
  Permit: withCore('registry-agree-permit'),
  Security: withCore('seals', 'registry-agree-security'),
  Economist: withCore('seals'),
  Management: withCore(),
};

export const ALL_MENU_ITEMS: RbacMenuItem[] = Object.values(MENU_CATALOG);

/** Menyu → modul (UI filtri uchun) */
export const MENU_MODULE: Record<string, string> = {
  dashboard: 'reports',
  orders: 'marketing',
  'empty-wagons': 'railway',
  registry: 'documents',
  transport: 'reports',
  history: 'reports',
  'order-approvals': 'accounting',
  'order-deputy-approvals': 'deputy',
  'order-dispatch-approvals': 'dispatching',
  'railway-intake': 'railway',
  loading: 'warehouse',
  weighing: 'scale',
  seals: 'scale',
  'registry-approve': 'dispatching',
  'registry-agree-permit': 'permit',
  'registry-agree-security': 'security',
  'admin-users': 'admin',
  'admin-roles': 'admin',
  'admin-references': 'admin',
  'admin-integrations': 'admin',
  'admin-audit': 'admin',
  'admin-trash': 'admin',
  'admin-server-status': 'admin',
};

export const RBAC_MODULES: RbacModuleDef[] = [
  { key: 'marketing', label: 'Buyurtmalar (MS va MX)', description: 'Buyurtmalar, kontragentlar va stansiyalar' },
  { key: 'accounting', label: 'Buxgalteriya', description: 'Buyurtma kelishuvi, to\'lovlar va limitlar' },
  { key: 'deputy', label: 'Rahbariyat tasdig‘i', description: 'Bosh direktor o‘rinbosari tasdig‘i' },
  { key: 'dispatching', label: 'ICHDX', description: 'Ijroga qabul qilish va xizmat xatlari tasdig‘i' },
  { key: 'railway', label: 'Temir yo‘l sexi', description: 'Vagonlarni kiritish, estakada va Kengsoygacha olib chiqish' },
  { key: 'security', label: 'Qo‘riqlash xizmati', description: 'Xavfsizlik ko‘rigi, muhrlash va darvoza' },
  { key: 'permit', label: 'Ruxsatnoma byurosi', description: 'Xizmat xati va yuk xati kelishuvi' },
  { key: 'scale', label: 'Tarozi', description: 'Tara / brutto tortish va muhrlash' },
  { key: 'warehouse', label: 'TM va XA sexi', description: 'Mahsulot quyish / yuklash va muhrlash' },
  { key: 'documents', label: 'Yuk xatlari', description: 'Yuk xati shakllantirish, e-nakl va 1C eksport' },
  { key: 'road', label: 'Avtotransport', description: 'Avto jo‘natmalar va quyish' },
  { key: 'admin', label: 'Tizim boshqaruvi', description: 'Foydalanuvchilar, rollar, ma\'lumotnomalar va integratsiya' },
  { key: 'reports', label: 'Hisobotlar va Monitoring', description: 'Jarayonlar tarixi, monitoring va tahlil' },
];

/**
 * Modul ruxsatlari — faqat rolning real ishiga mos.
 */
export const ROLE_MODULES: Record<string, string[]> = {
  Admin: ['marketing', 'accounting', 'deputy', 'dispatching', 'railway', 'security', 'permit', 'scale', 'warehouse', 'documents', 'road', 'admin', 'reports'],
  Marketing: ['marketing', 'reports'],
  MarketingStaff: ['marketing', 'reports'],
  Accounting: ['accounting', 'marketing', 'reports'],
  DeputyDirector: ['deputy', 'marketing', 'reports'],
  DispatchSupervisor: ['dispatching', 'marketing', 'documents', 'reports'],
  Dispatching: ['dispatching', 'marketing', 'railway', 'documents', 'reports'],
  Railway: ['railway', 'documents', 'reports'],
  Security: ['security', 'documents', 'reports'],
  Permit: ['permit', 'documents', 'reports'],
  Scale: ['scale', 'reports'],
  Warehouse: ['warehouse', 'reports'],
  Economist: ['documents', 'reports'],
  Management: ['marketing', 'documents', 'reports'],
  Road: ['road', 'scale', 'warehouse', 'security', 'reports'],
};

export const RBAC_RESOURCES: RbacResourceDef[] = [
  {
    key: 'plans',
    module: 'marketing',
    label: 'Oylik reja monitoringi',
    description: 'Zavodlar va mahsulotlar kesimida oylik rejalarni kiritish, monitoring qilish va tahrirlash',
    apiPath: '/api/plans',
    crudRoles: {
      C: ['Admin', 'Marketing', 'Economist'],
      R: ['Admin', 'Marketing', 'Dispatching', 'DeputyDirector', 'Management', 'Economist', 'Accounting'],
      U: ['Admin', 'Marketing', 'Economist'],
      D: ['Admin'],
    },
    workflowActions: [
      { key: 'plans.approve', order: 1, label: 'Oylik reja ijrosini tasdiqlash', description: 'Reja parametrlarini tasdiqlash va qabul qilish', roles: ['Admin', 'DeputyDirector', 'Management'] },
      { key: 'plans.export', order: 2, label: 'Reja tahlilini Excel eksport qilish', description: 'Oylik reja jadvallarini Excel fayl shaklida yuklab olish', roles: ['Admin', 'Marketing', 'Economist', 'DeputyDirector'] },
    ],
  },
  {
    key: 'reports',
    module: 'reports',
    label: 'Statistika va tahliliy hisobotlar',
    description: 'Barcha logistika va yuk tashish bo‘yicha tahliliy hisobotlar, diagrammalar va eksport',
    apiPath: '/api/reports',
    crudRoles: {
      C: ['Admin', 'Management', 'DeputyDirector'],
      R: ['Admin', 'Management', 'Marketing', 'Dispatching', 'Accounting', 'DeputyDirector', 'Economist'],
      U: ['Admin'],
      D: ['Admin'],
    },
    workflowActions: [
      { key: 'reports.export', order: 1, label: 'Excel va PDF hisobotlarni yuklab olish', description: 'Kengaytirilgan hisobotlarni eksport qilish', roles: ['Admin', 'Management', 'Marketing', 'Dispatching', 'Accounting', 'DeputyDirector', 'Economist'] },
      { key: 'reports.filter', order: 2, label: 'Kengaytirilgan davriy tahlil va filtrlar', description: 'Tarixiy va ko‘p o‘lchovli filtrlar yordamida tahlil qilish', roles: ['Admin', 'Management', 'Marketing', 'DeputyDirector'] },
    ],
  },
  {
    key: 'telegram',
    module: 'admin',
    label: 'Telegram Bot va bildirishnomalar',
    description: 'Telegram bot integratsiyasi, guruhlar, token va avtomatik bildirishnomalar zanjiri',
    apiPath: '/api/admin/telegram',
    crudRoles: {
      C: ['Admin'],
      R: ['Admin', 'Management', 'DeputyDirector', 'Dispatching'],
      U: ['Admin'],
      D: ['Admin'],
    },
    workflowActions: [
      { key: 'telegram.send', order: 1, label: 'Tezkor xabarnoma yuborish', description: 'Guruh yoki xodimlarga qo‘lda xabar yuborish', roles: ['Admin', 'Dispatching', 'Marketing'] },
      { key: 'telegram.auto_notify', order: 2, label: 'Avtomatik status xabarnomalari', description: 'Buyurtma, vagon yoki yuk xati statusi o‘zgarganda bot orqali avto-xabar yuborish', roles: ['Admin', 'Dispatching', 'Management'] },
    ],
  },
  {
    key: 'orders',
    module: 'marketing',
    label: 'Buyurtmalar',
    description: 'Temir yo‘l va avtotransport oylik buyurtmalari',
    apiPath: '/api/orders',
    crudRoles: {
      C: ['Admin', 'Marketing'],
      R: ['Admin', 'Marketing', 'Accounting', 'DeputyDirector', 'DispatchSupervisor', 'Dispatching', 'Economist', 'Management'],
      U: ['Admin', 'Marketing'],
      D: ['Admin', 'Marketing'],
    },
    workflowActions: [
      { key: 'orders.submit-head', order: 0, label: 'Bo‘lim boshlig‘iga yuborish', description: 'MS va MX xodimi buyurtmani bo‘lim boshlig‘i ko‘rigiga yuboradi', roles: ['Admin', 'MarketingStaff'] },
      { key: 'orders.approve-head', order: 0, label: 'Bo‘lim boshlig‘i tasdig‘i', description: 'Xodim buyurtmasini tasdiqlab kelishuvga yuborish yoki qaytarish', roles: ['Admin', 'Marketing'] },
      { key: 'orders.submit-approval', order: 1, label: 'Buxgalteriya kelishuviga yuborish', description: 'MS va MX buyurtmani tekshiruvga yuboradi', roles: ['Admin', 'Marketing'] },
      { key: 'orders.resubmit', order: 2, label: 'Qaytarilgan buyurtmani qayta yuborish', description: 'Kamchiliklar tuzatilib qayta kelishuvga yuborish', roles: ['Admin', 'Marketing'] },
      { key: 'orders.accounting-save', order: 3, label: 'Buxgalteriya to‘lov/limit kelishuvi', description: 'To‘lov va limit ma\'lumotlarini kiritish va kelishish', roles: ['Admin', 'Accounting'] },
      { key: 'orders.accounting-finalize', order: 4, label: 'Buxgalteriya kelishuvini yakunlash', description: 'Bosh direktor o‘rinbosariga yo‘naltirish', roles: ['Admin', 'Accounting'] },
      { key: 'orders.approve-deputy', order: 5, label: 'Bosh direktor o‘rinbosari tasdig‘i', description: 'Buyurtmani ICHDX ijroga qabul qilishi uchun tasdiqlash', roles: ['Admin', 'DeputyDirector'] },
      { key: 'orders.approve-dispatch', order: 6, label: 'ICHDX boshlig‘i ijroga qabul qilishi', description: 'Tasdiqlangan buyurtmani yuklash ijrosiga qabul qilish', roles: ['Admin', 'DispatchSupervisor', 'Dispatching'] },
    ],
  },
  {
    key: 'empty-wagons',
    module: 'railway',
    label: 'Bo‘sh vagonlar partiyasi',
    description: '1C tizimidan kelgan bo‘sh vagonlar partiyalarini qabul qilish va ro‘yxatga olish',
    apiPath: '/api/empty-wagon-arrivals',
    crudRoles: {
      C: ['Admin', 'Railway', 'Dispatching', 'DispatchSupervisor'],
      R: ['Admin', 'Railway', 'Dispatching', 'DispatchSupervisor', 'Security', 'Scale', 'Warehouse', 'Permit', 'Economist', 'Management', 'DeputyDirector'],
      U: ['Admin', 'Railway', 'Dispatching', 'DispatchSupervisor'],
      D: ['Admin', 'Railway'],
    },
    workflowActions: [
      { key: 'empty-wagons.transfer-estakada', order: 1, label: 'Estakadaga uzatish (Temir yo\'l sexi)', description: 'Vagonlarni yuklash estakadasiga qo‘yish', roles: ['Admin', 'Railway'] },
    ],
  },
  {
    key: 'entry-permits',
    module: 'railway',
    label: 'Kiritish xizmat xatlari',
    description: 'Korxonaga kiruvchi bo‘sh vagonlar uchun QR kodli xizmat xati va ko‘p tomonlama tekshiruv',
    apiPath: '/api/empty-wagon-arrivals/{id}/entry-permit',
    crudRoles: {
      C: ['Admin', 'Railway'],
      R: ['Admin', 'Railway', 'Security', 'Permit', 'Dispatching', 'DispatchSupervisor', 'Management', 'DeputyDirector'],
      U: ['Admin', 'Railway'],
      D: ['Admin', 'Railway'],
    },
    workflowActions: [
      { key: 'empty-wagons.security-inspect', order: 1, label: 'Qo‘riqlash xizmati xavfsizlik ko‘rigi', description: 'Vagonlar tashqi ko‘rigi va xavfsizlik tekshiruvi tasdig‘i', roles: ['Admin', 'Security'] },
      { key: 'empty-wagons.permit-agree', order: 2, label: 'Ruxsatnoma byurosi kelishuvi', description: 'Ruxsatnoma byurosi tomonidan ro‘yxatga olish va kelishuv', roles: ['Admin', 'Permit'] },
      { key: 'empty-wagons.dispatch-approve', order: 3, label: 'ICHDX smena boshlig‘i kiritish tasdig‘i', description: 'Vagonlarni korxona hududiga kiritishning yakuniy tasdig‘i', roles: ['Admin', 'Dispatching', 'DispatchSupervisor'] },
    ],
  },
  {
    key: 'defect-acts',
    module: 'railway',
    label: 'Nomuvofiqlik dalolatnomalari (Nosoz vagonlar)',
    description: 'Nosoz yoki talabga javob bermaydigan vagonlar dalolatnomasini rasmiylashtirish va qaytarish',
    apiPath: '/api/defect-acts',
    crudRoles: {
      C: ['Admin', 'Railway', 'Security', 'Warehouse', 'Scale'],
      R: ['Admin', 'Railway', 'Security', 'Warehouse', 'Scale', 'Dispatching', 'Economist', 'Management'],
      U: ['Admin', 'Railway'],
      D: ['Admin', 'Railway'],
    },
  },
  {
    key: 'weighing',
    module: 'scale',
    label: 'Tarozida tortish (Vagonlar)',
    description: 'Bo‘sh vagon tarasini va to‘la vagon brutto vaznini o‘lchash, Netto hisoblash',
    apiPath: '/api/wagon-scales',
    crudRoles: {
      C: ['Admin', 'Scale'],
      R: ['Admin', 'Scale', 'Warehouse', 'Security', 'Economist', 'Dispatching', 'Railway', 'Management'],
      U: ['Admin', 'Scale'],
      D: ['Admin'],
    },
    workflowActions: [
      { key: 'flow.tare-weigh', order: 1, label: 'Tara tortish (Tarozi operatori)', description: 'Bo‘sh vagon tarasini o‘lchash va qayd etish', roles: ['Admin', 'Scale'] },
      { key: 'flow.gross-weigh', order: 2, label: 'Brutto tortish va Netto hisoblash', description: 'To‘la vagon brutto og‘irligini o‘lchash va Netto aniqlash', roles: ['Admin', 'Scale'] },
    ],
  },
  {
    key: 'loading',
    module: 'warehouse',
    label: 'Mahsulot quyish / yuklash (TM va XA)',
    description: 'Estakadadagi vagon-tsisternalarga mahsulot quyish jarayoni',
    apiPath: '/api/loading',
    crudRoles: {
      C: ['Admin', 'Warehouse'],
      R: ['Admin', 'Warehouse', 'Scale', 'Security', 'Dispatching', 'Economist', 'Management'],
      U: ['Admin', 'Warehouse'],
      D: ['Admin'],
    },
    workflowActions: [
      { key: 'flow.loading', order: 1, label: 'Mahsulot quyish / yuklash tasdig‘i', description: 'Tsisternalarga quyish jarayoni yakunlanganini tasdiqlash', roles: ['Admin', 'Warehouse'] },
    ],
  },
  {
    key: 'seals',
    module: 'scale',
    label: 'Plomba va Muhrlash (3 tomonlama)',
    description: 'Yuklangan vagonlarga 3 ta mas\'ul tomonidan plomba o‘rnatish va tasdiqlash',
    apiPath: '/api/wagon-seals',
    crudRoles: {
      C: ['Admin', 'Scale', 'Warehouse', 'Security'],
      R: ['Admin', 'Scale', 'Warehouse', 'Security', 'Economist', 'Dispatching', 'Railway', 'Management'],
      U: ['Admin', 'Scale', 'Security', 'Warehouse', 'Economist'],
      D: ['Admin'],
    },
    workflowActions: [
      { key: 'flow.seal-warehouse', order: 1, label: 'TM va XA smena muxandisi tasdig‘i', description: '1-tomonlama plomba o‘rnatish tasdig‘i', roles: ['Admin', 'Warehouse'] },
      { key: 'flow.seal-scale', order: 2, label: 'Tarozi operatori tasdig‘i', description: '2-tomonlama plomba o‘rnatish tasdig‘i', roles: ['Admin', 'Scale'] },
      { key: 'flow.seal-security', order: 3, label: 'Qo‘riqlash xizmati tasdig‘i', description: '3-tomonlama plomba o‘rnatish tasdig‘i (To‘liq muhrlanadi)', roles: ['Admin', 'Security'] },
    ],
  },
  {
    key: 'registry',
    module: 'documents',
    label: 'Yuk xatlari reestri va Chiqish',
    description: 'Muhrlangan vagonlar uchun yuk xati shakllantirish, ko‘p bosqichli kelishuv va Kengsoyga chiqarish',
    apiPath: '/api/documents/loading-registry',
    crudRoles: {
      C: ['Admin', 'Economist'],
      R: ['Admin', 'Economist', 'Dispatching', 'DispatchSupervisor', 'Accounting', 'Railway', 'Permit', 'Security', 'Management', 'DeputyDirector'],
      U: ['Admin', 'Economist', 'Dispatching'],
      D: ['Admin', 'Economist'],
    },
    workflowActions: [
      { key: 'documents.registry.write', order: 1, label: 'Yuk xatini shakllantirish', description: 'Muhrlangan tayyor vagonlar uchun yuk xati yaratish', roles: ['Admin', 'Economist'] },
      { key: 'documents.registry.approve-shift', order: 2, label: 'Yuk xatini ICHDX smena boshlig‘i tasdig‘i', description: 'Yuk xati reestrini smena boshlig‘i tasdiqlashi', roles: ['Admin', 'Dispatching', 'DispatchSupervisor'] },
      { key: 'documents.registry.approve-economist', order: 3, label: 'Yuk xatini ICHDX iqtisodchisi kelishuvi', description: 'Iqtisodiy va hisob parametrlarini kelishish', roles: ['Admin', 'Economist'] },
      { key: 'documents.registry.approve-permit', order: 4, label: 'Yuk xatini Ruxsatnoma byurosi kelishuvi', description: 'Chiqish ruxsatnomasini ro‘yxatga olish va kelishish', roles: ['Admin', 'Permit'] },
      { key: 'documents.registry.approve-security', order: 5, label: 'Yuk xatini Qo‘riqlash xizmati kelishuvi', description: 'Nazorat punkti va chiqish xavfsizligini kelishish', roles: ['Admin', 'Security'] },
      { key: 'documents.registry.send-external', order: 6, label: '1C va E-Nakl tizimlariga yuborish', description: 'Elektron yuk xatini tashqi tizimlarga eksport qilish', roles: ['Admin', 'Economist'] },
      { key: 'documents.registry.handover', order: 7, label: 'Kengsoygacha olib chiqish / Temir yo‘lga topshirish', description: 'Vagonlarni Kengsoy stansiyasiga jo‘natish', roles: ['Admin', 'Railway'] },
    ],
  },
  {
    key: 'transport',
    module: 'reports',
    label: 'Majmuadagi vagonlar monitoringi',
    description: 'Kirish nazoratida, Yuklashda, Chiqishga tayyor va Nosoz vagonlar monitoringi',
    apiPath: '/api/transport',
    crudRoles: {
      C: [],
      R: ['Admin', 'Marketing', 'Dispatching', 'DispatchSupervisor', 'Accounting', 'Railway', 'Road', 'Warehouse', 'Scale', 'Permit', 'Security', 'Economist', 'Management', 'DeputyDirector'],
      U: [],
      D: [],
    },
  },
  {
    key: 'road',
    module: 'road',
    label: 'Avtotransport jo‘natmalari',
    description: 'Avtotransport kiritish, navbat, tara/brutto tortish, quyish va darvoza nazorati',
    apiPath: '/api/road-shipments',
    crudRoles: {
      C: ['Admin', 'Road'],
      R: ['Admin', 'Road', 'Dispatching', 'Scale', 'Warehouse', 'Security', 'Management'],
      U: ['Admin', 'Road'],
      D: ['Admin', 'Road'],
    },
    workflowActions: [
      { key: 'road.weigh-tare', order: 1, label: 'Avtotransport tara tortish', description: 'Bo‘sh avtomobil vaznini tortish', roles: ['Admin', 'Scale'] },
      { key: 'road.loading', order: 2, label: 'Avtotsisternaga mahsulot quyish', description: 'Avtotsisternaga quyish yakunlangani tasdig‘i', roles: ['Admin', 'Warehouse'] },
      { key: 'road.weigh-gross', order: 3, label: 'Avtotransport brutto tortish', description: 'To‘la avtomobil vaznini tortish', roles: ['Admin', 'Scale'] },
      { key: 'road.gate-exit', order: 4, label: 'Avtotransport chiqish nazorati (Darvoza)', description: 'Darvozadan chiqarish ruxsati', roles: ['Admin', 'Security'] },
    ],
  },
  {
    key: 'products',
    module: 'admin',
    label: 'Mahsulotlar katalogi',
    description: 'Temir yo‘l va avtotransport mahsulotlari katalogi va buyurtma ID prefikslari',
    apiPath: '/api/products',
    crudRoles: {
      C: ['Admin', 'Marketing'],
      R: ['Admin', 'Marketing', 'Accounting', 'Dispatching', 'Railway', 'Warehouse', 'Scale', 'Management', 'Economist'],
      U: ['Admin', 'Marketing'],
      D: ['Admin', 'Marketing'],
    },
  },
  {
    key: 'contractors',
    module: 'admin',
    label: 'Kontragentlar',
    description: 'Korxona va mijozlar ro‘yxati, STIR raqami va biriktirilgan stansiyalar bazasi',
    apiPath: '/api/contractors',
    crudRoles: {
      C: ['Admin', 'Marketing'],
      R: ['Admin', 'Marketing', 'Accounting', 'Dispatching', 'Economist', 'Management'],
      U: ['Admin', 'Marketing'],
      D: ['Admin', 'Marketing'],
    },
  },
  {
    key: 'stations',
    module: 'admin',
    label: 'Stansiyalar',
    description: 'Temir yo‘l yetkazib berish stansiyalari va rasmiy O‘TY stansiya kodlari',
    apiPath: '/api/stations',
    crudRoles: {
      C: ['Admin', 'Railway', 'Marketing'],
      R: ['Admin', 'Marketing', 'Railway', 'Dispatching', 'Accounting', 'Economist', 'Management'],
      U: ['Admin', 'Railway', 'Marketing'],
      D: ['Admin', 'Railway'],
    },
  },
  {
    key: 'wagon-types',
    module: 'admin',
    label: 'Vagon turlari',
    description: 'Yarimvagon, sisterna, platforma sig‘imi va me’yoriy tara og‘irliklari',
    apiPath: '/api/wagon-types',
    crudRoles: {
      C: ['Admin', 'Railway'],
      R: ['Admin', 'Railway', 'Dispatching', 'Scale', 'Warehouse', 'Economist', 'Management'],
      U: ['Admin', 'Railway'],
      D: ['Admin', 'Railway'],
    },
  },
  {
    key: 'fleet-wagons',
    module: 'admin',
    label: 'Vagonlar reestri (Park)',
    description: '8 xonali korxona va jalb qilingan vagonlar parki, texnik ko‘rik muddati',
    apiPath: '/api/fleet-wagons',
    crudRoles: {
      C: ['Admin', 'Railway', 'Dispatching'],
      R: ['Admin', 'Railway', 'Dispatching', 'Scale', 'Warehouse', 'Security', 'Permit', 'Economist', 'Management'],
      U: ['Admin', 'Railway', 'Dispatching'],
      D: ['Admin', 'Railway'],
    },
  },
  {
    key: 'users',
    module: 'admin',
    label: 'Foydalanuvchilar',
    description: 'Foydalanuvchi hisob yozuvlari, xodimlar, loginlar va parollar',
    apiPath: '/api/users',
    crudRoles: {
      C: ['Admin'],
      R: ['Admin'],
      U: ['Admin'],
      D: ['Admin'],
    },
  },
  {
    key: 'roles',
    module: 'admin',
    label: 'Rollar va Huquqlar',
    description: 'Tizim rollari, kirish modullari va granular CRUD matritsasi',
    apiPath: '/api/rbac',
    crudRoles: {
      C: ['Admin'],
      R: ['Admin'],
      U: ['Admin'],
      D: ['Admin'],
    },
  },
  {
    key: 'audit',
    module: 'reports',
    label: 'Audit Log va Jarayonlar tarixi',
    description: 'Tizim harakatlari jurnali, xavfsizlik audit loglari va yakunlangan jarayonlar arxivi',
    apiPath: '/api/audit-logs, /api/history',
    crudRoles: {
      C: [],
      R: ['Admin', 'Management', 'Marketing', 'Dispatching', 'Accounting', 'DeputyDirector', 'Economist'],
      U: [],
      D: [],
    },
  },
];

/**
 * Backend [Authorize(Roles=...)] amallari.
 * Admin har doim qo‘shiladi — ro‘yxatda qolgan rollar.
 */
export const RBAC_ACTIONS: RbacActionDef[] = [
  // --- OYLIK REJA MONITORINGI (PLANS) ---
  {
    key: 'plans.read',
    module: 'marketing',
    label: 'Oylik rejalarni ko‘rish',
    description: 'GET /api/plans — oylik reja monitoringi va ko‘rsatkichlar',
    flags: ['R'],
    roles: ['Admin', 'Marketing', 'MarketingStaff', 'Dispatching', 'DeputyDirector', 'Management', 'Economist', 'Accounting'],
  },
  {
    key: 'plans.create',
    module: 'marketing',
    label: 'Yangi oylik reja kiritish',
    description: 'POST /api/plans — zavod va mahsulotlar bo‘yicha oylik reja kiritish',
    flags: ['C'],
    roles: ['Admin', 'Marketing', 'Economist'],
  },
  {
    key: 'plans.update',
    module: 'marketing',
    label: 'Oylik rejalarni tahrirlash',
    description: 'PUT /api/plans/{id} — reja ko‘rsatkichlarini o‘zgartirish',
    flags: ['U'],
    roles: ['Admin', 'Marketing', 'Economist'],
  },
  {
    key: 'plans.delete',
    module: 'marketing',
    label: 'Rejalarni o‘chirish',
    description: 'DELETE /api/plans/{id} — reja yozuvini o‘chirish',
    flags: ['D'],
    roles: ['Admin'],
  },
  {
    key: 'plans.approve',
    module: 'marketing',
    label: 'Oylik reja ijrosini tasdiqlash',
    description: 'POST /api/plans/{id}/approve — reja parametrlarini tasdiqlash',
    flags: ['A'],
    order: 1,
    roles: ['Admin', 'DeputyDirector', 'Management'],
  },
  {
    key: 'plans.export',
    module: 'marketing',
    label: 'Reja tahlilini Excel eksport qilish',
    description: 'GET /api/plans/export — oylik reja jadvallarini Excel yuklab olish',
    flags: ['A'],
    order: 2,
    roles: ['Admin', 'Marketing', 'MarketingStaff', 'Economist', 'DeputyDirector'],
  },

  // --- STATISTIKA VA TAHLIL (REPORTS) ---
  {
    key: 'reports.read',
    module: 'reports',
    label: 'Statistika va diagrammalarni ko‘rish',
    description: 'GET /api/reports — logistika statistikasi va monitoring grafiklari',
    flags: ['R'],
    roles: ['Admin', 'Management', 'Marketing', 'MarketingStaff', 'Dispatching', 'Accounting', 'DeputyDirector', 'Economist'],
  },
  {
    key: 'reports.create',
    module: 'reports',
    label: 'Maxsus tahliliy hisobot shakllantirish',
    description: 'POST /api/reports/custom — parametrlangan hisobot yaratish',
    flags: ['C'],
    roles: ['Admin', 'Management', 'DeputyDirector'],
  },
  {
    key: 'reports.update',
    module: 'reports',
    label: 'Hisobot shablonlarini tahrirlash',
    description: 'PUT /api/reports/templates — tahlil parametrlarini sozlash',
    flags: ['U'],
    roles: ['Admin'],
  },
  {
    key: 'reports.delete',
    module: 'reports',
    label: 'Saqlangan hisobotlarni o‘chirish',
    description: 'DELETE /api/reports/saved/{id} — saqlangan hisobot yozuvini tozalash',
    flags: ['D'],
    roles: ['Admin'],
  },
  {
    key: 'reports.export',
    module: 'reports',
    label: 'Excel va PDF hisobotlarni yuklab olish',
    description: 'GET /api/reports/export — hisobotlarni fayl shaklida eksport qilish',
    flags: ['A'],
    order: 1,
    roles: ['Admin', 'Management', 'Marketing', 'MarketingStaff', 'Dispatching', 'Accounting', 'DeputyDirector', 'Economist'],
  },
  {
    key: 'reports.filter',
    module: 'reports',
    label: 'Kengaytirilgan davriy tahlil va filtrlar',
    description: 'GET /api/reports/advanced — ko‘p o‘lchovli filtrlar yordamida tahlil',
    flags: ['A'],
    order: 2,
    roles: ['Admin', 'Management', 'Marketing', 'MarketingStaff', 'DeputyDirector'],
  },

  // --- TELEGRAM BOT VA BILDIRISHNOMALAR (TELEGRAM) ---
  {
    key: 'telegram.read',
    module: 'admin',
    label: 'Telegram bot holati va loglarini ko‘rish',
    description: 'GET /api/admin/telegram — bot statusi, ulangan guruhlar va xabarnomalar',
    flags: ['R'],
    roles: ['Admin', 'Management', 'DeputyDirector', 'Dispatching'],
  },
  {
    key: 'telegram.create',
    module: 'admin',
    label: 'Yangi guruh yoki bildirishnoma kanali qo‘shish',
    description: 'POST /api/admin/telegram/channels — yangi chat ID yoki guruh biriktirish',
    flags: ['C'],
    roles: ['Admin'],
  },
  {
    key: 'telegram.update',
    module: 'admin',
    label: 'Bot token va bildirishnoma parametrlarini sozlash',
    description: 'PUT /api/admin/telegram/config — bot token, guruhlar va xabarnoma qoidalarini sozlash',
    flags: ['U'],
    roles: ['Admin'],
  },
  {
    key: 'telegram.delete',
    module: 'admin',
    label: 'Telegram guruh yoki sozlamani o‘chirish',
    description: 'DELETE /api/admin/telegram/channels/{id} — kanal yoki sozlamani o‘chirish',
    flags: ['D'],
    roles: ['Admin'],
  },
  {
    key: 'telegram.send',
    module: 'admin',
    label: 'Tezkor xabarnoma yuborish',
    description: 'POST /api/admin/telegram/send — guruh yoki xodimlarga qo‘lda xabar yuborish',
    flags: ['A'],
    order: 1,
    roles: ['Admin', 'Dispatching', 'Marketing'],
  },
  {
    key: 'telegram.auto_notify',
    module: 'admin',
    label: 'Avtomatik status xabarnomalari',
    description: 'POST /api/admin/telegram/auto-notify — holatlar o‘zgarganda bot orqali avto-xabar',
    flags: ['A'],
    order: 2,
    roles: ['Admin', 'Dispatching', 'Management'],
  },
  // --- 1. BUYURTMALAR (ORDERS) ---
  {
    key: 'orders.read',
    module: 'marketing',
    label: 'Buyurtmalarni ko\'rish',
    description: 'GET /api/orders — barcha temir yo‘l va avtotransport buyurtmalari',
    flags: ['R'],
    roles: ['Admin', 'Marketing', 'MarketingStaff', 'Dispatching', 'DispatchSupervisor', 'Accounting', 'Railway', 'Road', 'Warehouse', 'Scale', 'Permit', 'Security', 'Economist', 'Management', 'DeputyDirector'],
  },
  {
    key: 'orders.create',
    module: 'marketing',
    label: 'Yangi buyurtma yaratish',
    description: 'POST /api/orders — temir yo‘l / avto buyurtma kiritish',
    flags: ['C'],
    roles: ['Admin', 'Marketing', 'MarketingStaff', 'DispatchSupervisor'],
  },
  {
    key: 'orders.update',
    module: 'marketing',
    label: 'Buyurtmani tahrirlash',
    description: 'PUT /api/orders/{id} — loyiha holatidagi buyurtmani tahrirlash',
    flags: ['U'],
    roles: ['Admin', 'Marketing', 'MarketingStaff', 'DispatchSupervisor'],
  },
  {
    key: 'orders.delete',
    module: 'marketing',
    label: 'Buyurtmani o\'chirish',
    description: 'DELETE /api/orders/{id} — bekor qilingan/loyiha buyurtmani o\'chirish',
    flags: ['D'],
    roles: ['Admin', 'Marketing', 'DispatchSupervisor'],
  },
  {
    key: 'orders.submit-approval',
    module: 'marketing',
    label: 'Buxgalteriya kelishuviga yuborish',
    description: 'POST /api/orders/{id}/submit-for-approval — buyurtmani to‘lov/limit tekshiruviga yuborish',
    flags: ['A'],
    order: 1,
    roles: ['Admin', 'Marketing', 'DispatchSupervisor'],
  },
  {
    key: 'orders.submit-head',
    module: 'marketing',
    label: 'Bo‘lim boshlig‘iga yuborish',
    description: 'POST /api/orders/{id}/submit-to-head — MS va MX xodimi tayyorlagan buyurtmani bo‘lim boshlig‘i ko‘rigiga yuborish',
    flags: ['A'],
    order: 0,
    roles: ['Admin', 'MarketingStaff'],
  },
  {
    key: 'orders.approve-head',
    module: 'marketing',
    label: 'Bo‘lim boshlig‘i tasdig‘i',
    description: 'Xodim yuborgan buyurtmani tasdiqlab kelishuvga yuborish yoki izoh bilan qaytarish (POST /api/orders/{id}/return-to-staff)',
    flags: ['A'],
    order: 0,
    roles: ['Admin', 'Marketing'],
  },
  {
    key: 'orders.resubmit',
    module: 'marketing',
    label: 'Qaytarilgan buyurtmani qayta yuborish',
    description: 'POST /api/orders/{id}/resubmit-rejected — kamchiliklar tuzatilib qayta kelishuvga yuborish',
    flags: ['A'],
    order: 2,
    roles: ['Admin', 'Marketing', 'DispatchSupervisor'],
  },
  {
    key: 'orders.accounting-save',
    module: 'accounting',
    label: 'Buxgalteriya kelishuvi / limitlarni kiritish',
    description: 'POST /api/orders/{id}/save-accounting-review — to\'lov va limit ma\'lumotlarini saqlash',
    flags: ['A'],
    order: 3,
    roles: ['Admin', 'Accounting'],
  },
  {
    key: 'orders.accounting-finalize',
    module: 'accounting',
    label: 'Buxgalteriya kelishuvini yakunlash',
    description: 'POST /api/orders/{id}/finalize-accounting-review — Bosh direktor o\'rinbosariga yo\'naltirish',
    flags: ['A'],
    order: 4,
    roles: ['Admin', 'Accounting'],
  },
  {
    key: 'orders.approve-deputy',
    module: 'deputy',
    label: 'Bosh direktor o\'rinbosari tasdig\'i',
    description: 'POST /api/orders/{id}/approve-deputy — buyurtmani ICHDX ijroga qabul qilishi uchun tasdiqlash',
    flags: ['A'],
    order: 5,
    roles: ['Admin', 'DeputyDirector'],
  },
  {
    key: 'orders.approve-dispatch',
    module: 'dispatching',
    label: 'ICHDX boshlig‘i ijroga qabul qilishi',
    description: 'POST /api/orders/{id}/approve-dispatch — tasdiqlangan buyurtmani yuklash ijrosiga qabul qilish',
    flags: ['A'],
    order: 6,
    roles: ['Admin', 'DispatchSupervisor', 'Dispatching'],
  },
  // --- 2. MA'LUMOTNOMALAR (PRODUCTS, CONTRACTORS, STATIONS, WAGON TYPES, FLEET WAGONS) ---
  // --- NORMATIV HUJJATLAR ---
  {
    key: 'normative-docs.read',
    module: 'reports',
    label: 'Normativ hujjatlarni ko‘rish',
    description: 'Normativ hujjatlar ro‘yxatini ko‘rish, hujjatni ochish va yuklab olish',
    flags: ['R'],
    roles: ['Admin', 'Marketing', 'MarketingStaff', 'Accounting', 'DeputyDirector', 'DispatchSupervisor', 'Dispatching', 'Railway', 'Road', 'Warehouse', 'Scale', 'Permit', 'Security', 'Economist', 'Management'],
  },
  {
    key: 'normative-docs.create',
    module: 'reports',
    label: 'Normativ hujjat yuklash',
    description: 'Yangi qonun, qoida, yo‘riqnoma yoki reglament faylini yuklash',
    flags: ['C'],
    roles: ['Admin', 'Management', 'Dispatching', 'Marketing'],
  },
  {
    key: 'normative-docs.update',
    module: 'reports',
    label: 'Normativ hujjatni tahrirlash',
    description: 'Hujjat nomi, raqami, sanasi, turi, tavsifi va faylini o‘zgartirish',
    flags: ['U'],
    roles: ['Admin', 'Management', 'Dispatching', 'Marketing'],
  },
  {
    key: 'normative-docs.delete',
    module: 'reports',
    label: 'Normativ hujjatni o‘chirish',
    description: 'Normativ hujjatni bazadan butunlay o‘chirish',
    flags: ['D'],
    roles: ['Admin'],
  },
  // --- SFERA BALANCE (tashqi tizim paneli) ---
  {
    key: 'sfera.view',
    module: 'reports',
    label: 'Mahsulot ishlab chiqarish ko‘rsatkichlarini ko‘rish',
    description: 'Yon menyuda «Mahsulot ishlab chiqarish ko‘rsatkichlari» bandi va sahifaning o‘zi (Sfera Balance): suyultirilgan gaz hamda gaz kondensati bo‘yicha real vaqt, sutkalik, oylik va yillik ko‘rsatkichlar. Huquq olib qo‘yilsa, menyu bandi ham yo‘qoladi.',
    flags: ['R'],
    roles: ['Admin', 'Management', 'DispatchSupervisor', 'DeputyDirector'],
  },
  {
    key: 'sfera.update',
    module: 'reports',
    label: 'Sozlamalar va qo‘lda kiritish',
    description: 'Sfera sozlamalari (uskunalar registri, chegaralar, PIN) va sutkalik kirim qiymatini qo‘lda kiritish',
    flags: ['U'],
    roles: ['Admin'],
  },
  {
    key: 'sfera.delete',
    module: 'reports',
    label: 'Sutkalik hisobotni o‘chirish',
    description: 'Noto‘g‘ri yozilgan sutkalik hisobotni jadvaldan olib tashlash va qayta tiklash',
    flags: ['D'],
    roles: ['Admin'],
  },
  {
    key: 'sfera.admin',
    module: 'reports',
    label: 'Texnik bo‘limlar va to‘liq rejim',
    description: 'Kiruvchi gaz, sfera telemetriyasi, ma’lumot manbalari, hisoblashlar va V1/V2 tahlili. Admin rejimi tugmasi ham shu huquq bilan ochiladi; Sfera PIN-kodi baribir so‘raladi. Bu huquq qolgan uchtasini (ko‘rish, sozlamalar, o‘chirish) ham o‘z ichiga oladi.',
    flags: ['A'],
    roles: ['Admin'],
  },
  {
    key: 'products.read',
    module: 'admin',
    label: 'Mahsulotlar katalogini ko‘rish',
    description: 'GET /api/products — mahsulot turlari va prefikslari',
    flags: ['R'],
    roles: ['Admin', 'Marketing', 'MarketingStaff', 'Accounting', 'Dispatching', 'Railway', 'Warehouse', 'Scale', 'Management', 'Economist'],
  },
  {
    key: 'products.create',
    module: 'admin',
    label: 'Yangi mahsulot qo‘shish',
    description: 'POST /api/products — yangi mahsulot turi va prefiksi kiritish',
    flags: ['C'],
    roles: ['Admin', 'Marketing'],
  },
  {
    key: 'products.update',
    module: 'admin',
    label: 'Mahsulot ma‘lumotlarini tahrirlash',
    description: 'PUT /api/products/{id} — mahsulot nomi va prefiksini o‘zgartirish',
    flags: ['U'],
    roles: ['Admin', 'Marketing'],
  },
  {
    key: 'products.delete',
    module: 'admin',
    label: 'Mahsulotni o‘chirish',
    description: 'DELETE /api/products/{id}',
    flags: ['D'],
    roles: ['Admin', 'Marketing'],
  },
  {
    key: 'contractors.read',
    module: 'admin',
    label: 'Kontragentlar ro‘yxatini ko‘rish',
    description: 'GET /api/contractors — mijozlar va shartnoma limitlari',
    flags: ['R'],
    roles: ['Admin', 'Marketing', 'MarketingStaff', 'Accounting', 'Dispatching', 'Economist', 'Management', 'DeputyDirector', 'Railway', 'Road', 'Warehouse', 'Scale', 'Permit', 'Security'],
  },
  {
    key: 'contractors.create',
    module: 'admin',
    label: 'Yangi kontragent qo‘shish',
    description: 'POST /api/contractors — STIR va korxona rekvizitlarini kiritish',
    flags: ['C'],
    roles: ['Admin', 'Marketing'],
  },
  {
    key: 'contractors.update',
    module: 'admin',
    label: 'Kontragent ma‘lumotlarini tahrirlash',
    description: 'PUT /api/contractors/{id} — nom, STIR va stansiyalarni yangilash',
    flags: ['U'],
    roles: ['Admin', 'Marketing'],
  },
  {
    key: 'contractors.delete',
    module: 'admin',
    label: 'Kontragentni o‘chirish',
    description: 'DELETE /api/contractors/{id} — mijozni o‘chirish',
    flags: ['D'],
    roles: ['Admin', 'Marketing'],
  },
  {
    key: 'stations.read',
    module: 'admin',
    label: 'Stansiyalar ro‘yxatini ko‘rish',
    description: 'GET /api/stations — temir yo‘l stansiyalari va O‘TY kodlari',
    flags: ['R'],
    roles: ['Admin', 'Marketing', 'MarketingStaff', 'Railway', 'Dispatching', 'Accounting', 'Economist', 'Management'],
  },
  {
    key: 'stations.create',
    module: 'admin',
    label: 'Yangi stansiya qo‘shish',
    description: 'POST /api/stations — stansiya nomi va O‘TY kodini kiritish',
    flags: ['C'],
    roles: ['Admin', 'Railway', 'Marketing'],
  },
  {
    key: 'stations.update',
    module: 'admin',
    label: 'Stansiya ma‘lumotlarini tahrirlash',
    description: 'PUT /api/stations/{id} — stansiya nomi va kodini yangilash',
    flags: ['U'],
    roles: ['Admin', 'Railway', 'Marketing'],
  },
  {
    key: 'stations.delete',
    module: 'admin',
    label: 'Stansiyani o‘chirish',
    description: 'DELETE /api/stations/{id}',
    flags: ['D'],
    roles: ['Admin', 'Railway'],
  },
  {
    key: 'wagon-types.read',
    module: 'admin',
    label: 'Vagon turlarini ko‘rish',
    description: 'GET /api/wagon-types — vagon/sisterna turlari va me‘yorlari',
    flags: ['R'],
    roles: ['Admin', 'Railway', 'Dispatching', 'Scale', 'Warehouse', 'Economist', 'Management'],
  },
  {
    key: 'wagon-types.create',
    module: 'admin',
    label: 'Yangi vagon turini qo‘shish',
    description: 'POST /api/wagon-types — yangi vagon/sisterna modeli kiritish',
    flags: ['C'],
    roles: ['Admin', 'Railway'],
  },
  {
    key: 'wagon-types.update',
    module: 'admin',
    label: 'Vagon turi parametrlarini tahrirlash',
    description: 'PUT /api/wagon-types/{id} — sig‘im va tara me‘yorini yangilash',
    flags: ['U'],
    roles: ['Admin', 'Railway'],
  },
  {
    key: 'wagon-types.delete',
    module: 'admin',
    label: 'Vagon turini o‘chirish',
    description: 'DELETE /api/wagon-types/{id}',
    flags: ['D'],
    roles: ['Admin', 'Railway'],
  },
  {
    key: 'fleet-wagons.read',
    module: 'admin',
    label: 'Vagonlar reestrini ko‘rish',
    description: 'GET /api/fleet-wagons — 8 xonali vagonlar parki va texnik holati',
    flags: ['R'],
    roles: ['Admin', 'Railway', 'Dispatching', 'Scale', 'Warehouse', 'Security', 'Permit', 'Economist', 'Management'],
  },
  {
    key: 'fleet-wagons.create',
    module: 'admin',
    label: 'Yangi vagon kiritish / import',
    description: 'POST /api/fleet-wagons — 8 xonali vagon qo‘shish va Excel import',
    flags: ['C'],
    roles: ['Admin', 'Railway', 'Dispatching'],
  },
  {
    key: 'fleet-wagons.update',
    module: 'admin',
    label: 'Vagon parametrlarini tahrirlash',
    description: 'PUT /api/fleet-wagons/{id} — model, tara va ko‘rik muddatini yangilash',
    flags: ['U'],
    roles: ['Admin', 'Railway', 'Dispatching'],
  },
  {
    key: 'fleet-wagons.delete',
    module: 'admin',
    label: 'Vagonni reestrdan o‘chirish',
    description: 'DELETE /api/fleet-wagons/{id}',
    flags: ['D'],
    roles: ['Admin', 'Railway'],
  },

  // --- 2. VAGONLARNI KIRITISH VA XIZMAT XATLARI (EMPTY WAGONS & INTAKE) ---
  {
    key: 'empty-wagons.read',
    module: 'railway',
    label: 'Bo\'sh vagonlar va kiritish xizmat xatlarini ko\'rish',
    description: 'GET /api/empty-wagon-arrivals — 1C integratsiyasi va kelgan partiyalar ro\'yxati',
    flags: ['R'],
    roles: ['Admin', 'Railway', 'Dispatching', 'DispatchSupervisor', 'Security', 'Scale', 'Warehouse', 'Permit', 'Economist', 'Management', 'DeputyDirector'],
  },
  {
    key: 'empty-wagons.create',
    module: 'railway',
    label: '1C dan yangi vagon partiyasini qabul qilish / kiritish',
    description: 'POST /api/empty-wagon-arrivals — kelgan vagonlar partiyasini ro\'yxatga olish',
    flags: ['C'],
    roles: ['Admin', 'Railway', 'Dispatching', 'DispatchSupervisor'],
  },
  {
    key: 'empty-wagons.update',
    module: 'railway',
    label: 'Vagonlar tarkibini tahrirlash / vagon qo\'shish',
    description: 'PUT /api/empty-wagon-arrivals/{id} — vagon raqami, mahsulot turi va parametrlarini yangilash',
    flags: ['U'],
    roles: ['Admin', 'Railway', 'Dispatching', 'DispatchSupervisor'],
  },
  {
    key: 'empty-wagons.delete',
    module: 'railway',
    label: 'Vagon partiyasini o\'chirish',
    description: 'DELETE /api/empty-wagon-arrivals/{id} — xato kiritilgan partiyani o\'chirish',
    flags: ['D'],
    roles: ['Admin', 'Railway'],
  },
  {
    key: 'empty-wagons.entry-permit',
    module: 'railway',
    label: 'Kiritish xizmat xatini shakllantirish (QR kodli)',
    description: 'POST /api/empty-wagon-arrivals/{id}/entry-permit — Qo\'riqlash ko\'rigiga yo\'naltirish',
    flags: ['A'],
    order: 1,
    roles: ['Admin', 'Railway'],
  },
  {
    key: 'empty-wagons.security-inspect',
    module: 'security',
    label: 'Qo\'riqlash xizmati xavfsizlik ko\'rigi',
    description: 'POST /api/empty-wagon-arrivals/{id}/stage/SecurityInspection — xavfsizlik tekshiruvi tasdig\'i',
    flags: ['A'],
    order: 2,
    roles: ['Admin', 'Security'],
  },
  {
    key: 'empty-wagons.permit-agree',
    module: 'permit',
    label: 'Ruxsatnoma byurosi kelishuvi',
    description: 'POST /api/empty-wagon-arrivals/{id}/stage/PermitAgreed — ruxsatnoma ro\'yxatga olishi',
    flags: ['A'],
    order: 3,
    roles: ['Admin', 'Permit'],
  },
  {
    key: 'empty-wagons.dispatch-approve',
    module: 'dispatching',
    label: 'ICHDX smena boshlig‘i kiritish tasdig‘i',
    description: 'POST /api/empty-wagon-arrivals/{id}/stage/DispatchApproved — vagonlarni korxonaga kiritish tasdig\'i',
    flags: ['A'],
    order: 4,
    roles: ['Admin', 'Dispatching', 'DispatchSupervisor'],
  },
  {
    key: 'empty-wagons.transfer-estakada',
    module: 'railway',
    label: 'Estakadaga uzatish (Temir yo\'l sexi)',
    description: 'POST /api/empty-wagon-arrivals/{id}/transfer-estakada — vagonlarni yuklash estakadasiga qo\'yish',
    flags: ['A'],
    order: 5,
    roles: ['Admin', 'Railway'],
  },
  {
    key: 'empty-wagons.defect-act',
    module: 'railway',
    label: 'Nomuvofiqlik dalolatnomasi tuzish (Nosoz vagonlar)',
    description: 'POST /api/defect-acts — nuqsonli vagon dalolatnomasini rasmiylashtirish va qaytarish',
    flags: ['A'],
    order: 6,
    roles: ['Admin', 'Railway', 'Security', 'Warehouse', 'Scale'],
  },

  // --- 3. YUKLASH JARAYONLARI VA PLOMBA (FLOW, WEIGHING, LOADING, SEALS) ---
  {
    key: 'flow.tare-weigh',
    module: 'scale',
    label: 'Tara tortish (Tarozi operatori)',
    description: 'POST /api/wagon-scales/tare — bo\'sh vagon tarasini o\'lchash va qayd etish',
    flags: ['A'],
    order: 1,
    roles: ['Admin', 'Scale'],
  },
  {
    key: 'flow.loading',
    module: 'warehouse',
    label: 'Mahsulot quyish / yuklash (TM va XA sexi)',
    description: 'POST /api/loading/confirm — tsisteranalarga quyish jarayoni yakunlanganini tasdiqlash',
    flags: ['A'],
    order: 2,
    roles: ['Admin', 'Warehouse'],
  },
  {
    key: 'flow.gross-weigh',
    module: 'scale',
    label: 'Brutto tortish va Netto hisoblash (Tarozi operatori)',
    description: 'POST /api/wagon-scales/gross — to\'la vagon brutto og\'irligini o\'lchash va Netto aniqlash',
    flags: ['A'],
    order: 3,
    roles: ['Admin', 'Scale'],
  },
  {
    key: 'flow.seal-warehouse',
    module: 'warehouse',
    label: 'Plomba o\'rnatish — TM va XA smena muxandisi tasdig\'i',
    description: 'POST /api/wagon-seals/confirm-warehouse — plomba o\'rnatilganini 1-tomonlama tasdiqlash',
    flags: ['A'],
    order: 4,
    roles: ['Admin', 'Warehouse'],
  },
  {
    key: 'flow.seal-scale',
    module: 'scale',
    label: 'Plomba o\'rnatish — Tarozi operatori tasdig\'i',
    description: 'POST /api/wagon-seals/confirm-scale — plomba o\'rnatilganini 2-tomonlama tasdiqlash',
    flags: ['A'],
    order: 5,
    roles: ['Admin', 'Scale'],
  },
  {
    key: 'flow.seal-security',
    module: 'security',
    label: 'Plomba o\'rnatish — Qo\'riqlash xizmati tasdig\'i',
    description: 'POST /api/wagon-seals/confirm-security — plomba o\'rnatilganini 3-tomonlama tasdiqlash',
    flags: ['A'],
    order: 6,
    roles: ['Admin', 'Security'],
  },
  {
    key: 'flow.seal-edit',
    module: 'scale',
    label: 'Plomba raqamlari va ma\'lumotlarini kiritish/tahrirlash',
    description: 'PUT /api/wagon-seals/{id} — plomba raqamlarini to\'g\'rilash',
    flags: ['A'],
    order: 7,
    roles: ['Admin', 'Scale', 'Security', 'Warehouse', 'Economist'],
  },

  // --- 4. YUK XATI VA CHIQISH (DOCUMENTS & DISPATCH) ---
  {
    key: 'documents.registry.read',
    module: 'documents',
    label: 'Yuk xatlari reestrini ko\'rish',
    description: 'GET /api/documents/loading-registry — shakllantirilgan yuk xatlari va vagonlar tarkibi',
    flags: ['R'],
    roles: ['Admin', 'Marketing', 'MarketingStaff', 'Dispatching', 'DispatchSupervisor', 'Accounting', 'Railway', 'Road', 'Warehouse', 'Scale', 'Permit', 'Security', 'Economist', 'Management', 'DeputyDirector'],
  },
  {
    key: 'documents.registry.create',
    module: 'documents',
    label: 'Yuk xatini shakllantirish',
    description: 'POST /api/documents/loading-registry — muhrlangan tayyor vagonlar uchun yuk xati yaratish',
    flags: ['C'],
    roles: ['Admin', 'Economist'],
  },
  {
    key: 'documents.registry.update',
    module: 'documents',
    label: 'Yuk xatini tahrirlash',
    description: 'PUT /api/documents/loading-registry/{id} — yuk xati ma\'lumotlarini tahrirlash',
    flags: ['U'],
    roles: ['Admin', 'Economist'],
  },
  {
    key: 'documents.registry.delete',
    module: 'documents',
    label: 'Yuk xatini o\'chirish / bekor qilish',
    description: 'DELETE /api/documents/loading-registry/{id} — bekor qilish',
    flags: ['D'],
    roles: ['Admin', 'Economist'],
  },
  {
    key: 'documents.registry.approve-shift',
    module: 'dispatching',
    label: 'Yuk xatini ICHDX smena boshlig‘i tasdig‘i',
    description: 'POST /api/documents/loading-registry/{id}/approve-shift',
    flags: ['A'],
    order: 1,
    roles: ['Admin', 'Dispatching', 'DispatchSupervisor'],
  },
  {
    key: 'documents.registry.approve-economist',
    module: 'documents',
    label: 'Yuk xatini ICHDX iqtisodchisi kelishuvi',
    description: 'POST /api/documents/loading-registry/{id}/approve-economist',
    flags: ['A'],
    order: 2,
    roles: ['Admin', 'Economist'],
  },
  {
    key: 'documents.registry.approve-permit',
    module: 'permit',
    label: 'Yuk xatini Ruxsatnoma byurosi kelishuvi',
    description: 'POST /api/documents/loading-registry/{id}/approve-permit',
    flags: ['A'],
    order: 3,
    roles: ['Admin', 'Permit'],
  },
  {
    key: 'documents.registry.approve-security',
    module: 'security',
    label: 'Yuk xatini Qo\'riqlash xizmati kelishuvi',
    description: 'POST /api/documents/loading-registry/{id}/approve-security',
    flags: ['A'],
    order: 4,
    roles: ['Admin', 'Security'],
  },
  {
    key: 'documents.registry.send-external',
    module: 'documents',
    label: '1C va E-Nakl tizimlariga yuborish',
    description: 'POST /api/documents/loading-registry/{id}/send-external — tashqi tizimlarga eksport qilish',
    flags: ['A'],
    order: 5,
    roles: ['Admin', 'Economist'],
  },
  {
    key: 'documents.registry.handover',
    module: 'railway',
    label: 'Kengsoygacha olib chiqish / Temir yo‘lga topshirish',
    description: 'POST /api/documents/loading-registry/{id}/exit-to-kengsoy — vagonlarni Kengsoy stansiyasiga jo\'natish',
    flags: ['A'],
    order: 6,
    roles: ['Admin', 'Railway', 'Economist', 'Dispatching'],
  },

  // --- 5. YUK TASHISH VOSITALARI MONITORINGI ---
  {
    key: 'transport.read',
    module: 'reports',
    label: 'Majmuadagi vagonlar monitoringi (Kirish nazoratida / Yuklashda / Chiqishga tayyor / Nosoz)',
    description: 'GET /api/transport — korxonadagi barcha vagonlar va transport vositalari dislokatsiyasi',
    flags: ['R'],
    roles: ['Admin', 'Marketing', 'MarketingStaff', 'Dispatching', 'DispatchSupervisor', 'Accounting', 'Railway', 'Road', 'Warehouse', 'Scale', 'Permit', 'Security', 'Economist', 'Management', 'DeputyDirector'],
  },

  // --- 6. AVTOTRANSPORT (ROAD SHIPMENTS) ---
  {
    key: 'road.read',
    module: 'road',
    label: 'Avtotransport jo\'natmalarini ko\'rish',
    description: 'GET /api/road-shipments — avtotsisternalar navbati va jo\'natmalari',
    flags: ['R'],
    roles: ['Admin', 'Road', 'Dispatching', 'Scale', 'Warehouse', 'Security', 'Management'],
  },
  {
    key: 'road.create',
    module: 'road',
    label: 'Avtotransport kiritish / navbatga qo\'yish',
    description: 'POST /api/road-shipments — haydovchi, mashina va tsisterna ma\'lumotlarini kiritish',
    flags: ['C'],
    roles: ['Admin', 'Road'],
  },
  {
    key: 'road.update',
    module: 'road',
    label: 'Avto jo\'natmani tahrirlash',
    description: 'PUT /api/road-shipments/{id}',
    flags: ['U'],
    roles: ['Admin', 'Road'],
  },
  {
    key: 'road.delete',
    module: 'road',
    label: 'Avto jo\'natmani o\'chirish / bekor qilish',
    description: 'DELETE /api/road-shipments/{id}',
    flags: ['D'],
    roles: ['Admin', 'Road'],
  },
  {
    key: 'road.weigh-tare',
    module: 'scale',
    label: 'Avtotransport tara tortish',
    description: 'POST /api/road-shipments/{id}/weigh-tare — bo\'sh avtomobil vaznini tortish',
    flags: ['A'],
    order: 1,
    roles: ['Admin', 'Scale'],
  },
  {
    key: 'road.loading',
    module: 'warehouse',
    label: 'Avtotsisternaga mahsulot quyish',
    description: 'POST /api/road-shipments/{id}/loading — quyish yakunlangani tasdig\'i',
    flags: ['A'],
    order: 2,
    roles: ['Admin', 'Warehouse'],
  },
  {
    key: 'road.weigh-gross',
    module: 'scale',
    label: 'Avtotransport brutto tortish',
    description: 'POST /api/road-shipments/{id}/weigh-gross — to\'la avtomobil vaznini tortish',
    flags: ['A'],
    order: 3,
    roles: ['Admin', 'Scale'],
  },
  {
    key: 'road.gate-exit',
    module: 'security',
    label: 'Avtotransport chiqish nazorati (Darvoza)',
    description: 'POST /api/road-shipments/{id}/gate-exit — darvozadan chiqarish ruxsati',
    flags: ['A'],
    order: 4,
    roles: ['Admin', 'Security'],
  },

  // --- 7. FOYDALANUVCHILAR VA ROLLAR ---
  {
    key: 'users.read',
    module: 'admin',
    label: 'Foydalanuvchilar ro‘yxatini ko‘rish',
    description: 'GET /api/users — xodimlar hisob yozuvlari va loginlari',
    flags: ['R'],
    roles: ['Admin'],
  },
  {
    key: 'users.create',
    module: 'admin',
    label: 'Yangi foydalanuvchi qo‘shish',
    description: 'POST /api/users — yangi xodim akkauntini yaratish',
    flags: ['C'],
    roles: ['Admin'],
  },
  {
    key: 'users.update',
    module: 'admin',
    label: 'Foydalanuvchi ma‘lumotlari va parolini o‘zgartirish',
    description: 'PUT /api/users/{id} — ma‘lumotlarni yangilash va parolni tiklash',
    flags: ['U'],
    roles: ['Admin'],
  },
  {
    key: 'users.delete',
    module: 'admin',
    label: 'Foydalanuvchini bloklash / o‘chirish',
    description: 'DELETE /api/users/{id} — hisob yozuvini bloklash',
    flags: ['D'],
    roles: ['Admin'],
  },
  {
    key: 'roles.read',
    module: 'admin',
    label: 'Rollar va huquqlar matritsasini ko‘rish',
    description: 'GET /api/rbac — rollar va ruxsatlar katalogi',
    flags: ['R'],
    roles: ['Admin'],
  },
  {
    key: 'roles.create',
    module: 'admin',
    label: 'Yangi rol qo‘shish',
    description: 'POST /api/rbac/roles — maxsus xizmat roli yaratish',
    flags: ['C'],
    roles: ['Admin'],
  },
  {
    key: 'roles.update',
    module: 'admin',
    label: 'Rol huquqlari va modullarini tahrirlash',
    description: 'PUT /api/rbac — CRUD matritsasi va modullarni saqlash',
    flags: ['U'],
    roles: ['Admin'],
  },
  {
    key: 'roles.delete',
    module: 'admin',
    label: 'Maxsus rolni o‘chirish',
    description: 'DELETE /api/rbac/roles/{id}',
    flags: ['D'],
    roles: ['Admin'],
  },
  {
    key: 'admin.integrations',
    module: 'admin',
    label: 'Tizim integratsiyalarini sozlash (1C, E-Nakl)',
    description: 'GET/PUT /api/integrations — 1C va E-Nakl ulanish parametrlari',
    flags: ['R', 'U'],
    roles: ['Admin'],
  },
  {
    key: 'admin.audit',
    module: 'admin',
    label: 'Audit Log tizim harakatlari jurnali',
    description: 'GET /api/audit-logs — barcha foydalanuvchilar harakatlari tarixi',
    flags: ['R'],
    roles: ['Admin', 'Management'],
  },
  {
    key: 'admin.trash',
    module: 'admin',
    label: 'Korzina (O‘chirilgan ma’lumotlar va fayllar)',
    description: 'GET/POST/DELETE /api/admin/trash — o‘chirilgan fayl va obyektlarni ko‘rish, tiklash va tozalash',
    flags: ['R', 'D'],
    roles: ['Admin'],
  },
  {
    key: 'admin.server-status',
    module: 'admin',
    label: 'Server va ma\'lumotlar bazasi holati',
    description: 'GET /api/health — server statistikasi va xotira holati',
    flags: ['R'],
    roles: ['Admin'],
  },
  {
    key: 'history.read',
    module: 'reports',
    label: 'Jarayonlar tarixi arxivi',
    description: 'GET /api/history — barcha yakunlangan jarayonlar arxivi',
    flags: ['R'],
    roles: ['Admin', 'Marketing', 'MarketingStaff', 'Dispatching', 'DispatchSupervisor', 'Accounting', 'Railway', 'Road', 'Warehouse', 'Scale', 'Permit', 'Security', 'Economist', 'Management', 'DeputyDirector'],
  },
  {
    key: 'reports.analytics',
    module: 'reports',
    label: 'Tahliliy hisobotlar va Excel eksport',
    description: 'GET /api/reports — tahliliy diagrammalar va eksport',
    flags: ['R'],
    roles: ['Admin', 'Management', 'Marketing', 'Dispatching', 'Accounting', 'DeputyDirector'],
  },
];

export function getMenuItem(key: string): RbacMenuItem {
  return MENU_CATALOG[key] ?? {
    key,
    label: key,
    path: '/',
    icon: Boxes,
  };
}

export function getMenusForRole(role: string): RbacMenuItem[] {
  return (ROLE_MENUS[role] ?? []).map(key => {
    const item = getMenuItem(key);
    if (key === 'empty-wagons') {
      return role === 'Railway'
        ? { ...item, label: 'Vagonlarni kiritish' }
        : { ...item, label: 'Kiritish xizmat xatlari' };
    }
    return item;
  });
}

export function roleHasModule(role: string, moduleKey: string): boolean {
  return Array.isArray(ROLE_MODULES[role]) && ROLE_MODULES[role].includes(moduleKey);
}

export function roleHasAction(role: string, actionKey: string): boolean {
  const action = RBAC_ACTIONS.find(a => a.key === actionKey);
  return !!(action && Array.isArray(action.roles) && action.roles.includes(role));
}

export function actionsForRole(role: string): RbacActionDef[] {
  return RBAC_ACTIONS.filter(a => Array.isArray(a.roles) && a.roles.includes(role));
}

export function getResourcesForRole(
  resources: RbacResourceDef[],
  roleKey: string,
): { resource: RbacResourceDef; flags: ('C' | 'R' | 'U' | 'D')[]; workflowSteps: RbacWorkflowAction[] }[] {
  return resources.map(res => {
    const flags: ('C' | 'R' | 'U' | 'D')[] = [];
    if (Array.isArray(res.crudRoles?.C) && res.crudRoles.C.includes(roleKey)) flags.push('C');
    if (Array.isArray(res.crudRoles?.R) && res.crudRoles.R.includes(roleKey)) flags.push('R');
    if (Array.isArray(res.crudRoles?.U) && res.crudRoles.U.includes(roleKey)) flags.push('U');
    if (Array.isArray(res.crudRoles?.D) && res.crudRoles.D.includes(roleKey)) flags.push('D');

    const workflowSteps = (res.workflowActions || []).filter(w => Array.isArray(w.roles) && w.roles.includes(roleKey));

    return {
      resource: res,
      flags,
      workflowSteps,
    };
  }).filter(item => item.flags.length > 0 || item.workflowSteps.length > 0);
}

export function flagLabel(flag: CrudFlag): string {
  switch (flag) {
    case 'C': return 'Yaratish';
    case 'R': return 'O\'qish';
    case 'U': return 'Tahrirlash';
    case 'D': return 'O\'chirish';
    case 'A': return 'Amal';
    default: return flag;
  }
}

export function slugifyRoleCode(label: string): string {
  return label
    .trim()
    .replace(/['']/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_') || 'CustomRole';
}

// ============================================================
// CRUD ruxsatlari — resurs-markazli model (amal-markazli ustiga qurilgan)
// Backend hamon `actions` ni o'qiydi; bu faqat UI guruhlash uchun.
// ============================================================

export type CrudOp = 'C' | 'R' | 'U' | 'D';
export const CRUD_OPS: CrudOp[] = ['C', 'R', 'U', 'D'];
export const CRUD_OP_LABEL: Record<CrudOp, string> = {
  C: 'Yaratish',
  R: 'Ko\'rish',
  U: 'Tahrirlash',
  D: 'O\'chirish',
};

export interface ResourceMeta {
  label: string;
  icon: LucideIcon;
  module: string;
  order: number;
}

/** Amal kalitidan resurs kaliti (admin.* va documents.registry.* alohida). */
export function resourceKeyOf(actionKey: string): string {
  if (actionKey.startsWith('admin.')) return actionKey;
  if (actionKey.startsWith('documents.registry')) return 'documents.registry';
  if (actionKey.startsWith('wagon-types.')) return 'wagon-types';
  if (actionKey.startsWith('fleet-wagons.')) return 'fleet-wagons';
  if (actionKey.startsWith('custom.')) return 'custom';
  const dot = actionKey.indexOf('.');
  return dot === -1 ? actionKey : actionKey.slice(0, dot);
}

/** 'A' bayroqli amal — jarayon (workflow) amali; flow.* va custom.* ham jarayon. */
export function isWorkflowAction(a: RbacActionDef): boolean {
  return (Array.isArray(a?.flags) && a.flags.includes('A')) || (a?.key ? a.key.startsWith('flow.') || a.key.startsWith('custom.') : false);
}

export const RESOURCE_META: Record<string, ResourceMeta> = {
  // --- Asosiy workflow ketma-ketligi (arxitektura) ---
  orders: { label: 'Buyurtmalar', icon: FileText, module: 'marketing', order: 1 },
  'documents.registry': { label: 'Yuk xatlari (reyestr)', icon: FileCheck, module: 'documents', order: 2 },
  'empty-wagons': { label: 'Kirish hujjatlari / Vagonlar', icon: Factory, module: 'railway', order: 3 },
  flow: { label: 'Yuklash jarayoni', icon: Scale, module: 'warehouse', order: 4 },
  road: { label: 'Chiqish / Avto jo\'natmalar', icon: TrainFront, module: 'road', order: 5 },
  plans: { label: 'Oylik reja monitoringi', icon: Target, module: 'marketing', order: 6 },
  // --- Ma\'lumotnomalar ---
  'normative-docs': { label: 'Normativ hujjatlar', icon: BookOpen, module: 'reports', order: 19 },
  sfera: { label: 'Mahsulot ishlab chiqarish ko‘rsatkichlari', icon: Factory, module: 'reports', order: 19.5 },
  products: { label: 'Mahsulotlar katalogi', icon: Package, module: 'admin', order: 20 },
  contractors: { label: 'Kontragentlar', icon: Building2, module: 'admin', order: 21 },
  stations: { label: 'Stansiyalar', icon: MapPinned, module: 'admin', order: 22 },
  'wagon-types': { label: 'Vagon turlari', icon: Train, module: 'admin', order: 23 },
  'fleet-wagons': { label: 'Vagonlar reestri', icon: Warehouse, module: 'admin', order: 24 },
  // --- Monitoring va Tizim ---
  transport: { label: 'Majmuadagi vagonlar', icon: TrainFront, module: 'reports', order: 25 },
  history: { label: 'Jarayonlar tarixi', icon: History, module: 'reports', order: 26 },
  reports: { label: 'Statistika va hisobotlar', icon: BarChart3, module: 'reports', order: 27 },
  users: { label: 'Foydalanuvchilar', icon: Users, module: 'admin', order: 30 },
  roles: { label: 'Rollar va huquqlar', icon: ShieldCheck, module: 'admin', order: 31 },
  telegram: { label: 'Telegram Bot va bildirishnomalar', icon: Send, module: 'admin', order: 32 },
  'admin.integrations': { label: 'Integratsiyalar', icon: Plug, module: 'admin', order: 33 },
  'admin.audit': { label: 'Audit jurnali', icon: FileSearch, module: 'admin', order: 34 },
  'admin.trash': { label: 'O‘chirilganlar (Korzina)', icon: Trash2, module: 'admin', order: 35 },
  'admin.server-status': { label: 'Server holati', icon: Activity, module: 'admin', order: 36 },
  custom: { label: 'Maxsus resurslar', icon: Boxes, module: 'admin', order: 99 },
};

export const WORKFLOW_GROUP_META: Record<string, { label: string; icon: LucideIcon; order: number }> = {
  orders: { label: 'Buyurtma tasdiqlash zanjiri', icon: FileCheck, order: 1 },
  'empty-wagons': { label: 'Vagon kiritish va ruxsatnoma', icon: Factory, order: 2 },
  flow: { label: 'Yuklash · tortish · plombalash', icon: Scale, order: 3 },
  'documents.registry': { label: 'Yuk xati kelishuvi', icon: FileCheck, order: 4 },
  road: { label: 'Avtotransport jarayoni', icon: TrainFront, order: 5 },
  plans: { label: 'Oylik reja monitoringi va tasdiqlash', icon: Target, order: 6 },
  reports: { label: 'Statistika va hisobotlar eksporti', icon: BarChart3, order: 27 },
  telegram: { label: 'Telegram bildirishnomalar zanjiri', icon: Send, order: 32 },
  custom: { label: 'Maxsus amallar', icon: Boxes, order: 99 },
};

export interface CrudOpBinding { actionKey: string; roles: string[]; description: string }
export interface CrudResourceView {
  key: string;
  meta: ResourceMeta;
  ops: Partial<Record<CrudOp, CrudOpBinding>>;
}
export interface WorkflowGroupView {
  key: string;
  label: string;
  icon: LucideIcon;
  order: number;
  module: string;
  items: RbacActionDef[];
}

/** Amallar ro'yxatini resurs (CRUD) + jarayon guruhlariga ajratadi. */
export function buildPermissionModel(actions: RbacActionDef[]): {
  crud: CrudResourceView[];
  workflow: WorkflowGroupView[];
} {
  const crudMap = new Map<string, CrudResourceView>();
  const wfMap = new Map<string, WorkflowGroupView>();

  for (const a of actions) {
    if (isWorkflowAction(a)) {
      const gkey = a.key.startsWith('flow.')
        ? 'flow'
        : a.key.startsWith('custom.')
          ? 'custom'
          : resourceKeyOf(a.key);
      const gmeta = WORKFLOW_GROUP_META[gkey] ?? { label: gkey, icon: Boxes, order: 50 };
      let g = wfMap.get(gkey);
      if (!g) {
        g = { key: gkey, label: gmeta.label, icon: gmeta.icon, order: gmeta.order, module: a.module, items: [] };
        wfMap.set(gkey, g);
      }
      g.items.push(a);
    } else {
      const rkey = resourceKeyOf(a.key);
      const meta = RESOURCE_META[rkey] ?? { label: rkey, icon: Boxes, module: a.module, order: 50 };
      let r = crudMap.get(rkey);
      if (!r) {
        r = { key: rkey, meta, ops: {} };
        crudMap.set(rkey, r);
      }
      for (const f of a.flags) {
        if (f === 'A') continue;
        if (!r.ops[f]) r.ops[f] = { actionKey: a.key, roles: a.roles, description: a.description };
      }
    }
  }

  const crud = Array.from(crudMap.values()).sort((x, y) => x.meta.order - y.meta.order);
  const workflow = Array.from(wfMap.values())
    .map(g => ({ ...g, items: g.items.slice().sort((p, q) => (p.order ?? 0) - (q.order ?? 0)) }))
    .sort((x, y) => x.order - y.order);
  return { crud, workflow };
}

// ============================================================
// Obyekt-markazli model — arxitektura: "Bitta obyekt = bitta CRUD + business actions"
// Har biznes obyekt: C/R/U/D operatsiyalari + unga tegishli jarayon (business) amallari.
// ============================================================

export interface ObjectPermView {
  key: string;
  label: string;
  icon: LucideIcon;
  module: string;
  order: number;
  ops: Partial<Record<CrudOp, CrudOpBinding>>;
  actions: RbacActionDef[];
}

function objectKeyOf(actionKey: string): string {
  if (actionKey.startsWith('flow.')) return 'flow';
  if (actionKey.startsWith('custom.')) return 'custom';
  return resourceKeyOf(actionKey);
}

export function buildObjectModel(actions: RbacActionDef[]): ObjectPermView[] {
  const map = new Map<string, ObjectPermView>();
  for (const a of (actions || [])) {
    if (!a || !a.key) continue;
    const key = objectKeyOf(a.key);
    let o = map.get(key);
    if (!o) {
      const meta = RESOURCE_META[key] ?? { label: key, icon: Boxes, module: a.module, order: 50 };
      o = { key, label: meta.label, icon: meta.icon, module: meta.module, order: meta.order, ops: {}, actions: [] };
      map.set(key, o);
    }
    const safeRoles = Array.isArray(a.roles) ? a.roles : [];
    let safeFlags: CrudFlag[] = Array.isArray(a.flags) && a.flags.length > 0 ? [...a.flags] as CrudFlag[] : [];
    if (safeFlags.length === 0) {
      if (a.key.endsWith('.create')) safeFlags = ['C'];
      else if (a.key.endsWith('.read') || a.key.endsWith('.view')) safeFlags = ['R'];
      else if (a.key.endsWith('.update') || a.key.endsWith('.edit')) safeFlags = ['U'];
      else if (a.key.endsWith('.delete') || a.key.endsWith('.remove')) safeFlags = ['D'];
      else safeFlags = ['A'];
    }
    const safeAction: RbacActionDef = { ...a, roles: safeRoles, flags: safeFlags };
    if (isWorkflowAction(safeAction)) {
      o.actions.push(safeAction);
    } else {
      for (const f of safeFlags) {
        if (f === 'A') continue;
        if (!o.ops[f]) o.ops[f] = { actionKey: a.key, roles: safeRoles, description: a.description || '' };
      }
    }
  }
  return Array.from(map.values())
    .map(o => ({ ...o, actions: o.actions.slice().sort((x, y) => (x.order ?? 0) - (y.order ?? 0)) }))
    .sort((a, b) => a.order - b.order);
}

export const RESOURCE_EXPLANATIONS: Record<string, string> = {
  orders: 'Xaridorlar buyurtmalari, limitlar va buxgalteriya-ijro kelishuvlari',
  'documents.registry': 'Muhrlangan vagonlar uchun temir yo‘l yuk xatlarini rasmiylashtirish va kelishuv zanjiri',
  'empty-wagons': 'Kengsoydan kelgan bo‘sh vagonlarni ro‘yxatga olish, texnik ko‘rik va hududga kiritish ruxsatnomasi',
  flow: 'Estakadada yuklash, bo‘sh/to‘la (Tara/Brutto) tortish va rasmiy plombalash',
  road: 'Avtosisternalar navbati, tarozida tortish va nazorat punktidan chiqish',
  plans: 'Oylik va sutkalik rejalarning bajarilish monitoringi va tasdiqlash zanjiri',
  sfera: 'Yon menyudagi «Mahsulot ishlab chiqarish ko‘rsatkichlari» sahifasi (Sfera Balance tizimi): suyultirilgan gaz va gaz kondensati bo‘yicha real vaqt, sutkalik, oylik va yillik ko‘rsatkichlar',
  'normative-docs': 'Qonunlar, O‘ztemiryo‘l qoidalari, korxona yo‘riqnomalari va texnik reglamentlar bazasi',
  products: 'Yuklanadigan mahsulotlar (Polietilen, Polipropilen va b.) turlari va zichlik standartlari',
  contractors: 'Mahsulot oluvchi mijozlar, yuk oluvchilar va shartnoma parametrlari',
  stations: 'Temir yo‘l stansiyalari kodlari va yo‘nalishlari katalogi',
  'wagon-types': 'Vagon turlari (sisterna, yarim ochiq, platforma) me’yorlari',
  'fleet-wagons': '8 xonali vagonlar parki, texnik holati va ko‘rik muddatlari',
  containers: 'Konteynerlar va sisternalar hisobi, platformalarga biriktirish va qidiruv',
  transport: 'Hozirda majmua hududida turgan vagonlar soni, yo‘llari va joylashuvi',
  history: 'Barcha yakunlangan vagonlar, partiyalar va jo‘natmalar arxivi',
  reports: 'Sutkalik va oylik tahliliy hisobotlar hamda Excel eksporti',
  users: 'Foydalanuvchilar hisob yozuvlari, xodimlar va lavozimlar tuzilmasi',
  roles: 'Tizim rollari va vakolatlarni boshqarish markazi',
  telegram: 'Telegram bot orqali xabarnomalar va ogohlantirishlar zanjiri',
  'admin.integrations': '1C, Didox va E-Nakl tashqi tizimlari bilan integratsiyalar',
  'admin.audit': 'Barcha foydalanuvchilar harakatlari va xavfsizlik audit jurnali',
  'admin.trash': 'O‘chirilgan ma’lumotlarni ko‘rish va qayta tiklash (Korzina)',
  'admin.server-status': 'Server resurslari, ma’lumotlar bazasi va xotira holati',
};
