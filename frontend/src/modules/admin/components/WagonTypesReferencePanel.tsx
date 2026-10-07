import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { api } from '../../../shared/services/api';
import type { CatalogWagonType } from '../../../shared/types';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { ProductTypeIcon } from '../../../shared/components/ProductTypeIcon';
import { DEFAULT_WAGON_TYPES } from '../../../shared/constants/wagonTypes';
import { useRbacPermission } from '../../../shared/hooks/useRbacPermission';

const DEFAULT_ITEMS: CatalogWagonType[] = DEFAULT_WAGON_TYPES.map((name, sortOrder) => ({
  id: `default-${sortOrder}`,
  name,
  code: '',
  description: '',
  sortOrder,
  isActive: true,
  isSystem: true,
  createdAt: new Date().toISOString(),
}));

export function WagonTypesReferencePanel() {
  const { canWagonTypesCreate, canWagonTypesUpdate, canWagonTypesDelete } = useRbacPermission();
  const [wagonTypes, setWagonTypes] = useState<CatalogWagonType[]>(DEFAULT_ITEMS);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<'create' | 'edit' | null>(null);
  const [selected, setSelected] = useState<CatalogWagonType | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.getWagonTypes(true)
      .then(res => {
        if (res.data && res.data.length > 0) {
          setWagonTypes(res.data);
        } else {
          setWagonTypes(DEFAULT_ITEMS);
        }
      })
      .catch(() => setWagonTypes(DEFAULT_ITEMS))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setSelected(null);
    setName('');
    setCode('');
    setDescription('');
    setIsActive(true);
    setError('');
    setDialog('create');
  };

  const openEdit = (wt: CatalogWagonType) => {
    setSelected(wt);
    setName(wt.name);
    setCode(wt.code || '');
    setDescription(wt.description || '');
    setIsActive(wt.isActive);
    setError('');
    setDialog('edit');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('Vagon turi nomi majburiy');
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (dialog === 'create') {
        await api.createWagonType(name.trim(), code.trim() || undefined, description.trim() || undefined);
      } else if (selected && !selected.id.startsWith('default-')) {
        await api.updateWagonType(selected.id, {
          name: name.trim(),
          code: code.trim() || undefined,
          description: description.trim() || undefined,
          isActive,
        });
      } else if (selected) {
        await api.createWagonType(name.trim(), code.trim() || undefined, description.trim() || undefined);
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
        await api.deleteWagonType(deleteId);
      }
      setDeleteId(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'O\'chirishda xatolik');
      setDeleteId(null);
    }
  };

  const deleting = wagonTypes.find(w => w.id === deleteId);

  return (
    <div className="space-y-4">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div />
        {canWagonTypesCreate && (
          <button type="button" className="btn-primary" onClick={openCreate}>
            <Plus className="w-4 h-4" /> Yangi vagon turi
          </button>
        )}
      </div>

      {/* Main Table Card (matching Products style) */}
      <div className="ui-card overflow-hidden">
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Vagon turi</th>
                <th>Holat</th>
                <th className="admin-table__actions">Amallar</th>
              </tr>
            </thead>
            <tbody>
              {loading && wagonTypes.length === 0 ? (
                <tr>
                  <td colSpan={3} className="admin-table__empty">Yuklanmoqda...</td>
                </tr>
              ) : wagonTypes.length === 0 ? (
                <tr>
                  <td colSpan={3} className="admin-table__empty">
                    Vagon turi yo&apos;q. Yangi vagon turi qo&apos;shing.
                  </td>
                </tr>
              ) : (
                wagonTypes.map(wt => (
                  <tr key={wt.id} className={!wt.isActive ? 'opacity-50' : undefined}>
                    <td>
                      <div className="admin-user-cell">
                        <ProductTypeIcon productType={wt.name} size="md" />
                        <span className="admin-user-cell__login">{wt.name}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`admin-role-badge admin-role-badge--${wt.isActive ? 'emerald' : 'rose'}`}>
                        {wt.isActive ? 'Faol' : 'Nofaol'}
                      </span>
                    </td>
                    <td>
                      <div className="admin-table__action-group">
                        {canWagonTypesUpdate && (
                          <button
                            type="button"
                            className="admin-icon-btn"
                            title="Tahrirlash"
                            onClick={() => openEdit(wt)}
                          >
                            <Pencil className="w-4 h-4" strokeWidth={1.75} />
                          </button>
                        )}
                        {canWagonTypesDelete && (
                          <button
                            type="button"
                            className="admin-icon-btn admin-icon-btn--danger"
                            title={wt.isSystem ? "Tizim vagon turini o'chirish mumkin emas" : "O'chirish"}
                            disabled={wt.isSystem}
                            onClick={() => setDeleteId(wt.id)}
                          >
                            <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                          </button>
                        )}
                        {!canWagonTypesUpdate && !canWagonTypesDelete && (
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
            Vagon turlari: {wagonTypes.length} ta vagon turi
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
                {dialog === 'create' ? 'Yangi vagon turi' : 'Vagon turini tahrirlash'}
              </h2>
            </div>
            <form className="admin-user-form" onSubmit={submit}>
              <label className="admin-field">
                <span>Vagon turi nomi</span>
                <input
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Masalan: Suyultirilgan gaz mahsuloti uchun Vagon sisterna"
                />
              </label>
              <label className="admin-field">
                <span>Kodi (ixtiyoriy)</span>
                <input
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  placeholder="Masalan: V-SIST-GAS"
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
        title="Vagon turini o'chirish"
        message={deleting ? `"${deleting.name}" o'chirilsinmi?` : ''}
        confirmLabel="O'chirish"
        variant="danger"
        onConfirm={() => { void confirmDelete(); }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
