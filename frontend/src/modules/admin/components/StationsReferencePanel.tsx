import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { api } from '../../../shared/services/api';
import type { CatalogStation } from '../../../shared/types';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { ProductTypeIcon } from '../../../shared/components/ProductTypeIcon';
import { DEFAULT_STATIONS } from '../../../shared/constants/stations';
import { useRbacPermission } from '../../../shared/hooks/useRbacPermission';

const DEFAULT_ITEMS: CatalogStation[] = DEFAULT_STATIONS.map((name, sortOrder) => ({
  id: `default-${sortOrder}`,
  name,
  code: sortOrder === 0 ? 'ST-KENGSOY' : `ST-${sortOrder}`,
  logisticsType: 'Railway',
  sortOrder,
  isActive: true,
  isSystem: true,
  createdAt: new Date().toISOString(),
}));

export function StationsReferencePanel() {
  const { canStationsCreate, canStationsUpdate, canStationsDelete } = useRbacPermission();
  const [stations, setStations] = useState<CatalogStation[]>(DEFAULT_ITEMS);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<'create' | 'edit' | null>(null);
  const [selected, setSelected] = useState<CatalogStation | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [logisticsType, setLogisticsType] = useState('Railway');
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.getStations(undefined, true)
      .then(res => {
        if (res.data && res.data.length > 0) {
          setStations(res.data);
        } else {
          setStations(DEFAULT_ITEMS);
        }
      })
      .catch(() => setStations(DEFAULT_ITEMS))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setSelected(null);
    setName('');
    setCode('');
    setLogisticsType('Railway');
    setIsActive(true);
    setError('');
    setDialog('create');
  };

  const openEdit = (s: CatalogStation) => {
    setSelected(s);
    setName(s.name);
    setCode(s.code || '');
    setLogisticsType(s.logisticsType || 'Railway');
    setIsActive(s.isActive);
    setError('');
    setDialog('edit');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('Stansiya nomi majburiy');
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (dialog === 'create') {
        await api.createStation(name.trim(), code.trim() || undefined, logisticsType);
      } else if (selected && !selected.id.startsWith('default-')) {
        await api.updateStation(selected.id, {
          name: name.trim(),
          code: code.trim() || undefined,
          logisticsType,
          isActive,
        });
      } else if (selected) {
        await api.createStation(name.trim(), code.trim() || undefined, logisticsType);
      }
      setDialog(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Saqlashda xatolik');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      if (!deleteId.startsWith('default-')) {
        await api.deleteStation(deleteId);
      }
      setDeleteId(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'O\'chirishda xatolik');
      setDeleteId(null);
    }
  };

  const deleting = stations.find(s => s.id === deleteId);

  return (
    <div className="space-y-4">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div />
        {canStationsCreate && (
          <button type="button" className="btn-primary" onClick={openCreate}>
            <Plus className="w-4 h-4" /> Yangi stansiya
          </button>
        )}
      </div>

      {/* Main Table Card (matching Products style) */}
      <div className="ui-card overflow-hidden">
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Stansiya</th>
                <th>Holat</th>
                <th className="admin-table__actions">Amallar</th>
              </tr>
            </thead>
            <tbody>
              {loading && stations.length === 0 ? (
                <tr>
                  <td colSpan={3} className="admin-table__empty">Yuklanmoqda...</td>
                </tr>
              ) : stations.length === 0 ? (
                <tr>
                  <td colSpan={3} className="admin-table__empty">
                    Stansiya yo&apos;q. Yangi stansiya qo&apos;shing.
                  </td>
                </tr>
              ) : (
                stations.map(st => (
                  <tr key={st.id} className={!st.isActive ? 'opacity-50' : undefined}>
                    <td>
                      <div className="admin-user-cell">
                        <ProductTypeIcon productType={st.name} size="md" />
                        <div className="flex flex-col">
                          <span className="admin-user-cell__login font-bold">{st.name}</span>
                          {st.code && (
                            <span className="text-[11px] text-gray-400 font-mono">{st.code}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`admin-role-badge admin-role-badge--${st.isActive ? 'emerald' : 'rose'}`}>
                        {st.isActive ? 'Faol' : 'Nofaol'}
                      </span>
                    </td>
                    <td>
                      <div className="admin-table__action-group">
                        {canStationsUpdate && (
                          <button
                            type="button"
                            className="admin-icon-btn"
                            title="Tahrirlash"
                            onClick={() => openEdit(st)}
                          >
                            <Pencil className="w-4 h-4" strokeWidth={1.75} />
                          </button>
                        )}
                        {canStationsDelete && (
                          <button
                            type="button"
                            className="admin-icon-btn admin-icon-btn--danger"
                            title={st.isSystem ? "Tizim stansiyasini o'chirish mumkin emas" : "O'chirish"}
                            disabled={st.isSystem}
                            onClick={() => setDeleteId(st.id)}
                          >
                            <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                          </button>
                        )}
                        {!canStationsUpdate && !canStationsDelete && (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="admin-table-footer">
          <p className="admin-table-footer__count">
            Stansiyalar: {stations.length} ta stansiya
          </p>
        </div>
      </div>

      {/* Add / Edit Dialog (matching Products dialog) */}
      {dialog && (
        <div className="confirm-dialog-root" role="presentation">
          <button type="button" className="confirm-dialog-backdrop" aria-label="Yopish" onClick={() => setDialog(null)} />
          <div className="confirm-dialog admin-user-dialog" role="dialog" aria-modal="true">
            <button type="button" className="confirm-dialog__close" aria-label="Yopish" onClick={() => setDialog(null)}>
              <X className="w-4 h-4" strokeWidth={1.75} />
            </button>
            <div className="confirm-dialog__header">
              <div className="confirm-dialog__icon">
                <Plus className="w-5 h-5" strokeWidth={1.75} />
              </div>
              <h2 className="confirm-dialog__title">
                {dialog === 'create' ? 'Yangi stansiya' : 'Stansiyani tahrirlash'}
              </h2>
            </div>
            <form className="admin-user-form" onSubmit={submit}>
              <label className="admin-field">
                <span>Stansiya nomi</span>
                <input
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Masalan: Kengsoy stansiyasi"
                />
              </label>
              <label className="admin-field">
                <span>Kodi (ixtiyoriy)</span>
                <input
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  placeholder="Masalan: ST-KENGSOY"
                />
              </label>
              {dialog === 'edit' && (
                <label className="admin-field">
                  <span>Holat</span>
                  <select
                    value={isActive ? 'active' : 'inactive'}
                    onChange={e => setIsActive(e.target.value === 'active')}
                  >
                    <option value="active">Faol</option>
                    <option value="inactive">Nofaol</option>
                  </select>
                </label>
              )}
              {error && <p className="confirm-dialog__error">{error}</p>}
              <div className="confirm-dialog__actions">
                <button type="button" className="btn-secondary confirm-dialog__btn" onClick={() => setDialog(null)}>
                  Bekor qilish
                </button>
                <button type="submit" className="btn-primary confirm-dialog__btn" disabled={saving}>
                  {saving ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteId}
        title="Stansiyani o'chirish"
        message={deleting ? `"${deleting.name}" o'chirilsinmi?` : ''}
        confirmLabel="O'chirish"
        variant="danger"
        onConfirm={() => { void confirmDelete(); }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
