import { KeyRound, ShieldCheck } from 'lucide-react';
import { Navigate, useParams } from 'react-router-dom';
import { AdminSectionDetail, AdminSectionHub } from '../../../shared/components/AdminSectionHub';
import {
  RolesCrudPanel,
  RolesManagePanel,
} from '../components/RolesPanels';

const SECTIONS = {
  manage: {
    title: 'Rollarni boshqarish',
    description: 'Tizimdagi barcha rollar, bo‘limlar va xodimlarni boshqarish.',
  },
  crud: {
    title: 'Huquqlar va CRUD',
    description: 'Barcha biznes jarayonlar, amallar, menyular va tasdiqlash zanjirlarini boshqarish.',
  },
} as const;

type SectionKey = keyof typeof SECTIONS;

const HUB_ITEMS = [
  {
    key: 'manage',
    title: 'Rollarni boshqarish',
    description: 'Yangi rollar qo‘shish, tahrirlash va lavozimlar tuzilmasini sozlash',
    path: '/admin/roles/manage',
    icon: ShieldCheck,
    tone: 'blue' as const,
  },
  {
    key: 'crud',
    title: 'Huquqlar va CRUD',
    description: 'Har bir rol uchun jarayonlar, CRUD huquqlari va tasdiqlash zanjirlari',
    path: '/admin/roles/crud',
    icon: KeyRound,
    tone: 'emerald' as const,
  },
];

function SectionContent({ section }: { section: SectionKey }) {
  switch (section) {
    case 'manage':
      return <RolesManagePanel />;
    case 'crud':
      return <RolesCrudPanel />;
    default:
      return null;
  }
}

export default function RolesPage() {
  const { section } = useParams<{ section?: string }>();

  if (!section) {
    return (
      <AdminSectionHub
        title="Rollar va Huquqlar"
        description="Rollar va barcha biznes jarayonlar bo‘yicha vakolatlar markazi."
        items={HUB_ITEMS}
      />
    );
  }

  // Keep old section links working by directing them to the consolidated CRUD page.
  if (section === 'menus' || section === 'modules' || section === 'pages') {
    return <Navigate to="/admin/roles/crud" replace />;
  }

  if (!(section in SECTIONS)) {
    return <Navigate to="/admin/roles" replace />;
  }

  const key = section as SectionKey;
  const meta = SECTIONS[key];

  return (
    <AdminSectionDetail
      title={meta.title}
      description={meta.description}
      backTo="/admin/roles"
    >
      <SectionContent section={key} />
    </AdminSectionDetail>
  );
}
