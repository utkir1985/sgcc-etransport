import { getProductVisual } from '../utils/productTypeVisuals';

export function ProductTypeIcon({
  productType,
  size = 'md',
  className = '',
}: {
  productType: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const { icon: Icon, variant } = getProductVisual(productType);
  const iconClass = size === 'lg' ? 'w-6 h-6' : size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';

  return (
    <div className={`product-type-icon product-type-icon--${variant} product-type-icon--${size} ${className}`.trim()}>
      <Icon className={iconClass} strokeWidth={1.75} />
    </div>
  );
}
