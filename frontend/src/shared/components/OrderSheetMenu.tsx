import { MoreVertical, type LucideIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface OrderSheetMenuItem {
  key: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  variant?: 'default' | 'danger';
  hidden?: boolean;
}

interface OrderSheetMenuProps {
  items: OrderSheetMenuItem[];
  /** Chip ichida — kichikroq trigger */
  compact?: boolean;
  /** ICHDX pill bilan bir xil balandlik / uslub */
  matchPill?: boolean;
  /** Uch nuqta yonida ko‘rinadigan ixtiyoriy yozuv */
  triggerLabel?: string;
}

export function OrderSheetMenu({ items, compact = false, matchPill = false, triggerLabel }: OrderSheetMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const visibleItems = items.filter(item => !item.hidden);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setCoords({
      top: rect.bottom + window.scrollY + 4,
      left: rect.right + window.scrollX,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (visibleItems.length === 0) return null;

  const triggerClass = [
    'order-sheet-menu__trigger',
    matchPill ? 'order-sheet-menu__trigger--pill' : '',
    !matchPill && compact ? 'order-sheet-menu__trigger--compact' : '',
    triggerLabel ? 'order-sheet-menu__trigger--labeled' : '',
  ].filter(Boolean).join(' ');

  const iconClass = matchPill ? 'w-4 h-4' : compact ? 'w-3.5 h-3.5' : 'w-5 h-5';

  return (
    <div className="order-sheet-menu">
      <button
        ref={triggerRef}
        type="button"
        className={triggerClass}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Amallar"
        onClick={() => setOpen(v => !v)}
      >
        {triggerLabel ? <span>{triggerLabel}</span> : null}
        <MoreVertical className={iconClass} strokeWidth={1.75} />
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          role="menu"
          style={{
            position: 'absolute',
            top: coords.top,
            left: coords.left,
            transform: 'translateX(-100%)',
            zIndex: 9999,
          }}
          className="order-sheet-menu__panel"
        >
          {visibleItems.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                title={item.title}
                className={`order-sheet-menu__item${
                  item.variant === 'danger' ? ' order-sheet-menu__item--danger' : ''
                }`}
                onClick={() => {
                  if (item.disabled) return;
                  setOpen(false);
                  item.onClick();
                }}
              >
                <Icon className="w-4 h-4" strokeWidth={1.75} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
