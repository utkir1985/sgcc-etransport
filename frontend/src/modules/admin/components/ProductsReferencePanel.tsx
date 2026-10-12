import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, Train, Truck, X } from 'lucide-react';
import { api } from '../../../shared/services/api';
import type { CatalogProduct } from '../../../shared/types';
import { LOGISTICS_LABELS, LOGISTICS_TYPES, type LogisticsType } from '../../../shared/constants/logisticsTypes';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { ProductTypeIcon } from '../../../shared/components/ProductTypeIcon';
import { notifyOrdersChanged } from '../../../shared/utils/realtimeSync';
import { useRbacPermission } from '../../../shared/hooks/useRbacPermission';

export function ProductsReferencePanel() {
  const { canProductsCreate, canProductsUpdate, canProductsDelete } = useRbacPermission();
  const [tab, setTab] = useState<LogisticsType>(LOGISTICS_TYPES.Railway);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<'create' | 'edit' | null>(null);
  const [selected, setSelected] = useState<CatalogProduct | null>(null);
  const [name, setName] = useState('');
  const [orderPrefix, setOrderPrefix] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.getProducts(tab, true)
      .then(res => setProducts(res.data ?? []))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [tab]);

  const openCreate = () => {
    setSelected(null);
    setName('');
    setOrderPrefix('');
    setIsActive(true);
    setError('');
    setDialog('create');
  };

  const openEdit = (product: CatalogProduct) => {
    setSelected(product);
    setName(product.name);
    setOrderPrefix(product.orderPrefix);
    setIsActive(product.isActive);
    setError('');
    setDialog('edit');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('Mahsulot nomi majburiy');
      return;
    }
    if (!/^[A-Z0-9]{2,10}$/.test(orderPrefix)) {
      setError('Buyurtma ID prefiksi 2–10 ta lotin harfi yoki raqamdan iborat bo‘lsin');
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (dialog === 'create') {
        await api.createProduct(name.trim(), tab, orderPrefix);
      } else if (selected) {
        await api.updateProduct(selected.id, { name: name.trim(), orderPrefix, isActive });
      }
      setDialog(null);
      notifyOrdersChanged();
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
      await api.deleteProduct(deleteId);
      setDeleteId(null);
      notifyOrdersChanged();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'O\'chirishda xatolik');
      setDeleteId(null);
    }
  };

  const deleting = products.find(p => p.id === deleteId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="admin-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === LOGISTICS_TYPES.Railway}
            className={`admin-tabs__btn${tab === LOGISTICS_TYPES.Railway ? ' admin-tabs__btn--active' : ''}`}
            onClick={() => setTab(LOGISTICS_TYPES.Railway)}
          >
            <Train className="w-4 h-4" strokeWidth={1.75} />
            {LOGISTICS_LABELS.Railway}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === LOGISTICS_TYPES.Road}
            className={`admin-tabs__btn${tab === LOGISTICS_TYPES.Road ? ' admin-tabs__btn--active' : ''}`}
            onClick={() => setTab(LOGISTICS_TYPES.Road)}
          >
            <Truck className="w-4 h-4" strokeWidth={1.75} />
            {LOGISTICS_LABELS.Road}
          </button>
        </div>
        {canProductsCreate && (
          <button type="button" className="btn-primary" onClick={openCreate}>
            <Plus className="w-4 h-4" /> Yangi mahsulot
          </button>
        )}
      </div>

      <div className="ui-card overflow-hidden">
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Mahsulot</th>
                <th>Buyurtma ID</th>
                <th>Holat</th>
                <th className="admin-table__actions">Amallar</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="admin-table-loading">Yuklanmoqda...</td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={4} className="admin-table-empty">Mahsulotlar mavjud emas</td>
                </tr>
              ) : (
                products.map(product => (
                  <tr key={product.id} className={!product.isActive ? 'opacity-50' : undefined}>
                    <td>
                      <div className="admin-user-cell">
                        <ProductTypeIcon productType={product.name} size="md" />
                        <span className="admin-user-cell__login">{product.name}</span>
                      </div>
                    </td>
                    <td>
                      <span className="admin-role-badge admin-role-badge--blue">
                        {product.orderPrefix ? `${product.orderPrefix}-00001` : 'Sozlanmagan'}
                      </span>
                    </td>
                    <td>
                      <span className={`admin-role-badge admin-role-badge--${product.isActive ? 'emerald' : 'rose'}`}>
                        {product.isActive ? 'Faol' : 'Nofaol'}
                      </span>
                    </td>
                    <td>
                      <div className="admin-table__action-group">
                        {canProductsUpdate && (
                          <button
                            type="button"
                            className="p-1.5 rounded-lg border border-blue-200/80 bg-blue-50/80 text-blue-600 hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-950/50 dark:text-blue-400 dark:hover:bg-blue-900/60 transition-all hover:scale-110 shadow-2xs cursor-pointer"
                            title="Tahrirlash"
                            onClick={() => openEdit(product)}
                          >
                            <Pencil className="w-4 h-4 stroke-[2]" />
                          </button>
                        )}
                        {canProductsDelete && (
                          <button
                            type="button"
                            className="p-1.5 rounded-lg border border-rose-200/80 bg-rose-50/80 text-rose-600 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/50 dark:text-rose-400 dark:hover:bg-rose-900/60 transition-all hover:scale-110 shadow-2xs cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
                            title={product.isSystem ? 'Tizim mahsulotini o\'chirish mumkin emas' : 'O\'chirish'}
                            disabled={product.isSystem}
                            onClick={() => setDeleteId(product.id)}
                          >
                            <Trash2 className="w-4 h-4 stroke-[2]" />
                          </button>
                        )}
                        {!canProductsUpdate && !canProductsDelete && (
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
            {LOGISTICS_LABELS[tab]}: {products.length} ta mahsulot
          </p>
        </div>
      </div>

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
                {dialog === 'create' ? 'Yangi mahsulot' : 'Mahsulotni tahrirlash'}
              </h2>
            </div>
            <form className="admin-user-form" onSubmit={submit}>
              <label className="admin-field">
                <span>Logistika</span>
                <input value={LOGISTICS_LABELS[tab]} disabled />
              </label>
              <label className="admin-field">
                <span>Mahsulot nomi</span>
                <input
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Masalan: Suyultirilgan gaz"
                />
              </label>
              <label className="admin-field">
                <span>Buyurtma ID prefiksi</span>
                <input
                  required
                  minLength={2}
                  maxLength={10}
                  value={orderPrefix}
                  onChange={e => setOrderPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  placeholder="Masalan: PE"
                />
                <small>Buyurtmalar {orderPrefix || 'PE'}-00001 ko‘rinishida raqamlanadi.</small>
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

      <ConfirmDialog
        open={!!deleteId}
        title="Mahsulotni o'chirish"
        message={deleting ? `"${deleting.name}" o'chirilsinmi? MS va MXda ham ko'rinmay qoladi.` : ''}
        confirmLabel="O'chirish"
        variant="danger"
        onConfirm={() => { void confirmDelete(); }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
