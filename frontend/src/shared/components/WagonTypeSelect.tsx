import { useEffect, useState } from 'react';
import { TrainFront } from 'lucide-react';
import { api } from '../services/api';
import { DEFAULT_WAGON_TYPES } from '../constants/wagonTypes';
import type { CatalogWagonType } from '../types';

interface WagonTypeSelectProps {
  value: string;
  onChange: (val: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export function WagonTypeSelect({
  value,
  onChange,
  label = 'Vagon turi',
  required = false,
  disabled = false,
  className = '',
}: WagonTypeSelectProps) {
  const [types, setTypes] = useState<string[]>([...DEFAULT_WAGON_TYPES]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    api.getWagonTypes(false)
      .then(res => {
        if (!isMounted) return;
        if (res.data && res.data.length > 0) {
          const names = res.data.map((w: CatalogWagonType) => w.name);
          setTypes(names);
        }
      })
      .catch(() => {
        // Fallback to DEFAULT_WAGON_TYPES
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 flex items-center gap-1.5">
          <TrainFront className="w-3.5 h-3.5 text-amber-500" />
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled || loading}
        required={required}
        className="w-full px-3 py-2 text-xs sm:text-sm bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 font-medium text-gray-900 dark:text-slate-100 disabled:opacity-50"
      >
        <option value="">-- Vagon turini tanlang --</option>
        {types.map(t => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </div>
  );
}
