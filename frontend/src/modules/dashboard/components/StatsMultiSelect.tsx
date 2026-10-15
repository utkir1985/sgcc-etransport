import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export interface StatsOption {
  value: string;
  label: string;
}

interface Props {
  label: string;
  options: StatsOption[];
  value: string[];
  onChange: (next: string[]) => void;
  /** Bitta tanlov (radio) rejimi */
  single?: boolean;
  allLabel?: string;
}

/** Statistika filtri: bir yoki bir nechta qiymat tanlanadigan ixcham ro‘yxat (qidiruv bilan). */
export function StatsMultiSelect({ label, options, value, onChange, single = false, allLabel = 'Barchasi' }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.max(240, r.width);
      const left = Math.min(r.left, window.innerWidth - width - 8);
      setPos({ top: r.bottom + 6, left: Math.max(8, left), width });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => { if (!open) setQuery(''); }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter(o => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const selectedLabels = value.map(v => options.find(o => o.value === v)?.label ?? v);
  const display = value.length === 0
    ? allLabel
    : value.length === 1
      ? selectedLabels[0]
      : `${value.length} ta tanlandi`;

  const toggle = (v: string) => {
    if (single) {
      onChange(value[0] === v ? [] : [v]);
      setOpen(false);
      return;
    }
    onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
  };

  return (
    <div className="stats-ms">
      <button
        ref={triggerRef}
        type="button"
        className={`stats-ms__trigger${value.length ? ' has-value' : ''}${open ? ' is-open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={selectedLabels.join(', ') || undefined}
      >
        <span className="stats-ms__label">{label}</span>
        <span className="stats-ms__value">{display}</span>
        {value.length ? (
          <span
            role="button"
            tabIndex={-1}
            className="stats-ms__clear"
            aria-label="Tozalash"
            onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onChange([]); }}
          >
            <X className="w-3.5 h-3.5" />
          </span>
        ) : <ChevronDown className="stats-ms__chev" />}
      </button>
      {open && pos ? createPortal(
        <div ref={menuRef} className="stats-ms__menu" style={{ top: pos.top, left: pos.left, width: pos.width }} role="listbox">
          {options.length > 7 ? (
            <label className="stats-ms__search">
              <Search className="w-3.5 h-3.5" />
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Qidirish…" />
            </label>
          ) : null}
          <div className="stats-ms__list">
            {filtered.length === 0 ? <div className="stats-ms__empty">Topilmadi</div> : filtered.map(o => {
              const on = value.includes(o.value);
              return (
                <button key={o.value} type="button" role="option" aria-selected={on} className={`stats-ms__item${on ? ' is-on' : ''}`} onClick={() => toggle(o.value)}>
                  <span className={`stats-ms__box${single ? ' is-radio' : ''}`}>{on ? <Check className="w-3 h-3" strokeWidth={3} /> : null}</span>
                  <span className="stats-ms__text">{o.label}</span>
                </button>
              );
            })}
          </div>
          {!single && value.length > 0 ? (
            <div className="stats-ms__foot">
              <button type="button" onClick={() => onChange([])}>Tozalash</button>
              <button type="button" className="is-primary" onClick={() => setOpen(false)}>Tayyor</button>
            </div>
          ) : null}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
