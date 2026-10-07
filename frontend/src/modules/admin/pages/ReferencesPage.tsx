import { Building2, Hash, MapPinned, Package, TrainFront, Warehouse } from 'lucide-react';
import { Navigate, useParams } from 'react-router-dom';
import { AdminSectionDetail, AdminSectionHub } from '../../../shared/components/AdminSectionHub';
import { ProductsReferencePanel } from '../components/ProductsReferencePanel';
import { ContractorsReferencePanel } from '../components/ContractorsReferencePanel';
import { WagonTypesReferencePanel } from '../components/WagonTypesReferencePanel';
import { StationsReferencePanel } from '../components/StationsReferencePanel';
import { FleetWagonsReferencePanel } from '../components/FleetWagonsReferencePanel';
import { DocumentNumberingReferencePanel } from '../components/DocumentNumberingReferencePanel';

const SECTIONS = {
  products: {
    title: 'Mahsulotlar',
    description: 'Temir yo‘l va avtotransport mahsulotlari katalogi hamda buyurtma prefikslari.',
  },
  contractors: {
    title: 'Kontragentlar',
    description: 'Korxona va mijozlar ro‘yxati hamda ularning biriktirilgan stansiyalari.',
  },
  stations: {
    title: 'Stansiyalar',
    description: 'Temir yo‘l yetkazib berish stansiyalari ma‘lumotnomasi va O‘TY stansiya kodlari.',
  },
  'wagon-types': {
    title: 'Vagon turlari',
    description: 'Vagon va sisterna turlari, yuk ko‘tarish va tara me‘yorlari.',
  },
  'fleet-wagons': {
    title: 'Vagonlar reestri',
    description: '8 xonali vagonlar va konteynerlar reestri, texnik holati va ko‘rik muddatlari.',
  },
  'numbering-rules': {
    title: 'Hujjatlar va raqamlash',
    description: 'Hujjat turlari (partiyalar, ruxsatnomalar, yuk xatlari, dalolatnomalar, buyurtmalar) uchun yagona raqamlash standarti va prefikslari.',
  },
} as const;

type SectionKey = keyof typeof SECTIONS;

const HUB_ITEMS = [
  {
    key: 'products',
    title: 'Mahsulotlar',
    description: 'Mahsulot turlari katalogi va buyurtma prefikslari (TY / Avto)',
    path: '/admin/references/products',
    icon: Package,
    tone: 'blue' as const,
  },
  {
    key: 'contractors',
    title: 'Kontragentlar',
    description: 'Korxona va mijozlar ro‘yxati hamda biriktirilgan stansiyalari',
    path: '/admin/references/contractors',
    icon: Building2,
    tone: 'violet' as const,
  },
  {
    key: 'stations',
    title: 'Stansiyalar',
    description: 'Yetkazib berish stansiyalari ma‘lumotnomasi va O‘TY kodlari',
    path: '/admin/references/stations',
    icon: MapPinned,
    tone: 'emerald' as const,
  },
  {
    key: 'wagon-types',
    title: 'Vagon turlari',
    description: 'Vagon va sisterna turlari, yuk ko‘tarish va tara me‘yorlari',
    path: '/admin/references/wagon-types',
    icon: TrainFront,
    tone: 'amber' as const,
  },
  {
    key: 'fleet-wagons',
    title: 'Vagonlar reestri',
    description: '8 xonali vagonlar va konteynerlar reestri, texnik holati',
    path: '/admin/references/fleet-wagons',
    icon: Warehouse,
    tone: 'cyan' as const,
  },
  {
    key: 'numbering-rules',
    title: 'Hujjatlar va raqamlash',
    description: 'Hujjat turlari uchun avtomatik raqamlash standartlari, prefikslar va namunalar',
    path: '/admin/references/numbering-rules',
    icon: Hash,
    tone: 'rose' as const,
  },
];

export default function ReferencesPage() {
  const { refType } = useParams<{ refType?: string }>();

  if (!refType) {
    return (
      <AdminSectionHub
        title="Ma'lumotnomalar"
        description="E-Transport tizimi uchun asosiy normativ va klassifikator ma'lumotlar bazasi."
        items={HUB_ITEMS}
        defaultView="card"
      />
    );
  }

  if (!(refType in SECTIONS)) {
    return <Navigate to="/admin/references" replace />;
  }

  const key = refType as SectionKey;
  const meta = SECTIONS[key];

  return (
    <AdminSectionDetail
      title={meta.title}
      description={meta.description}
      backTo="/admin/references"
    >
      {key === 'products' ? (
        <ProductsReferencePanel />
      ) : key === 'contractors' ? (
        <ContractorsReferencePanel />
      ) : key === 'wagon-types' ? (
        <WagonTypesReferencePanel />
      ) : key === 'fleet-wagons' ? (
        <FleetWagonsReferencePanel />
      ) : key === 'stations' ? (
        <StationsReferencePanel />
      ) : key === 'numbering-rules' ? (
        <DocumentNumberingReferencePanel />
      ) : undefined}
    </AdminSectionDetail>
  );
}
