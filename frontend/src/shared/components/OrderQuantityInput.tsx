import {
  ORDER_QUANTITY_UNIT_OPTIONS,
  normalizeOrderQuantityUnit,
  type OrderQuantityUnit,
} from '../constants/orderQuantityUnits';

interface OrderQuantityInputProps {
  value: number;
  unit: OrderQuantityUnit | string;
  onValueChange: (value: number) => void;
  onUnitChange: (unit: OrderQuantityUnit) => void;
  required?: boolean;
}

export function OrderQuantityInput({
  value,
  unit,
  onValueChange,
  onUnitChange,
  required,
}: OrderQuantityInputProps) {
  const normalizedUnit = normalizeOrderQuantityUnit(unit);

  return (
    <div className="order-qty-input">
      <select
        value={normalizedUnit}
        onChange={e => onUnitChange(normalizeOrderQuantityUnit(e.target.value))}
        className="order-sheet-input order-qty-unit"
        aria-label="O'lchov birligi"
      >
        {ORDER_QUANTITY_UNIT_OPTIONS.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        required={required}
        placeholder="0"
        value={value > 0 ? value.toString() : ''}
        onKeyDown={e => {
          if (
            !/^[0-9]$/.test(e.key) &&
            !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key) &&
            !(e.ctrlKey || e.metaKey)
          ) {
            e.preventDefault();
          }
        }}
        onChange={e => {
          const raw = e.target.value.replace(/\D/g, '');
          const next = raw ? Number.parseInt(raw, 10) : 0;
          onValueChange(next);
        }}
        className="order-sheet-input order-sheet-input--sm order-qty-value"
        aria-label="Miqdor"
      />
    </div>
  );
}
