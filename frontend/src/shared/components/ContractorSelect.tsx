import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import type { Contractor } from '../types';
import { useRbacPermission } from '../hooks/useRbacPermission';
import { addDeletedContractorId, isRogueContractor } from '../constants/railwayContractors';
import { notifyOrdersChanged } from '../utils/realtimeSync';

const ADD_OPTION = '__add_contractor__';
const MENU_MAX_HEIGHT = 280;

interface MenuLayout {
  top: number;
  left: number;
  width: number;
}

function getMenuLayout(trigger: HTMLElement): MenuLayout {
  const rect = trigger.getBoundingClientRect();
  const cellRect = trigger.closest('td')?.getBoundingClientRect() ?? rect;
  const width = Math.max(cellRect.width, rect.width, 280);
  let top = rect.bottom + 6;
  let left = cellRect.left;

  if (top + MENU_MAX_HEIGHT > window.innerHeight - 8) {
    top = Math.max(8, rect.top - MENU_MAX_HEIGHT - 6);
  }
  if (left + width > window.innerWidth - 8) {
    left = window.innerWidth - width - 8;
  }
  if (left < 8) left = 8;

  return { top, left, width };
}

interface ContractorSelectProps {
  value: string;
  onChange: (value: string) => void;
  contractors: Contractor[];
  logisticsType: string;
  onContractorsChange: () => void;
  required?: boolean;
}

export function ContractorSelect({
  value,
  onChange,
  contractors,
  logisticsType,
  onContractorsChange,
  required,
}: ContractorSelectProps) {
  const { canContractorsCreate, canContractorsDelete } = useRbacPermission();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [menuLayout, setMenuLayout] = useState<MenuLayout | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const updateMenuLayout = () => {
    if (!triggerRef.current) return;
    setMenuLayout(getMenuLayout(triggerRef.current));
  };

  useLayoutEffect(() => {
    if (!open) {
      setMenuLayout(null);
      return;
    }
    updateMenuLayout();
    window.addEventListener('resize', updateMenuLayout);
    window.addEventListener('scroll', updateMenuLayout, true);
    return () => {
      window.removeEventListener('resize', updateMenuLayout);
      window.removeEventListener('scroll', updateMenuLayout, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
      setAddMode(false);
      setError('');
    };
    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', onPointerDown);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  const displayLabel = value || 'Korxonani tanlang';

  const handleSelect = (name: string) => {
    if (name === ADD_OPTION) {
      setAddMode(true);
      setNewName('');
      setError('');
      setOpen(false);
      return;
    }
    onChange(name);
    setOpen(false);
    setAddMode(false);
    setError('');
  };

  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setError('Korxona nomini kiriting');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await api.createContractor(trimmed, logisticsType);
      notifyOrdersChanged();
      onContractorsChange();
      onChange(res.data ? res.data.name : trimmed);
      setAddMode(false);
      setNewName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik yuz berdi');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (contractor: Contractor, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!canContractorsDelete) return;
    if (!window.confirm(`"${contractor.name}" ro'yxatdan o'chirilsinmi?`)) return;
    addDeletedContractorId(contractor.id, contractor.name);
    try {
      if (!contractor.id.startsWith('default-')) {
        await api.deleteContractor(contractor.id);
      }
    } catch {}
    notifyOrdersChanged();
    onContractorsChange();
    if (value === contractor.name) onChange('');
  };

  const cleanContractors = contractors.filter(c => !isRogueContractor(c.name));

  const menu = open && menuLayout ? (
    <div
      ref={menuRef}
      className="contractor-select-menu contractor-select-menu--fixed"
      style={{
        top: menuLayout.top,
        left: menuLayout.left,
        width: menuLayout.width,
        maxHeight: MENU_MAX_HEIGHT,
      }}
      role="listbox"
    >
      {cleanContractors.map(contractor => (
        <div key={contractor.id} className="contractor-select-row">
          <button
            type="button"
            role="option"
            aria-selected={value === contractor.name}
            onClick={() => handleSelect(contractor.name)}
            className={`contractor-select-item${value === contractor.name ? ' contractor-select-item--active' : ''}`}
          >
            {contractor.name}
          </button>
          {canContractorsDelete && (
            <button
              type="button"
              className="contractor-select-delete"
              aria-label={`${contractor.name} ni o'chirish`}
              onClick={event => handleDelete(contractor, event)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}

      {canContractorsCreate && (
        <button
          type="button"
          onClick={() => handleSelect(ADD_OPTION)}
          className="contractor-select-add-option"
        >
          <Plus className="w-3.5 h-3.5" />
          Boshqa korxona qo&apos;shish
        </button>
      )}
    </div>
  ) : null;

  return (
    <div className="contractor-select" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(current => !current)}
        className={`contractor-select-trigger order-sheet-input order-sheet-input--contractor${open ? ' contractor-select-trigger--open' : ''}${!value ? ' contractor-select-trigger--empty' : ''}`}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="contractor-select-label">{displayLabel}</span>
        <ChevronDown className="contractor-select-chevron" />
      </button>

      {required && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          className="date-picker-hidden-input"
          value={value}
          onChange={() => {}}
          required
        />
      )}

      {menu && createPortal(menu, document.body)}

      {addMode && (
        <div className="contractor-select-add-form">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Yangi korxona nomi"
            className="order-sheet-input"
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleAdd();
              }
            }}
          />
          <div className="contractor-select-add-actions">
            <button type="button" onClick={() => { setAddMode(false); setError(''); }} className="btn-secondary contractor-select-add-btn">
              Bekor
            </button>
            <button type="button" onClick={() => void handleAdd()} disabled={saving} className="btn-primary contractor-select-add-btn">
              {saving ? '...' : 'Qo\'shish'}
            </button>
          </div>
          {error && <p className="contractor-select-error">{error}</p>}
        </div>
      )}
    </div>
  );
}
