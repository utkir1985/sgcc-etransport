import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Minus,
  Pencil,
  Plus,
  FileSpreadsheet,
  RotateCcw,
  Search,
  Shield,
  Trash2,
  X,
} from 'lucide-react';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { exportSheet, todayStamp, type SheetCell } from '../../../shared/utils/excelExport';
import {
  buildObjectModel,
  RESOURCE_EXPLANATIONS,
  CRUD_OP_LABEL,
  type CrudOp,
  type CrudOpBinding,
  getRoleIcon,
  MENU_MODULE,
  type ObjectPermView,
  ROLE_ICON_MAP,
  ROLE_ICON_OPTIONS,
  ROLE_MODULES,
  type RbacActionDef,
  type RbacRoleDef,
  type RbacTone,
} from '../rbacCatalog';
import { useRbacStore } from '../rbacStore';

const TONE_OPTIONS: RbacTone[] = ['blue', 'emerald', 'violet', 'amber', 'cyan', 'rose', 'indigo', 'sky'];

function RoleSelect({
  value,
  onChange,
  roles,
}: {
  value: string;
  onChange: (role: string) => void;
  roles: RbacRoleDef[];
}) {
  return (
    <label className="admin-filter-bar__field">
      <span>Rol</span>
      <select value={value} onChange={e => onChange(e.target.value)}>
        {roles.map(role => (
          <option key={role.key} value={role.key}>{role.label}</option>
        ))}
      </select>
    </label>
  );
}

function MatrixCell({
  on,
  interactive,
  onToggle,
}: {
  on: boolean;
  interactive?: boolean;
  onToggle?: () => void;
}) {
  if (interactive) {
    return (
      <button
        type="button"
        className={`rbac-matrix-cell rbac-matrix-cell--btn${on ? ' rbac-matrix-cell--on' : ''}`}
        onClick={onToggle}
        title={on ? 'O\'chirish' : 'Yoqish'}
      >
        {on ? <Check className="w-3.5 h-3.5" strokeWidth={2.5} /> : <Minus className="w-3.5 h-3.5" strokeWidth={2} />}
      </button>
    );
  }

  return (
    <span className={`rbac-matrix-cell${on ? ' rbac-matrix-cell--on' : ''}`}>
      {on ? <Check className="w-3.5 h-3.5" strokeWidth={2.5} /> : <Minus className="w-3.5 h-3.5" strokeWidth={2} />}
    </span>
  );
}


