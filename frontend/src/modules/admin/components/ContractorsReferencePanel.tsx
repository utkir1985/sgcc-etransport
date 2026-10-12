import { useEffect, useMemo, useState } from 'react';
import { Building2, Check, MapPin, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { api } from '../../../shared/services/api';
import type { Contractor } from '../../../shared/types';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { useRbacPermission } from '../../../shared/hooks/useRbacPermission';
import {
  addDeletedContractorId,
  getContractorStationsMap,
  getDeletedContractorIds,
  getStoredContractors,
  saveContractorStationsMap,
  saveStoredContractors,
  unmarkDeletedContractorId,
} from '../../../shared/constants/railwayContractors';
import { DEFAULT_STATIONS } from '../../../shared/constants/stations';
import { notifyOrdersChanged } from '../../../shared/utils/realtimeSync';

const POPULAR_STATIONS = [
  'Axtachi',
  'Oltiariq',
  'Uychi',
  'To\'raqo\'rg\'on',
  'Maroqand',
  'Jomboy',
  'Oqjar',
  'Xayrabod',
  ...DEFAULT_STATIONS,
];

export function ContractorsReferencePanel() {
  const { canContractorsCreate, canContractorsUpdate, canContractorsDelete } = useRbacPermission();
  const [contractors, setContractors] = useState<Contractor[]>(() => getStoredContractors());
  const [stationsMap, setStationsMap] = useState<Record<string, string[]>>(() => getContractorStationsMap());
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<'create' | 'edit' | null>(null);
  const [selected, setSelected] = useState<Contractor | null>(null);
  const [name, setName] = useState('');
  const [inn, setInn] = useState('');
  const [assignedStations, setAssignedStations] = useState<string[]>([]);
  const [newStationInput, setNewStationInput] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');

  const load = () => {
    setLoading(true);
    const deleted = getDeletedContractorIds();
    api.getContractors('Railway')
      .then(res => {
        const apiList = (res.data ?? []).filter(
          c => !deleted.includes(c.id) && !deleted.includes(c.name),
        );
        const stored = getStoredContractors();
        const merged = [...stored];
        for (const a of apiList) {
          if (!merged.some(m => m.id === a.id || m.name.toLowerCase() === a.name.toLowerCase())) {
            merged.push(a);
          }
        }
        setContractors(merged);
        saveStoredContractors(merged);
      })
      .catch(() => setContractors(getStoredContractors()))
      .finally(() => setLoading(false));

    setStationsMap(getContractorStationsMap());
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setSelected(null);
    setName('');
    setInn('');
    setAssignedStations([]);
    setNewStationInput('');
    setError('');
    setDialog('create');
  };

  const openEdit = (c: Contractor) => {
    setSelected(c);
    setName(c.name);
    setInn(c.inn ?? '');
    const currentStations = stationsMap[c.name] ?? [];
    setAssignedStations([...currentStations]);
    setNewStationInput('');
    setError('');
    setDialog('edit');
  };

  const addStationToForm = (stName: string) => {
    const trimmed = stName.trim();
    if (!trimmed) return;
    if (assignedStations.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
      setNewStationInput('');
      return;
    }
    setAssignedStations(prev => [...prev, trimmed]);
    setNewStationInput('');
  };

  const removeStationFromForm = (stName: string) => {
    setAssignedStations(prev => prev.filter(s => s !== stName));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Korxona nomi majburiy');
      return;
    }
    setSaving(true);
    setError('');

    try {
      const finalName = name.trim();
      let nextContractors: Contractor[];

      if (dialog === 'create') {
        const newContractor: Contractor = {
          id: `cont-${Date.now()}`,
          name: finalName,
          inn: inn.trim() || undefined,
          logisticsType: 'Railway',
          isSystem: false,
          createdAt: new Date().toISOString(),
        };
        unmarkDeletedContractorId(newContractor.id, finalName);
        api.createContractor(finalName, 'Railway').catch(() => {});
        nextContractors = [newContractor, ...contractors];
        setMessage(`"${newContractor.name}" korxonasi qo'shildi`);
      } else if (selected) {
        unmarkDeletedContractorId(selected.id, finalName);
        nextContractors = contractors.map(c =>
          c.id === selected.id
            ? { ...c, name: finalName, inn: inn.trim() || undefined }
            : c,
        );
        setMessage(`"${finalName}" korxonasi yangilandi`);
      } else {
        nextContractors = contractors;
      }

      // Update stations map
      const nextMap = { ...stationsMap, [finalName]: assignedStations };
      if (selected && selected.name !== finalName && stationsMap[selected.name]) {
        delete nextMap[selected.name];
      }

      setContractors(nextContractors);
      setStationsMap(nextMap);
      saveStoredContractors(nextContractors);
      saveContractorStationsMap(nextMap);
      notifyOrdersChanged();
      setDialog(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik yuz berdi');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const target = contractors.find(c => c.id === deleteId);
    if (target) {
      addDeletedContractorId(target.id, target.name);
      api.deleteContractor(target.id).catch(() => {});
    }

    const nextContractors = contractors.filter(c => c.id !== deleteId);
    let nextMap = { ...stationsMap };
    if (target && nextMap[target.name]) {
      delete nextMap[target.name];
    }

    setContractors(nextContractors);
    setStationsMap(nextMap);
    saveStoredContractors(nextContractors);
    saveContractorStationsMap(nextMap);
    notifyOrdersChanged();
    setDeleteId(null);
    if (target) {
      setMessage(`"${target.name}" korxonasi o'chirildi`);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contractors;
    return contractors.filter(c =>
      c.name.toLowerCase().includes(q) || (c.inn && c.inn.includes(q)),
    );
  }, [contractors, search]);

  const deletingItem = contractors.find(c => c.id === deleteId);

  return (
    <div className="space-y-4">
      {/* Yuqori qidiruv va amallar paneli */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex items-center h-10 w-72 sm:w-80 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xs focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
            <Search className="w-4 h-4 absolute left-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Korxona nomi yoki STIR..."
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
            Jami: <b>{contractors.length}</b> ta korxona
          </span>
        </div>

        {canContractorsCreate && (
          <button
            type="button"
            className="btn-primary !h-10 !py-0 !px-4 !text-xs !font-semibold !rounded-xl flex items-center gap-2 shadow-2xs hover:shadow-xs transition-all"
            onClick={openCreate}
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Yangi kontragent
          </button>
        )}
      </div>

      {message && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-700 dark:text-emerald-300 animate-in fade-in duration-200">
          <Check className="w-4 h-4 shrink-0" strokeWidth={2.5} />
          {message}
        </div>
      )}

      {/* Kontragentlar jadvali */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse font-sans">
            <thead>
              <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 text-[13px] font-semibold text-slate-500 dark:text-slate-400">
                <th className="py-3.5 px-4 min-w-[280px]">Korxona (Kontragent) nomi</th>
                <th className="py-3.5 px-4 min-w-[140px]">STIR (INN)</th>
                <th className="py-3.5 px-4 min-w-[280px]">Biriktirilgan stansiyalar</th>
                <th className="py-3.5 px-4 text-right min-w-[100px]">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[14px] font-medium font-sans">
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-400 dark:text-slate-500">
                    Yuklanmoqda...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-400 dark:text-slate-500">
                    Qidiruvga mos korxona topilmadi
                  </td>
                </tr>
              ) : (
                filtered.map(c => {
                  const stations = stationsMap[c.name] ?? [];
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors group">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border shadow-2xs bg-violet-50 dark:bg-violet-950/60 border-violet-200/80 dark:border-violet-800 text-violet-600 dark:text-violet-400 transition-transform group-hover:scale-105">
                            <Building2 className="w-5 h-5" strokeWidth={2} />
                          </span>
                          <span className="text-[14px] font-bold text-slate-900 dark:text-slate-100">
                            {c.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 font-mono text-[13px]">
                        {c.inn || '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        {stations.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {stations.map(st => (
                              <span
                                key={st}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800 shadow-2xs"
                              >
                                <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                {st}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 text-xs italic">Stansiya biriktirilmagan</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {canContractorsUpdate && (
                            <button
                              type="button"
                              className="flex items-center justify-center w-8 h-8 rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50/80 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 hover:scale-105 transition-all shadow-2xs"
                              title="Tahrirlash"
                              onClick={() => openEdit(c)}
                            >
                              <Pencil className="w-4 h-4 stroke-[2]" />
                            </button>
                          )}
                          {canContractorsDelete && (
                            <button
                              type="button"
                              className="flex items-center justify-center w-9 h-9 rounded-xl border border-rose-200 dark:border-rose-900 bg-white dark:bg-slate-800 text-slate-400 hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50/50 dark:hover:bg-rose-950/30 transition-all shadow-2xs"
                              title="O'chirish"
                              onClick={() => setDeleteId(c.id)}
                            >
                              <Trash2 className="w-4 h-4 stroke-[2]" />
                            </button>
                          )}
                          {!canContractorsUpdate && !canContractorsDelete && (
                            <span className="text-slate-400 text-xs">—</span>
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

      {/* Tahrirlash / Yaratish oynasi */}
      {dialog && (
        <div className="confirm-dialog-root" role="presentation">
          <button type="button" className="confirm-dialog-backdrop" aria-label="Yopish" onClick={() => setDialog(null)} />
          <div className="confirm-dialog admin-user-dialog !max-w-xl !p-6 !rounded-3xl" role="dialog" aria-modal="true">
            <button
              type="button"
              className="absolute right-5 top-5 p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Yopish"
              onClick={() => setDialog(null)}
            >
              <X className="w-4 h-4" strokeWidth={2} />
            </button>

            <div className="flex items-center gap-3.5 mb-6">
              <div className="w-11 h-11 rounded-2xl bg-violet-50 dark:bg-violet-950/60 border border-violet-200/80 dark:border-violet-800 text-violet-600 dark:text-violet-400 flex items-center justify-center shadow-2xs">
                <Building2 className="w-5 h-5" strokeWidth={2} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {dialog === 'create' ? 'Yangi kontragent qo\'shish' : 'Kontragentni tahrirlash'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Korxona rekvizitlari va yuk tushirish stansiyalari
                </p>
              </div>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-xs text-slate-700 dark:text-slate-300 mb-1.5">
                    Korxona nomi <span className="text-rose-500">*</span>
                  </label>
                  <input
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="«Hududgaz Toshkent» gaz ta'minoti filiali"
                    className="w-full h-11 px-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-2xs"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-xs text-slate-700 dark:text-slate-300 mb-1.5">
                    STIR (INN) raqami
                  </label>
                  <input
                    value={inn}
                    onChange={e => setInn(e.target.value)}
                    placeholder="301234567"
                    className="w-full h-11 px-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-2xs"
                  />
                </div>
              </div>

              {/* Biriktirilgan stansiyalar boshqaruvi */}
              <div className="pt-2">
                <label className="block font-semibold text-xs text-slate-700 dark:text-slate-300 mb-1.5">
                  Biriktirilgan stansiyalar
                </label>

                {/* Mavjud stansiyalar teglar ko'rinishida */}
                <div className="min-h-12 p-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl flex flex-wrap items-center gap-1.5 mb-2.5">
                  {assignedStations.length === 0 ? (
                    <span className="text-xs text-slate-400 italic px-1">
                      Hozircha stansiya biriktirilmagan. Quyidan stansiya qo‘shing.
                    </span>
                  ) : (
                    assignedStations.map(st => (
                      <span
                        key={st}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-white dark:bg-slate-750 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60 shadow-2xs animate-in fade-in zoom-in-95 duration-100"
                      >
                        <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span>{st}</span>
                        <button
                          type="button"
                          onClick={() => removeStationFromForm(st)}
                          className="p-0.5 rounded-md hover:bg-rose-100 dark:hover:bg-rose-950/60 text-slate-400 hover:text-rose-600 transition-colors"
                          title="O'chirish"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>

                {/* Yangi stansiya qo'shish inputi */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      list="popular-station-suggestions"
                      value={newStationInput}
                      onChange={e => setNewStationInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addStationToForm(newStationInput);
                        }
                      }}
                      placeholder="Stansiya nomini kiriting yoki tanlang..."
                      className="w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                    <datalist id="popular-station-suggestions">
                      {POPULAR_STATIONS.map(st => (
                        <option key={st} value={st} />
                      ))}
                    </datalist>
                  </div>
                  <button
                    type="button"
                    onClick={() => addStationToForm(newStationInput)}
                    className="h-10 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Qo‘shish
                  </button>
                </div>
              </div>

              {error && <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750 text-sm font-semibold transition-all shadow-2xs"
                  onClick={() => setDialog(null)}
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white text-sm font-semibold transition-all shadow-xs hover:shadow-sm"
                >
                  {saving ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Kontragentni o'chirish"
        message={deletingItem ? `"${deletingItem.name}" korxonasi va uning biriktirilgan stansiyalari o'chirilsinmi?` : ''}
        confirmLabel="O'chirish"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
