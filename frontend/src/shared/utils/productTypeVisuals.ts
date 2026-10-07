import {
  Atom,
  Cylinder,
  Flame,
  Layers,
  Recycle,
  Snowflake,
  TrainFront,
  Container,
  MapPinned,
  type LucideIcon,
} from 'lucide-react';

export type ProductIconVariant = 'blue' | 'amber' | 'emerald' | 'violet' | 'cyan';

export interface ProductVisual {
  icon: LucideIcon;
  variant: ProductIconVariant;
}

const PRODUCT_VISUALS: Record<string, ProductVisual> = {
  // Mahsulotlar
  'Suyultirilgan gaz': { icon: Flame, variant: 'blue' },
  'Barcha turdagi oltingugurt': { icon: Atom, variant: 'amber' },
  'Buten-1': { icon: Cylinder, variant: 'emerald' },
  'Etilenning polimerlari (polietilen)': { icon: Layers, variant: 'violet' },
  'Tabiiy gaz kondensati': { icon: Snowflake, variant: 'cyan' },
  'Polietilen otxod': { icon: Recycle, variant: 'emerald' },

  // Vagon turlari
  'Suyultirilgan gaz mahsuloti uchun Vagon sisterna': { icon: Flame, variant: 'blue' },
  'Gaz kondensati uchun Vagon sisterna': { icon: Snowflake, variant: 'cyan' },
  'Granula uchun Yopiq turdagi vagon': { icon: Layers, variant: 'violet' },
  'Sera uchun Yopiq turdagi vagon': { icon: Atom, variant: 'amber' },
  'Suyultirilgan gaz mahsuloti uchun Konteyner sisterna': { icon: Container, variant: 'emerald' },
  'Konteyner sisterna yuklash uchun Fiting platforma': { icon: TrainFront, variant: 'blue' },

  // Stansiyalar
  'Kengsoy stansiyasi': { icon: MapPinned, variant: 'emerald' },
  'Pop stansiyasi': { icon: MapPinned, variant: 'blue' },
  'Marg\'ilon stansiyasi': { icon: MapPinned, variant: 'violet' },
  'Andijon-1': { icon: MapPinned, variant: 'amber' },
  'Toshkent-Tovarniy': { icon: MapPinned, variant: 'cyan' },
};

const DEFAULT_VISUAL: ProductVisual = { icon: MapPinned, variant: 'emerald' };

export function getProductVisual(productType: string): ProductVisual {
  return PRODUCT_VISUALS[productType] ?? DEFAULT_VISUAL;
}