const ROLE_TONE_STYLES: Record<RbacTone, { bg: string; text: string; border: string; dot: string; label: string }> = {
  blue: { bg: 'bg-blue-50 dark:bg-blue-950/60', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-200/80 dark:border-blue-800', dot: 'bg-blue-500', label: 'Blue' },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-950/60', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-200/80 dark:border-emerald-800', dot: 'bg-emerald-500', label: 'Emerald' },
  violet: { bg: 'bg-violet-50 dark:bg-violet-950/60', text: 'text-violet-600 dark:text-violet-400', border: 'border-violet-200/80 dark:border-violet-800', dot: 'bg-violet-500', label: 'Violet' },
  amber: { bg: 'bg-amber-50 dark:bg-amber-950/60', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-200/80 dark:border-amber-800', dot: 'bg-amber-500', label: 'Amber' },
  cyan: { bg: 'bg-cyan-50 dark:bg-cyan-950/60', text: 'text-cyan-600 dark:text-cyan-400', border: 'border-cyan-200/80 dark:border-cyan-800', dot: 'bg-cyan-500', label: 'Cyan' },
  rose: { bg: 'bg-rose-50 dark:bg-rose-950/60', text: 'text-rose-600 dark:text-rose-400', border: 'border-rose-200/80 dark:border-rose-800', dot: 'bg-rose-500', label: 'Rose' },
  indigo: { bg: 'bg-indigo-50 dark:bg-indigo-950/60', text: 'text-indigo-600 dark:text-indigo-400', border: 'border-indigo-200/80 dark:border-indigo-800', dot: 'bg-indigo-500', label: 'Indigo' },
  sky: { bg: 'bg-sky-50 dark:bg-sky-950/60', text: 'text-sky-600 dark:text-sky-400', border: 'border-sky-200/80 dark:border-sky-800', dot: 'bg-sky-500', label: 'Sky' },
};

function RoleFormDialog({
  open,
  title,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  initial?: Partial<RbacRoleDef>;
  allowCode?: boolean;
  onClose: () => void;
  onSubmit: (values: { label: string; login: string; description: string; tone: RbacTone; iconName: string }) => void;
}) {
  const [label, setLabel] = useState('');
  const [login, setLogin] = useState('');
  const [description, setDescription] = useState('');
  const [tone, setTone] = useState<RbacTone>('blue');
  const [iconName, setIconName] = useState('shield');
  const [iconOpen, setIconOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setLabel(initial?.label ?? '');
      setLogin(initial?.seedUser || (initial?.key ? initial.key.toLowerCase() : ''));
      setDescription(initial?.description ?? '');
      setTone(initial?.tone ?? 'blue');
      setIconName(initial?.iconName ?? (initial ? (initial.key === 'Admin' || initial.key === 'Management' || initial.key === 'DispatchSupervisor' ? 'crown' : initial.key === 'Marketing' ? 'megaphone' : initial.key === 'Accounting' || initial.key === 'Economist' ? 'calculator' : initial.key === 'Railway' ? 'train' : initial.key === 'Road' || initial.key === 'Dispatching' ? 'truck' : initial.key === 'Warehouse' ? 'warehouse' : initial.key === 'Scale' ? 'scale' : 'shield') : 'shield'));
      setIconOpen(false);
      setColorOpen(false);
      setError('');
    }
  }, [open, initial]);

  if (!open) return null;

  const SelectedIcon = ROLE_ICON_MAP[iconName] || Shield;
  const currentIconOption = ROLE_ICON_OPTIONS.find(o => o.key === iconName);

  return (
    <div className="confirm-dialog-root" role="presentation">
      <button type="button" className="confirm-dialog-backdrop" aria-label="Yopish" onClick={onClose} />
      <div className="confirm-dialog admin-user-dialog !max-w-xl !p-6 !rounded-3xl" role="dialog" aria-modal="true">
        <button
          type="button"
          className="absolute right-5 top-5 p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Yopish"
          onClick={onClose}
        >
          <X className="w-4 h-4" strokeWidth={2} />
        </button>
        
        <div className="flex items-center gap-3.5 mb-6">
          <div className="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-800 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-2xs">
            <SelectedIcon className="w-5 h-5" strokeWidth={2} />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{title}</h2>
        </div>

        <form
          className="space-y-4"
          onSubmit={e => {
            e.preventDefault();
            if (!label.trim()) {
              setError('Rol nomi kiritilishi shart');
              return;
            }
            if (!login.trim()) {
              setError('Login kiritilishi shart');
              return;
            }
            try {
              onSubmit({
                label: label.trim(),
                login: login.trim().toLowerCase(),
                description: description.trim(),
                tone,
                iconName,
              });
              onClose();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Xatolik yuz berdi');
            }
          }}
        >
          {/* 2x2 Grid Form Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Rol nomi */}
            <div>
              <label className="block font-semibold text-xs text-slate-700 dark:text-slate-300 mb-1.5">
                Rol nomi <span className="text-rose-500">*</span>
              </label>
              <input
                required
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="Masalan: Administrator"
                className="w-full h-11 px-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-2xs"
              />
            </div>

            {/* Login */}
            <div>
              <label className="block font-semibold text-xs text-slate-700 dark:text-slate-300 mb-1.5">
                Login <span className="text-rose-500">*</span>
              </label>
              <input
                required
                value={login}
                onChange={e => setLogin(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                placeholder="admin"
                className="w-full h-11 px-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-2xs"
              />
            </div>

            {/* Ikonka */}
            <div>
              <label className="block font-semibold text-xs text-slate-700 dark:text-slate-300 mb-1.5">
                Ikonka belgisi
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setIconOpen(v => !v);
                    setColorOpen(false);
                  }}
                  className="w-full h-11 px-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-2xs"
                >
                  <span className="flex items-center gap-2 truncate">
                    <SelectedIcon className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400 shrink-0" strokeWidth={2} />
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{currentIconOption?.label ?? 'Ikonka tanlang'}</span>
                  </span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${iconOpen ? 'rotate-180 text-blue-500' : ''}`} />
                </button>

                {iconOpen && (
                  <div className="absolute z-50 mt-1.5 w-full max-h-60 overflow-y-auto custom-scrollbar bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl p-1.5 flex flex-col gap-1 animate-in fade-in-50 zoom-in-95 duration-150">
                    {ROLE_ICON_OPTIONS.map(opt => {
                      const IconComp = opt.icon;
                      const active = iconName === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all w-full text-left ${
                            active
                              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold ring-1 ring-blue-200 dark:ring-blue-800'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                          }`}
                          onClick={() => {
                            setIconName(opt.key);
                            setIconOpen(false);
                          }}
                        >
                          <IconComp className={`w-4.5 h-4.5 shrink-0 ${active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`} strokeWidth={2} />
                          <span className="font-medium text-slate-800 dark:text-slate-200">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Rang belgisi */}
            <div>
              <label className="block font-semibold text-xs text-slate-700 dark:text-slate-300 mb-1.5">
                Rang belgisi
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setColorOpen(v => !v);
                    setIconOpen(false);
                  }}
                  className="w-full h-11 px-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-2xs"
                >
                  <span className="flex items-center gap-2">
                    <span className={`w-3.5 h-3.5 rounded-full ${ROLE_TONE_STYLES[tone]?.dot ?? 'bg-blue-500'}`} />
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{ROLE_TONE_STYLES[tone]?.label ?? tone}</span>
                  </span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${colorOpen ? 'rotate-180 text-blue-500' : ''}`} />
                </button>

                {colorOpen && (
                  <div className="absolute z-50 mt-1.5 w-full max-h-60 overflow-y-auto custom-scrollbar bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl p-1.5 flex flex-col gap-1 animate-in fade-in-50 zoom-in-95 duration-150">
                    {TONE_OPTIONS.map(t => {
                      const style = ROLE_TONE_STYLES[t];
                      const active = tone === t;
                      return (
                        <button
                          key={t}
                          type="button"
                          className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all w-full text-left ${
                            active
                              ? `${style.bg} ${style.text} font-bold ring-1 ${style.border}`
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                          }`}
                          onClick={() => {
                            setTone(t);
                            setColorOpen(false);
                          }}
                        >
                          <span className={`w-3 h-3 rounded-full ${style.dot}`} />
                          <span className="font-medium text-slate-800 dark:text-slate-200">{style.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tavsif - Full width */}
          <div>
            <label className="block font-semibold text-xs text-slate-700 dark:text-slate-300 mb-1.5">
              Tavsif
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Tizim administratori — barcha panellar va amallar."
              className="w-full text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none transition-all shadow-2xs leading-relaxed"
            />
          </div>

          {error && <p className="text-xs font-medium text-rose-600 dark:text-rose-400 pt-1">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750 text-sm font-semibold transition-all shadow-2xs"
              onClick={onClose}
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold transition-all shadow-xs hover:shadow-sm"
            >
              Saqlash
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function RolesManagePanel() {
  const { state, createRole, updateRole, deleteRole, resetToDefaults } = useRbacStore();
  const [dialog, setDialog] = useState<'create' | 'edit' | null>(null);
  const [selected, setSelected] = useState<RbacRoleDef | null>(null);
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');

  const deleting = state.roles.find(r => r.key === deleteKey);

  const filteredRoles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return state.roles;
    return state.roles.filter(
      r => r.label.toLowerCase().includes(q)
        || r.key.toLowerCase().includes(q)
        || (r.description && r.description.toLowerCase().includes(q)),
    );
  }, [state.roles, search]);

  return (
    <div className="docs-panel">
      {/* Yuqori boshqaruv paneli */}
      <div className="docs-panel__toolbar flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex items-center h-10 w-72 lg:w-80 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xs focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
            <Search className="w-4 h-4 absolute left-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rol nomi yoki logini..."
              className="w-full h-full pl-10 pr-9 bg-transparent text-xs font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
            />
            {search && (
              <button
                type="button"
                className="absolute right-3 p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-250 transition-colors"
                onClick={() => setSearch('')}
                aria-label="Tozalash"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-semibold text-xs text-slate-700 dark:text-slate-300">
            Jami: <b>{state.roles.length}</b> ta rol
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            className="btn-secondary !h-10 !py-0 !px-4 !text-xs !font-semibold !rounded-xl flex items-center gap-2 shadow-2xs hover:shadow-xs transition-all"
            onClick={() => setResetConfirmOpen(true)}
            title="Barcha rollarni boshlang'ich tizim holatiga qaytarish"
          >
            <RotateCcw className="w-4 h-4 text-slate-500" strokeWidth={2} />
            Tiklash
          </button>
          <button
            type="button"
            className="btn-primary !h-10 !py-0 !px-4 !text-xs !font-semibold !rounded-xl flex items-center gap-2 shadow-2xs hover:shadow-xs transition-all"
            onClick={() => {
              setSelected(null);
              setDialog('create');
              setMessage('');
            }}
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Yangi rol
          </button>
        </div>
      </div>

      {message && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-700 dark:text-emerald-300 animate-in fade-in duration-200">
          <Check className="w-4 h-4 shrink-0" strokeWidth={2.5} />
          {message}
        </div>
      )}

      {/* Rollar jadvali */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse font-sans">
            <thead>
              <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 text-[13px] font-semibold text-slate-500 dark:text-slate-400">
                <th className="py-3.5 px-4 min-w-[240px]">Rol nomi</th>
                <th className="py-3.5 px-4 min-w-[180px]">Login</th>
                <th className="py-3.5 px-4 min-w-[340px]">Tavsif</th>
                <th className="py-3.5 px-4 text-right min-w-[90px]">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[14px] font-medium font-sans">
              {filteredRoles.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-400 dark:text-slate-500 text-[14px]">
                    Qidiruvga mos rol topilmadi
                  </td>
                </tr>
              ) : (
                filteredRoles.map(role => {
                  const style = ROLE_TONE_STYLES[role.tone] ?? ROLE_TONE_STYLES.blue;
                  const loginText = role.seedUser || role.key.toLowerCase();
                  const RoleIcon = getRoleIcon(role);
                  return (
                    <tr key={role.key} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors group">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border shadow-2xs transition-transform group-hover:scale-105 ${style.bg} ${style.border} ${style.text}`}>
                            <RoleIcon className="w-5 h-5" strokeWidth={2} />
                          </span>
                          <span className="text-[14px] font-bold text-slate-900 dark:text-slate-100 truncate">
                            {role.label}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center px-3 py-1 rounded-xl text-[13px] font-mono font-bold border shadow-2xs ${style.bg} ${style.border} ${style.text}`}>
                          {loginText}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-[14px] text-slate-600 dark:text-slate-300">
                        {role.description || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            className="p-1.5 rounded-lg border border-blue-200/80 bg-blue-50/80 text-blue-600 hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-950/50 dark:text-blue-400 dark:hover:bg-blue-900/60 transition-all hover:scale-110 shadow-2xs cursor-pointer"
                            title="Rolni tahrirlash"
                            onClick={() => {
                              setSelected(role);
                              setDialog('edit');
                              setMessage('');
                            }}
                          >
                            <Pencil className="w-4 h-4 stroke-[2]" />
                          </button>
                          {!role.isSystem && (
                            <button
                              type="button"
                              className="p-1.5 rounded-lg border border-rose-200/80 bg-rose-50/80 text-rose-600 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/50 dark:text-rose-400 dark:hover:bg-rose-900/60 transition-all hover:scale-110 shadow-2xs cursor-pointer"
                              title="Rolni o'chirish"
                              onClick={() => setDeleteKey(role.key)}
                            >
                              <Trash2 className="w-4 h-4 stroke-[2]" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <RoleFormDialog
        open={dialog === 'create' || dialog === 'edit'}
        title={dialog === 'create' ? 'Yangi rol yaratish' : 'Rolni tahrirlash'}
        initial={dialog === 'edit' ? selected ?? undefined : undefined}
        onClose={() => setDialog(null)}
        onSubmit={values => {
          if (dialog === 'create') {
            createRole({
              label: values.label,
              seedUser: values.login,
              description: values.description,
              tone: values.tone,
              iconName: values.iconName,
            });
            setMessage(`"${values.label}" roli yaratildi`);
          } else if (selected) {
            updateRole(
              selected.key,
              {
                label: values.label,
                seedUser: values.login,
                description: values.description,
                tone: values.tone,
                iconName: values.iconName,
              },
              selected.isSystem ? undefined : values.login,
            );
            setMessage(`"${values.label}" roli yangilandi`);
          }
        }}
      />

      <ConfirmDialog
        open={!!deleteKey}
        title="Rolni o'chirish"
        message={deleting ? `"${deleting.label}" roli o'chirilsinmi?` : ''}
        confirmLabel="O'chirish"
        variant="danger"
        onConfirm={() => {
          if (deleteKey) {
            deleteRole(deleteKey);
            setMessage('Rol o\'chirildi');
          }
          setDeleteKey(null);
        }}
        onCancel={() => setDeleteKey(null)}
      />

      <ConfirmDialog
        open={resetConfirmOpen}
        title="Boshlang'ich holatga tiklash"
        message="Barcha RBAC sozlamalari va rollar standart tizim holatiga qaytarilsinmi? Barcha maxsus kiritilgan o'zgarishlar bekor qilinadi."
        confirmLabel="Tiklash"
        variant="danger"
        onConfirm={() => {
          resetToDefaults();
          setMessage('Boshlang\'ich holat tiklandi');
          setResetConfirmOpen(false);
        }}
        onCancel={() => setResetConfirmOpen(false)}
      />
    </div>
  );
}

export function RolesMenusPanel() {
  const { state, allMenus, toggleRoleMenu, resetToDefaults } = useRbacStore();
  const [role, setRole] = useState(state.roles[0]?.key ?? 'Admin');
  const [view, setView] = useState<'role' | 'matrix'>('role');
  const [activeModule, setActiveModule] = useState<string>('all');
  const [message, setMessage] = useState('');

  const currentRoleMenus = useMemo(() => {
    return state.menusByRole[role] ?? [];
  }, [state.menusByRole, role]);

  const filteredMenus = useMemo(() => {
    if (activeModule === 'all') return allMenus;
    return allMenus.filter(m => MENU_MODULE[m.key] === activeModule);
  }, [allMenus, activeModule]);

  return (
    <div className="docs-panel">
      <div className="docs-panel__toolbar flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-slate-400 leading-relaxed max-w-2xl">
          Har bir rol tizimga kirganda qaysi menyularni ko&apos;rishini belgilang.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="admin-segmented">
            <button
              type="button"
              className={`admin-segmented__item ${view === 'role' ? 'admin-segmented__item--active' : ''}`}
              onClick={() => setView('role')}
            >
              Rol bo&apos;yicha
            </button>
            <button
              type="button"
              className={`admin-segmented__item ${view === 'matrix' ? 'admin-segmented__item--active' : ''}`}
              onClick={() => setView('matrix')}
            >
              Matritsa
            </button>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              if (window.confirm('Menyularni boshlang\'ich holatga qaytarilsinmi?')) {
                resetToDefaults();
                setMessage('Boshlang\'ich holat tiklandi');
              }
            }}
          >
            <RotateCcw className="w-4 h-4" strokeWidth={1.75} /> Tiklash
          </button>
        </div>
      </div>

      {message && <p className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p>}

      {view === 'role' ? (
        <div className="space-y-4">
          <div className="admin-filter-bar">
            <RoleSelect value={role} onChange={setRole} roles={state.roles} />
          </div>

          <div className="ui-card p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {allMenus.map(menu => {
                const checked = currentRoleMenus.includes(menu.key);
                const Icon = menu.icon;
                return (
                  <label
                    key={menu.key}
                    className={`admin-menu-toggle ${checked ? 'admin-menu-toggle--checked' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRoleMenu(role, menu.key)}
                    />
                    <div className="admin-menu-toggle__icon">
                      <Icon className="w-4 h-4" strokeWidth={1.75} />
                    </div>
                    <div className="admin-menu-toggle__body">
                      <div className="admin-menu-toggle__title">{menu.label}</div>
                      <div className="admin-menu-toggle__path">{menu.path}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                activeModule === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:bg-gray-200'
              }`}
              onClick={() => setActiveModule('all')}
            >
              Barchasi ({allMenus.length})
            </button>
            {Array.from(new Set(Object.values(MENU_MODULE))).map(modKey => {
              const count = allMenus.filter(m => MENU_MODULE[m.key] === modKey).length;
              return (
                <button
                  key={modKey}
                  type="button"
                  className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                    activeModule === modKey
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:bg-gray-200'
                  }`}
                  onClick={() => setActiveModule(modKey)}
                >
                  {modKey} ({count})
                </button>
              );
            })}
          </div>

          <div className="ui-card overflow-hidden">
            <div className="admin-table-scroll">
              <table className="admin-table rbac-matrix">
                <thead>
                  <tr>
                    <th className="rbac-matrix__sticky">Menyu</th>
                    {state.roles.map(r => (
                      <th key={r.key} title={r.key}>{r.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredMenus.map(menu => {
                    const Icon = menu.icon;
                    return (
                      <tr key={menu.key}>
                        <td className="rbac-matrix__sticky">
                          <div className="admin-user-cell">
                            <span className="admin-hub-icon admin-hub-icon--blue admin-hub-icon--sm !h-7 !w-7">
                              <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
                            </span>
                            <div>
                              <div className="admin-user-cell__login">{menu.label}</div>
                              <div className="text-xs text-gray-400 font-mono">{menu.path}</div>
                            </div>
                          </div>
                        </td>
                        {state.roles.map(r => {
                          const assigned = (state.menusByRole[r.key] ?? []).includes(menu.key);
                          return (
                            <td key={r.key} className="text-center">
                              <MatrixCell
                                on={assigned}
                                interactive
                                onToggle={() => toggleRoleMenu(r.key, menu.key)}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function RolesModulesPanel() {
  const { state, allModules, toggleRoleModule, resetToDefaults } = useRbacStore();
  const [role, setRole] = useState(state.roles[0]?.key ?? 'Admin');
  const [view, setView] = useState<'role' | 'matrix'>('role');
  const [message, setMessage] = useState('');

  const currentRoleModules = useMemo(() => {
    return state.modulesByRole[role] ?? [];
  }, [state.modulesByRole, role]);

  return (
    <div className="docs-panel">
      <div className="docs-panel__toolbar flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-slate-400 leading-relaxed max-w-2xl">
          Modul darajasida ruxsatlar — butun bo&apos;limga kirishni yoqish / o&apos;chirish.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="admin-segmented">
            <button
              type="button"
              className={`admin-segmented__item ${view === 'role' ? 'admin-segmented__item--active' : ''}`}
              onClick={() => setView('role')}
            >
              Rol bo&apos;yicha
            </button>
            <button
              type="button"
              className={`admin-segmented__item ${view === 'matrix' ? 'admin-segmented__item--active' : ''}`}
              onClick={() => setView('matrix')}
            >
              Matritsa
            </button>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              if (window.confirm('Modullarni boshlang\'ich holatga qaytarilsinmi?')) {
                resetToDefaults();
                setMessage('Boshlang\'ich holat tiklandi');
              }
            }}
          >
            <RotateCcw className="w-4 h-4" strokeWidth={1.75} /> Tiklash
          </button>
        </div>
      </div>

      {message && <p className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p>}

      {view === 'role' ? (
        <div className="space-y-4">
          <div className="admin-filter-bar">
            <RoleSelect value={role} onChange={setRole} roles={state.roles} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {allModules.map(mod => {
              const checked = currentRoleModules.includes(mod.key);
              return (
                <label
                  key={mod.key}
                  className={`ui-card p-4 flex items-start gap-3 cursor-pointer transition-colors ${
                    checked ? 'border-blue-500/50 bg-blue-50/20 dark:bg-blue-950/20' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={checked}
                    onChange={() => toggleRoleModule(role, mod.key)}
                  />
                  <div>
                    <div className="font-semibold text-sm text-gray-900 dark:text-slate-100">{mod.label}</div>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{mod.description}</p>
                    <code className="text-xs text-gray-400 font-mono mt-1 block">{mod.key}</code>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="ui-card overflow-hidden">
          <div className="admin-table-scroll">
            <table className="admin-table rbac-matrix">
              <thead>
                <tr>
                  <th className="rbac-matrix__sticky">Modul</th>
                  {state.roles.map(r => (
                    <th key={r.key} title={r.key}>{r.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allModules.map(mod => (
                  <tr key={mod.key}>
                    <td className="rbac-matrix__sticky">
                      <div>
                        <div className="font-semibold text-sm text-gray-900 dark:text-slate-100">{mod.label}</div>
                        <div className="text-xs text-gray-400">{mod.description}</div>
                      </div>
                    </td>
                    {state.roles.map(r => {
                      const assigned = (state.modulesByRole[r.key] ?? []).includes(mod.key);
                      return (
                        <td key={r.key} className="text-center">
                          <MatrixCell
                            on={assigned}
                            interactive
                            onToggle={() => toggleRoleModule(r.key, mod.key)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

interface ActionFormValues {
  label: string;
  module: string;
  description: string;
}

function ActionFormDialog({
  open,
  title,
  modules,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  modules: { key: string; label: string }[];
  initial?: RbacActionDef;
  onClose: () => void;
  onSubmit: (values: ActionFormValues) => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [module, setModule] = useState(initial?.module ?? modules[0]?.key ?? 'marketing');
  const [description, setDescription] = useState(initial?.description ?? '');

  if (!open) return null;

  return (
    <div className="confirm-dialog-root" role="presentation">
      <button type="button" className="confirm-dialog-backdrop" aria-label="Yopish" onClick={onClose} />
      <div className="confirm-dialog !w-[520px] !max-w-[95vw] !p-6" role="dialog" aria-modal="true">
        <button type="button" className="confirm-dialog__close" aria-label="Yopish" onClick={onClose}>
          <X className="w-4 h-4" strokeWidth={1.75} />
        </button>
        <div className="confirm-dialog__header mb-4">
          <div className="confirm-dialog__icon">
            {initial ? <Pencil className="w-5 h-5" strokeWidth={1.75} /> : <Plus className="w-5 h-5" strokeWidth={1.75} />}
          </div>
          <div>
            <h2 className="confirm-dialog__title text-lg font-bold text-gray-900 dark:text-slate-100">{title}</h2>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Rollarga ruxsatni asosiy ekrandagi tugmalar orqali yoqasiz.</p>
          </div>
        </div>

        <form
          className="space-y-4"
          onSubmit={e => {
            e.preventDefault();
            if (!label.trim()) return;
            onSubmit({ label: label.trim(), module, description: description.trim() });
            onClose();
          }}
        >
          <label className="admin-field">
            <span className="text-xs font-semibold text-gray-700 dark:text-slate-300">Amal nomi</span>
            <input required value={label} onChange={e => setLabel(e.target.value)} placeholder="Masalan: Maxsus hisobot eksporti" />
          </label>

          <label className="admin-field">
            <span className="text-xs font-semibold text-gray-700 dark:text-slate-300">Modul</span>
            <select value={module} onChange={e => setModule(e.target.value)}>
              {modules.map(m => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
          </label>

          <label className="admin-field">
            <span className="text-xs font-semibold text-gray-700 dark:text-slate-300">Tavsif / API</span>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="POST /api/... — qisqa izoh" />
          </label>

          <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 dark:border-slate-800">
            <button type="button" className="btn-secondary px-4 py-2 text-sm font-medium" onClick={onClose}>Bekor qilish</button>
            <button type="submit" className="btn-primary px-5 py-2 text-sm font-semibold">Saqlash</button>
          </div>
        </form>
      </div>
    </div>
  );
}
// --- CRUD paneli yordamchilari ---

const METHOD_RE = /^\s*(GET|POST|PUT|PATCH|DELETE)\s+(\S+)/i;

function parseApi(desc: string): { method?: string; path?: string; note: string } {
  const m = desc.match(METHOD_RE);
  if (!m) return { note: desc };
  const note = desc.slice(m[0].length).replace(/^\s*[—–-]\s*/, '').trim();
  return { method: m[1].toUpperCase(), path: m[2], note };
}

const METHOD_TONE: Record<string, string> = {
  GET: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  POST: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  PUT: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  PATCH: 'bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
  DELETE: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
};


// Jadval ustunlari tartibi (arxitektura 7-panel): Create → Read → Update → Delete
const TABLE_OPS: CrudOp[] = ['C', 'R', 'U', 'D'];

const isCustomAction = (key: string) => key.startsWith('custom.');

function ApiNote({ description }: { description: string }) {
  const { method, path, note } = parseApi(description);
  if (!method) return <span className="text-xs text-slate-500 dark:text-slate-400 truncate">{description}</span>;
  return (
    <span className="flex items-center gap-1.5 min-w-0 mt-0.5">
      <span className={`rbac-method !text-[11px] !font-bold !px-2 !py-0.5 ${METHOD_TONE[method] ?? 'bg-slate-100 text-slate-600'}`}>{method}</span>
      <code className="text-xs text-slate-600 dark:text-slate-300 font-mono truncate">{path}</code>
      {note && <span className="text-xs text-slate-500 dark:text-slate-400 truncate hidden xl:inline">· {note}</span>}
    </span>
  );
}

function CrudToggle({ binding, role, onToggle }: { binding?: CrudOpBinding; role: string; onToggle: (k: string) => void }) {
  if (!binding) return <span className="text-slate-300 dark:text-slate-600 font-bold select-none text-sm" title="Bu obyektda mavjud emas">–</span>;
  const on = Array.isArray(binding?.roles) && binding.roles.includes(role);
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center w-8 h-8 rounded-xl border transition-all ${
        on
          ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 shadow-2xs font-bold'
          : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-300 dark:text-slate-600 hover:border-slate-300 hover:text-slate-400'
      }`}
      onClick={() => onToggle(binding.actionKey)}
      title={on ? 'Ruxsat berilgan (O‘chirish uchun bosing)' : 'Ruxsat berilmagan (Yoqish uchun bosing)'}
    >
      {on ? <Check className="w-4.5 h-4.5 stroke-[2.5]" /> : <Minus className="w-4 h-4" />}
    </button>
  );
}

function WfSwitch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={`relative inline-flex h-5.5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
        on ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'
      }`}
      onClick={onToggle}
      title={on ? 'Bosqich yoqilgan' : 'Bosqich o‘chirilgan'}
    >
      <span
        className={`pointer-events-none inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
          on ? 'translate-x-4.5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function RoleMenu({ roles, value, onChange }: { roles: RbacRoleDef[]; value: string; onChange: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const cur = roles.find(r => r.key === value);
  const f = filter.trim().toLowerCase();
  const shown = roles.filter(r => f === '' || r.label.toLowerCase().includes(f) || r.department.toLowerCase().includes(f));

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className={`flex items-center justify-between gap-3 h-10 px-4 bg-white dark:bg-slate-800 rounded-xl border transition-all text-left shadow-2xs min-w-[200px] ${
          open
            ? 'border-blue-500 ring-2 ring-blue-500/20'
            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
        }`}
        onClick={() => setOpen(o => !o)}
      >
        <span className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{cur?.label ?? 'Rolni tanlang'}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${open ? 'rotate-180 text-blue-500' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-72 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="relative mb-2">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Rolni qidirish..."
              className="w-full pl-8 pr-7 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            {filter && (
              <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" onClick={() => setFilter('')}>
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1 pr-0.5 custom-scrollbar">
            {shown.length === 0 ? (
              <p className="text-xs text-slate-400 px-3 py-4 text-center">Mos rol topilmadi</p>
            ) : shown.map(r => {
              const active = r.key === value;
              return (
                <button
                  key={r.key}
                  type="button"
                  className={`w-full flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl text-left transition-all ${
                    active
                      ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-200 border border-blue-200/80 dark:border-blue-800 font-bold'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                  onClick={() => { onChange(r.key); setOpen(false); setFilter(''); }}
                >
                  <span className="block truncate text-sm font-bold text-slate-900 dark:text-slate-100 flex-1">{r.label}</span>
                  {active && <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 ml-2" strokeWidth={2.5} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const MODULE_ICON_STYLE: Record<string, string> = {
  orders: 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 border-blue-200/70 dark:border-blue-800',
  'documents.registry': 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 border-emerald-200/70 dark:border-emerald-800',
  'empty-wagons': 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 border-amber-200/70 dark:border-amber-800',
  flow: 'bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400 border-purple-200/70 dark:border-purple-800',
  road: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-950/60 dark:text-cyan-400 border-cyan-200/70 dark:border-cyan-800',
  plans: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 border-indigo-200/70 dark:border-indigo-800',
  contractors: 'bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400 border-sky-200/70 dark:border-sky-800',
  destinations: 'bg-teal-50 text-teal-600 dark:bg-teal-950/60 dark:text-teal-400 border-teal-200/70 dark:border-teal-800',
  transport: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 border-indigo-200/70 dark:border-indigo-800',
  history: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700',
  reports: 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 border-rose-200/70 dark:border-rose-800',
  telegram: 'bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400 border-sky-200/70 dark:border-sky-800',
};

export function RolesCrudPanel() {
  const {
    state, allModules, toggleActionRole, bulkSetActionRole,
    createAction, updateAction, deleteAction, resetToDefaults,
    dirty, syncing, syncError, hydrated,
  } = useRbacStore();
  const [role, setRole] = useState(state.roles[0]?.key ?? 'Admin');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [showAll, setShowAll] = useState(true);
  const [dialog, setDialog] = useState<'create' | 'edit' | null>(null);
  const [selectedAction, setSelectedAction] = useState<RbacActionDef | null>(null);
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [message, setMessage] = useState('');

  const roleMeta = state.roles.find(r => r.key === role) ?? state.roles[0];
  const deletingAction = state.actions.find(a => a.key === deleteKey);
  const exportToExcel = () => {
    const headers: SheetCell[] = [
      '№',
      'Jarayon / Obyekt',
      'Nima uchun kerak? (Vazifasi)',
      'Yaratish (C)',
      'Ko‘rish (R)',
      'Tahrirlash (U)',
      'O‘chirish (D)',
      'Tasdiqlash zanjiri',
      'Hammasi',
    ];
    const rows: SheetCell[][] = [headers];
    tableObjects.forEach((o, idx) => {
      const purpose = RESOURCE_EXPLANATIONS[o.key] ?? '';
      const c = Array.isArray(o.ops.C?.roles) && o.ops.C.roles.includes(role) ? 'Ha' : 'Yo‘q';
      const r = Array.isArray(o.ops.R?.roles) && o.ops.R.roles.includes(role) ? 'Ha' : 'Yo‘q';
      const u = Array.isArray(o.ops.U?.roles) && o.ops.U.roles.includes(role) ? 'Ha' : 'Yo‘q';
      const d = Array.isArray(o.ops.D?.roles) && o.ops.D.roles.includes(role) ? 'Ha' : 'Yo‘q';
      const validOps = Object.values(o.ops ?? {}).filter(Boolean);
      const total = validOps.length + (o.actions ?? []).length;
      const granted = validOps.filter(b => Array.isArray(b?.roles) && b.roles.includes(role)).length + (o.actions ?? []).filter(a => Array.isArray(a?.roles) && a.roles.includes(role)).length;
      const allOn = total > 0 && granted === total ? 'Ha' : 'Yo‘q';
      const wf = o.actions.map(a => `${a.label}: ${Array.isArray(a.roles) && a.roles.includes(role) ? 'Faol' : 'O‘chiq'}`).join('; ');
      rows.push([
        idx + 1,
        o.label,
        purpose,
        c,
        r,
        u,
        d,
        wf || '-',
        allOn,
      ]);
    });
    exportSheet(`Huquqlar_${role}_${todayStamp()}`, `${role.slice(0, 25)} huquqlari`, rows);
    flash(`"${roleMeta.label}" huquqlari Excel fayliga yuklab olindi`);
  };


  const flash = (text: string) => { setMessage(text); setTimeout(() => setMessage(''), 3000); };

  const objects = useMemo(() => buildObjectModel(state.actions ?? []), [state.actions]);
  const q = search.trim().toLowerCase();
  const filteredObjects = useMemo(() => (objects ?? []).filter(o => {
    if (!o) return false;
    if (q === '') return true;
    const extra = [
      ...Object.values(o.ops ?? {}).filter(Boolean).map(b => b?.description ?? ''),
      ...(o.actions ?? []).map(a => `${a?.label || ''} ${a?.description || ''}`)
    ].join(' ').toLowerCase();
    return (o.label ?? '').toLowerCase().includes(q) || extra.includes(q);
  }), [objects, q]);

  const grantsByRole = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of (state.roles ?? [])) if (r?.key) map[r.key] = 0;
    for (const a of (state.actions ?? [])) {
      if (Array.isArray(a?.roles)) {
        for (const rk of a.roles) {
          if (rk in map) map[rk] += 1;
        }
      }
    }
    return map;
  }, [state.actions, state.roles]);

  const actionByKey = useMemo(() => {
    const m = new Map<string, RbacActionDef>();
    for (const a of (state.actions ?? [])) {
      if (a?.key) m.set(a.key, a);
    }
    return m;
  }, [state.actions]);

  // Jadval: tanlangan rolga tegishli obyektlar
  const tableObjects = useMemo(() => {
    if (showAll || role === 'Admin') return filteredObjects;
    const roleModules = new Set(ROLE_MODULES[role] ?? []);
    return filteredObjects.filter(o => {
      if (!o) return false;
      const keys = [
        ...Object.values(o.ops ?? {}).filter((b): b is CrudOpBinding => Boolean(b && b.actionKey)).map(b => b.actionKey),
        ...(o.actions ?? []).map(a => a?.key).filter(Boolean) as string[],
      ];
      return keys.some(k => {
        const a = actionByKey.get(k);
        return !!a && (roleModules.has(a.module) || (Array.isArray(a.roles) && a.roles.includes(role)));
      });
    });
  }, [filteredObjects, showAll, role, actionByKey]);

  const toggleExpand = (key: string) => setExpanded(prev => {
    const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next;
  });

  const setObjectAll = (o: ObjectPermView, on: boolean) => {
    const keys = new Set<string>();
    Object.values(o.ops ?? {}).forEach(b => {
      if (b?.actionKey) keys.add(b.actionKey);
    });
    (o.actions ?? []).forEach(a => {
      if (a?.key) keys.add(a.key);
    });
    bulkSetActionRole(Array.from(keys), role, on);
  };

  if (!roleMeta) return null;

  return (
    <div className="docs-panel">
      {/* Yuqori boshqaruv paneli */}
      <div className="docs-panel__toolbar flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <RoleMenu roles={state.roles} value={role} onChange={setRole} />
          
          <div className="relative flex items-center h-10 w-72 lg:w-80 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xs focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
            <Search className="w-4 h-4 absolute left-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Obyekt yoki API qidirish..."
              className="w-full h-full pl-10 pr-9 bg-transparent text-xs font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
            />
            {search && (
              <button
                type="button"
                className="absolute right-3 p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-250 transition-colors"
                onClick={() => setSearch('')}
                aria-label="Tozalash"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            className="btn-secondary !h-10 !py-0 !px-4 !text-xs !font-bold !rounded-xl flex items-center gap-2 shadow-2xs hover:shadow-xs transition-all text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 hover:bg-emerald-50 dark:bg-emerald-950/30"
            onClick={exportToExcel}
            title="Ushbu jadvalni Excel (.xlsx) faylida yuklab olish"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Excel yuklash
          </button>
          <button
            type="button"
            className="btn-secondary !h-10 !py-0 !px-4 !text-xs !font-semibold !rounded-xl flex items-center gap-2 shadow-2xs hover:shadow-xs transition-all"
            onClick={() => setResetConfirmOpen(true)}
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" /> Standartga qaytarish
          </button>
          <button
            type="button"
            className="btn-primary !h-10 !py-0 !px-4 !text-xs !font-bold !rounded-xl flex items-center gap-2 shadow-xs hover:shadow-md transition-all"
            onClick={() => { setSelectedAction(null); setDialog('create'); }}
          >
            <Plus className="w-4 h-4" /> Yangi amal
          </button>
        </div>
      </div>

      {/* Holat satri va qo'shimcha filtr */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
            {!hydrated || syncing ? 'Sinxronlanmoqda…' : dirty ? 'Saqlanmoqda…' : message || (
              <>
                <strong className="text-slate-900 dark:text-slate-100 font-bold">“{roleMeta.label}”</strong> roli uchun CRUD huquqlari va tasdiqlash zanjirlari.
              </>
            )}
            {syncError ? ` · Xato: ${syncError}` : ''}
          </p>
        </div>
        {role !== 'Admin' && (
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none bg-white dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
            <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4" />
            Barcha obyektlarni ko‘rsatish
          </label>
        )}
      </div>

      {/* Asosiy Jarayonlar va CRUD Jadvali — Excel uslubidagi to‘liq setkali jadval */}
      <div className="ui-card overflow-hidden border border-slate-300 dark:border-slate-700 shadow-sm rounded-xl">
        <div className="admin-table-scroll">
          <table className="w-full border-collapse border border-slate-300 dark:border-slate-700 text-xs">
            <thead>
              <tr className="bg-slate-200/90 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-b border-slate-300 dark:border-slate-700">
                <th className="py-2.5 px-2 text-center text-xs font-bold uppercase w-12 border-r border-slate-300 dark:border-slate-700">№</th>
                <th style={{ minWidth: 240 }} className="py-2.5 px-3.5 text-left text-xs font-bold uppercase tracking-wider border-r border-slate-300 dark:border-slate-700">Jarayon / Obyekt</th>
                <th style={{ minWidth: 280 }} className="py-2.5 px-3.5 text-left text-xs font-bold uppercase tracking-wider text-blue-800 dark:text-blue-300 border-r border-slate-300 dark:border-slate-700">Nima uchun kerak? (Vazifasi)</th>
                {TABLE_OPS.map(op => (
                  <th key={op} className="text-center py-2.5 px-2 text-xs font-bold uppercase border-r border-slate-300 dark:border-slate-700 w-20">{CRUD_OP_LABEL[op]}</th>
                ))}
                <th className="text-center py-2.5 px-2 text-xs font-bold uppercase border-r border-slate-300 dark:border-slate-700 w-36">Tasdiqlash zanjiri</th>
                <th className="text-center py-2.5 px-2 text-xs font-bold uppercase w-24">Hammasi</th>
              </tr>
            </thead>
            <tbody>
              {tableObjects.length === 0 ? (
                <tr><td colSpan={TABLE_OPS.length + 5} className="text-center py-12 text-sm text-slate-400">Mos jarayon topilmadi</td></tr>
              ) : tableObjects.map((o, idx) => {
                const Icon = o.icon;
                const iconStyle = MODULE_ICON_STYLE[o.key] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700';
                const firstDesc = (o.ops?.R ?? o.ops?.C ?? o.ops?.U ?? o.ops?.D)?.description ?? o.actions?.[0]?.description ?? '';
                const validOps = Object.values(o.ops ?? {}).filter((b): b is CrudOpBinding => Boolean(b));
                const total = validOps.length + (o.actions ?? []).length;
                const granted = validOps.filter(b => Array.isArray(b.roles) && b.roles.includes(role)).length + (o.actions ?? []).filter(a => Array.isArray(a.roles) && a.roles.includes(role)).length;
                const allOn = total > 0 && granted === total;
                const baGranted = (o.actions ?? []).filter(a => Array.isArray(a.roles) && a.roles.includes(role)).length;
                const isOpen = expanded.has(o.key);
                const zebraBg = idx % 2 === 0
                  ? 'bg-white dark:bg-slate-900'
                  : 'bg-slate-100/80 dark:bg-slate-800/50';
                const purpose = RESOURCE_EXPLANATIONS[o.key] ?? '';
                return (
                  <Fragment key={o.key}>
                    <tr className={`${zebraBg} hover:bg-blue-50/70 dark:hover:bg-slate-800/90 transition-colors border-b border-slate-300 dark:border-slate-700 group`}>
                      <td className="py-2 px-2 text-center font-bold text-xs text-slate-500 dark:text-slate-400 border-r border-slate-300 dark:border-slate-700">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-3 border-r border-slate-300 dark:border-slate-700">
                        <div className="flex items-center gap-2.5">
                          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border shadow-2xs ${iconStyle}`}>
                            <Icon className="w-4 h-4" strokeWidth={2} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{o.label}</span>
                            <ApiNote description={firstDesc} />
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-3.5 text-left border-r border-slate-300 dark:border-slate-700">
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-300 leading-snug">
                          {purpose || 'Korxonaning asosiy operativ biznes jarayoni'}
                        </p>
                      </td>
                      {TABLE_OPS.map(op => (
                        <td key={op} className="text-center py-2 px-1 border-r border-slate-300 dark:border-slate-700">
                          <CrudToggle binding={o.ops[op]} role={role} onToggle={k => toggleActionRole(k, role)} />
                        </td>
                      ))}
                      <td className="text-center py-2 px-2 border-r border-slate-300 dark:border-slate-700">
                        {o.actions.length === 0 ? (
                          <span className="text-slate-300 dark:text-slate-600 font-bold select-none text-xs">–</span>
                        ) : (
                          <button
                            type="button"
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-all ${
                              baGranted > 0
                                ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/60 dark:text-blue-300 shadow-2xs'
                                : 'border-slate-300 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-100'
                            }`}
                            onClick={() => toggleExpand(o.key)}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${baGranted > 0 ? 'bg-blue-600' : 'bg-slate-400'}`} />
                            <span>{baGranted}/{o.actions.length} bosqich</span>
                            {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-blue-600" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                          </button>
                        )}
                      </td>
                      <td className="text-center py-2 px-2">
                        <button
                          type="button"
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all shadow-2xs ${
                            allOn
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:border-emerald-700 dark:text-emerald-300'
                              : 'bg-white text-slate-600 border-slate-300 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 hover:bg-slate-50 hover:border-slate-400'
                          }`}
                          onClick={() => setObjectAll(o, !allOn)}
                          title={allOn ? 'Barchasini o‘chirish' : 'Barchasini yoqish'}
                        >
                          {allOn ? 'To‘liq' : 'Yoqish'}
                        </button>
                      </td>
                    </tr>
                    {isOpen && o.actions.length > 0 && (
                      <tr className="bg-blue-50/30 dark:bg-slate-900/60 border-b border-slate-300 dark:border-slate-700">
                        <td colSpan={TABLE_OPS.length + 5} className="px-5 py-4 border-t border-slate-300 dark:border-slate-700 shadow-inner">
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-3.5 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shadow-xs" />
                              <span className="text-sm font-bold">{o.label} — Ketma-ket tasdiqlash va biznes amallari zanjiri</span>
                            </div>
                            <span className="text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800">
                              {baGranted} ta bosqich faol
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                            {o.actions.map((item, idx) => {
                              const on = Array.isArray(item.roles) && item.roles.includes(role);
                              const custom = isCustomAction(item.key);
                              const stepNum = item.order ?? (idx + 1);
                              return (
                                <div
                                  key={item.key}
                                  className={`p-3.5 rounded-2xl border flex items-start gap-3.5 transition-all ${
                                    on
                                      ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/80 shadow-2xs'
                                      : 'bg-white dark:bg-slate-800/80 border-slate-200/80 dark:border-slate-700/80 text-slate-500 hover:border-slate-300'
                                  }`}
                                >
                                  <span className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 shadow-2xs ${
                                    on ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600'
                                  }`}>
                                    {stepNum}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className={`text-xs font-bold truncate ${on ? 'text-blue-950 dark:text-blue-200' : 'text-slate-800 dark:text-slate-200'}`}>
                                        {item.label}
                                      </span>
                                      {custom && <span className="rbac-syschip !text-blue-600 !border-blue-200 !bg-blue-50 dark:!text-blue-300 dark:!border-blue-800 dark:!bg-blue-950/50">Maxsus</span>}
                                    </div>
                                    <div className="mt-1">
                                      <ApiNote description={item.description} />
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                                    <WfSwitch on={on} onToggle={() => toggleActionRole(item.key, role)} />
                                    {custom && (
                                      <>
                                        <button type="button" className="p-1 rounded-md border border-blue-200/80 bg-blue-50/80 text-blue-600 hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-950/50 dark:text-blue-400 dark:hover:bg-blue-900/60 transition-all hover:scale-110 shadow-2xs cursor-pointer" title="Tahrirlash" onClick={() => { setSelectedAction(item); setDialog('edit'); }}><Pencil className="w-3.5 h-3.5 stroke-[2]" /></button>
                                        <button type="button" className="p-1 rounded-md border border-rose-200/80 bg-rose-50/80 text-rose-600 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/50 dark:text-rose-400 dark:hover:bg-rose-900/60 transition-all hover:scale-110 shadow-2xs cursor-pointer" title="O‘chirish" onClick={() => setDeleteKey(item.key)}><Trash2 className="w-3.5 h-3.5 stroke-[2]" /></button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="admin-table-footer bg-slate-50/60 dark:bg-slate-900 px-4 py-3.5 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-xs font-medium text-slate-500">
          <span><strong>{tableObjects.length}</strong> ta jarayon · <strong>{grantsByRole[role] ?? 0}</strong> ta faol ruxsat</span>
          <span>Har bir jarayon bo‘yicha CRUD va tasdiqlash zanjiri bosqichlari to‘liq boshqariladi</span>
        </div>
      </div>

      <ActionFormDialog
        key={dialog === 'create' ? 'create-action' : selectedAction?.key ?? 'edit-action'}
        open={dialog === 'create' || dialog === 'edit'}
        title={dialog === 'create' ? 'Yangi amal qo‘shish' : 'Amalni tahrirlash'}
        modules={allModules}
        initial={dialog === 'edit' ? selectedAction ?? undefined : undefined}
        onClose={() => setDialog(null)}
        onSubmit={values => {
          if (dialog === 'create') { createAction({ label: values.label, module: values.module, description: values.description, flags: ['A'], roles: [role] }); flash(`"${values.label}" amali qo‘shildi`); }
          else if (selectedAction) { updateAction(selectedAction.key, { label: values.label, module: values.module, description: values.description }); flash(`"${values.label}" yangilandi`); }
        }}
      />

      <ConfirmDialog
        open={resetConfirmOpen}
        title="Standart holatga qaytarish"
        message="Barcha rollar uchun CRUD huquqlari va tasdiqlash zanjirlari standart biznes qoidalariga qaytarilsinmi? Kiritilgan o‘zgarishlar asl holatga keltiriladi."
        confirmLabel="Standartga qaytarish"
        cancelLabel="Bekor qilish"
        variant="default"
        onConfirm={() => {
          resetToDefaults();
          setResetConfirmOpen(false);
          flash('Barcha ruxsatlar standart holatga tiklandi');
        }}
        onCancel={() => setResetConfirmOpen(false)}
      />

      <ConfirmDialog
        open={!!deleteKey}
        title="Amalni o‘chirish"
        message={deletingAction ? `"${deletingAction.label}" amali o‘chirilsinmi?` : ''}
        confirmLabel="O‘chirish"
        variant="danger"
        onConfirm={() => { if (deleteKey) deleteAction(deleteKey); setDeleteKey(null); }}
        onCancel={() => setDeleteKey(null)}
      />
    </div>
  );
}
