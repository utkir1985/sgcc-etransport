import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import {
  buildDefaultDestinations,
  getDefaultStationsForContractor,
} from '../constants/railwayContractors';
import { api } from '../services/api';
import type { ContractorDestination } from '../types';

const ADD_OPTION = '__add_station__';
const MENU_MAX_HEIGHT = 240;

interface MenuLayout {
  top: number;
  left: number;
  width: number;
}

function getMenuLayout(trigger: HTMLElement): MenuLayout {
  const rect = trigger.getBoundingClientRect();
  const cellRect = trigger.closest('td')?.getBoundingClientRect() ?? rect;
  const width = Math.max(cellRect.width, rect.width, 220);
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

interface StationSelectProps {
  value: string;
  onChange: (value: string) => void;
  contractorName: string;
  logisticsType: string;
  required?: boolean;
}

export function StationSelect({
  value,
  onChange,
  contractorName,
  logisticsType,
  required,
}: StationSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [menuLayout, setMenuLayout] = useState<MenuLayout | null>(null);
  const [destinations, setDestinations] = useState<ContractorDestination[]>([]);
  const [addMode, setAddMode] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const disabled = !contractorName.trim();

  const loadDestinations = () => {
    if (!contractorName.trim()) {
      setDestinations([]);
      return;
    }
    api.getContractorDestinations(logisticsType, contractorName)
      .then(res => {
        if (res.data?.length) {
          setDestinations(res.data);
          return;
        }
        const defaults = getDefaultStationsForContractor(contractorName);
        setDestinations(buildDefaultDestinations(contractorName, defaults, logisticsType));
      })
      .catch(() => {
        const defaults = getDefaultStationsForContractor(contractorName);
        setDestinations(buildDefaultDestinations(contractorName, defaults, logisticsType));
      });
  };

  useEffect(() => {
    loadDestinations();
    setOpen(false);
    setAddMode(false);
    setError('');
  }, [contractorName, logisticsType]);

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

  const displayLabel = disabled
    ? 'Avval korxonani tanlang'
    : (value || 'Stansiyani tanlang');

  const handleSelect = (stationName: string) => {
    if (stationName === ADD_OPTION) {
      setAddMode(true);
      setNewName('');
      setError('');
      setOpen(false);
      return;
    }
    onChange(stationName);
    setOpen(false);
    setAddMode(false);
    setError('');
  };

  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setError('Stansiya nomini kiriting');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await api.createContractorDestination(contractorName, logisticsType, trimmed);
      if (res.data) {
        loadDestinations();
        onChange(res.data.stationName);
        setAddMode(false);
        setNewName('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik yuz berdi');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (destination: ContractorDestination, event: React.MouseEvent) => {
    event.stopPropagation();
    if (destination.isSystem || destination.id.startsWith('default-')) return;
    if (!window.confirm(`"${destination.stationName}" ro'yxatdan o'chirilsinmi?`)) return;
    try {
      await api.deleteContractorDestination(destination.id);
      loadDestinations();
      if (value === destination.stationName) onChange('');
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'O\'chirib bo\'lmadi');
    }
  };

  const menu = open && menuLayout && !disabled ? (
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
      {destinations.map(destination => (
        <div key={destination.id} className="contractor-select-row">
          <button
            type="button"
            role="option"
            aria-selected={value === destination.stationName}
            onClick={() => handleSelect(destination.stationName)}
            className={`contractor-select-item${value === destination.stationName ? ' contractor-select-item--active' : ''}`}
          >
            {destination.stationName}
          </button>
          {!destination.isSystem && !destination.id.startsWith('default-') && (
            <button
              type="button"
              className="contractor-select-delete"
              aria-label={`${destination.stationName} ni o'chirish`}
              onClick={event => handleDelete(destination, event)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={() => handleSelect(ADD_OPTION)}
        className="contractor-select-add-option"
      >
        <Plus className="w-3.5 h-3.5" />
        Boshqa stansiya qo&apos;shish
      </button>
    </div>
  ) : null;

  return (
    <div className="contractor-select" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(current => !current)}
        className={`contractor-select-trigger order-sheet-input${open ? ' contractor-select-trigger--open' : ''}${!value || disabled ? ' contractor-select-trigger--empty' : ''}`}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="contractor-select-label">{displayLabel}</span>
        <ChevronDown className="contractor-select-chevron" />
      </button>

      {required && !disabled && (
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

      {addMode && !disabled && (
        <div className="contractor-select-add-form">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Yangi stansiya nomi"
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
