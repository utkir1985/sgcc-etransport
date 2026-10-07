import { useState, useEffect } from 'react';

interface OrderQtyNumberInputProps {
  value: number;
  onChange: (value: number) => void;
  required?: boolean;
  ariaLabel: string;
  className?: string;
  allowDecimal?: boolean;
}

/** Buyurtma jadvalidagi son kiritish (vagon / tonna). */
export function OrderQtyNumberInput({
  value,
  onChange,
  required,
  ariaLabel,
  className,
  allowDecimal = false,
}: OrderQtyNumberInputProps) {
  const [text, setText] = useState(() => (value > 0 ? value.toString() : ''));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setText(value > 0 ? value.toString() : '');
    }
  }, [value, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value;
    if (allowDecimal) {
      // Vergulni nuqtaga almashtirish
      raw = raw.replace(/,/g, '.');
      // Faqat raqamlar va ko'pi bilan bitta nuqtaga ruxsat berish
      const parts = raw.split('.');
      if (parts.length > 2) {
        raw = parts[0] + '.' + parts.slice(1).join('');
      }
      raw = raw.replace(/[^0-9.]/g, '');
      setText(raw);
      if (raw === '' || raw === '.') {
        onChange(0);
      } else {
        const parsed = Number.parseFloat(raw);
        if (!Number.isNaN(parsed)) {
          onChange(parsed);
        }
      }
    } else {
      raw = raw.replace(/\D/g, '');
      setText(raw);
      const next = raw ? Number.parseInt(raw, 10) : 0;
      onChange(next);
    }
  };

  return (
    <input
      type="text"
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      required={required}
      placeholder="0"
      value={isFocused ? text : (value > 0 ? value.toString() : '')}
      onFocus={() => {
        setIsFocused(true);
        setText(value > 0 ? value.toString() : '');
      }}
      onBlur={() => {
        setIsFocused(false);
        setText(value > 0 ? value.toString() : '');
      }}
      onKeyDown={e => {
        const allowedKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'];
        if (e.ctrlKey || e.metaKey || allowedKeys.includes(e.key)) {
          return;
        }
        if (allowDecimal && (e.key === '.' || e.key === ',')) {
          if (text.includes('.') || text.includes(',')) {
            e.preventDefault();
          }
          return;
        }
        if (!/^[0-9]$/.test(e.key)) {
          e.preventDefault();
        }
      }}
      onChange={handleChange}
      className={['order-sheet-input order-sheet-input--sm order-sheet-qty-num', className]
        .filter(Boolean)
        .join(' ')}
      aria-label={ariaLabel}
    />
  );
}
