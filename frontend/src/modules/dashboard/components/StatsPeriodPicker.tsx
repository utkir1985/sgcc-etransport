import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { MONTH_NAMES_UZ } from '../../../shared/utils/dates';

export interface PeriodPreset {
  id: string;
  label: string;
  from: string;
  to: string;
}

interface Props {
  from: string;
  to: string;
  presets: PeriodPreset[];
  years: number[];
  currentYear: number;
  currentMonth: number;
  onChange: (from: string, to: string) => void;
}

const fmt = (iso: string) => (iso ? iso.split('-').reverse().join('.') : '…');
const monthStart = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}-01`;
const monthEnd = (y: number, m: number) => {
  const d = new Date(y, m, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Statistika davri: tezkor tugmalar, yil/oylar va ixtiyoriy oraliq — bitta ixcham tanlagichda. */
export function StatsPeriodPicker({ from, to, presets, years, currentYear, currentMonth, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [year, setYear] = useState(() => (from ? Number(from.slice(0, 4)) : currentYear));
  const [anchorMonth, setAnchorMonth] = useState<number | null>(null);

  useEffect(() => { if (open) { setYear(from ? Number(from.slice(0, 4)) : currentYear); setAnchorMonth(null); } }, [open, from, currentYear]);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = 470;
      setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) });
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

  const active = presets.find(p => p.from === from && p.to === to);
  const monthTo = (y: number, m: number) => (y === currentYear && m === currentMonth ? presets.find(p => p.id === 'month')?.to ?? monthEnd(y, m) : monthEnd(y, m));

  // Tanlangan oylar (bir yil ichida, butun oylar bo‘lsa)
  const selected = new Set<number>();
  if (from && to && from.slice(0, 4) === to.slice(0, 4) && Number(from.slice(0, 4)) === year) {
    const a = Number(from.slice(5, 7));
    const b = Number(to.slice(5, 7));
    if (from === monthStart(year, a) && (to === monthEnd(year, b) || to === monthTo(year, b))) for (let m = a; m <= b; m += 1) selected.add(m);
  }

  const label = active
    ? active.id === 'all' ? 'Barcha davr' : `${active.label} · ${fmt(from)} — ${fmt(to)}`
    : selected.size === 1
      ? `${MONTH_NAMES_UZ[[...selected][0] - 1]} ${year}`
      : selected.size > 1
        ? `${MONTH_NAMES_UZ[Math.min(...selected) - 1].slice(0, 3)}–${MONTH_NAMES_UZ[Math.max(...selected) - 1].slice(0, 3)} ${year}`
        : from || to ? `${fmt(from)} — ${fmt(to)}` : 'Barcha davr';

  const pickMonth = (m: number) => {
    if (anchorMonth === null) {
      setAnchorMonth(m);
      onChange(monthStart(year, m), monthTo(year, m));
    } else {
      const a = Math.min(anchorMonth, m);
      const b = Math.max(anchorMonth, m);
      onChange(monthStart(year, a), monthTo(year, b));
      setAnchorMonth(null);
    }
  };

  return (
    <div className="stats-period">
      <button
        ref={triggerRef}
        type="button"
        className={`stats-ms__trigger stats-period__trigger${from || to ? ' has-value' : ''}${open ? ' is-open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CalendarDays className="w-4 h-4 shrink-0 text-slate-400" />
        <span className="stats-ms__label">Davr</span>
        <span className="stats-ms__value">{label}</span>
        <ChevronDown className="stats-ms__chev" />
      </button>
      {open && pos ? createPortal(
        <div ref={menuRef} className="stats-period__menu" style={{ top: pos.top, left: pos.left }} role="dialog" aria-label="Davrni tanlash">
          <div className="stats-period__presets">
            {presets.map(p => (
              <button
                key={p.id}
                type="button"
                className={active?.id === p.id ? 'is-active' : ''}
                onClick={() => { onChange(p.from, p.to); setOpen(false); }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="stats-period__body">
            <div className="stats-period__year">
              <span>Oylar</span>
              <select value={year} onChange={e => { setYear(Number(e.target.value)); setAnchorMonth(null); }} aria-label="Yil">
                {years.map(y => <option key={y} value={y}>{y}-yil</option>)}
              </select>
            </div>
            <div className="stats-period__months">
              {MONTH_NAMES_UZ.map((name, i) => {
                const m = i + 1;
                const future = year > currentYear || (year === currentYear && m > currentMonth);
                const inPending = anchorMonth !== null && m === anchorMonth;
                return (
                  <button key={name} type="button" disabled={future} title={name} className={`${selected.has(m) ? 'is-active' : ''}${inPending ? ' is-anchor' : ''}`} onClick={() => pickMonth(m)}>
                    {name.slice(0, 3)}
                  </button>
                );
              })}
            </div>
            <p className="stats-period__hint">
              {anchorMonth !== null ? 'Oraliq uchun oxirgi oyni tanlang yoki «Tayyor»ni bosing' : 'Bitta oyni bosing; oraliq uchun keyin ikkinchi oyni bosing'}
            </p>
            <div className="stats-period__range">
              <span>Boshqa oraliq</span>
              <input type="date" value={from} max={to || undefined} onChange={e => onChange(e.target.value, to)} aria-label="Boshlanish" />
              <span className="stats-period__dash">—</span>
              <input type="date" value={to} min={from || undefined} onChange={e => onChange(from, e.target.value)} aria-label="Tugash" />
            </div>
            <div className="stats-period__foot">
              <button type="button" onClick={() => { onChange('', ''); setOpen(false); }}>Tozalash</button>
              <button type="button" className="is-primary" onClick={() => setOpen(false)}>Tayyor</button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
