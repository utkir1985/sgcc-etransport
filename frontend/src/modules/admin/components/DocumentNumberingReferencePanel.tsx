import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRightLeft,
  CheckCircle2,
  FileSpreadsheet,
  Hash,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { api } from '../../../shared/services/api';
import type { DocumentNumberingRule } from '../../../shared/types';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { notifyOrdersChanged } from '../../../shared/utils/realtimeSync';

/** Standart hujjatlar prefiks va qoidalari */
const DEFAULT_NUMBERING_RULES: DocumentNumberingRule[] = [
  {
    documentType: 'InboundBatch',
    title: 'Kiritish partiyasi (Inbound)',
    prefix: 'IB',
    periodFormat: 'MMYY',
    sequenceDigits: 3,
    resetPeriod: 'Monthly',
    examplePreview: 'IB-0926-001',
    description: 'Kengsoy temir yo‘l stansiyasidan korxonaga kirib kelgan vagonlar partiyasi kodi',
    isEditable: true,
  },
  {
    documentType: 'EntryPermit',
    title: 'Kiritish xizmat xati (Permit)',
    prefix: 'ENP',
    periodFormat: 'MMYY',
    sequenceDigits: 3,
    resetPeriod: 'Monthly',
    examplePreview: 'ENP-0926-001',
    description: 'Vagonlarni majmuaga kiritish uchun rasmiylashtirilgan xizmat xati / ruxsatnoma',
    isEditable: true,
  },
  {
    documentType: 'DefectAct',
    title: 'Dalolatnoma (Defect Act)',
    prefix: 'DFA',
    periodFormat: 'MMYY',
    sequenceDigits: 3,
    resetPeriod: 'Monthly',
    examplePreview: 'DFA-0926-001',
    description: 'Kirishda aniqlangan nuqson, ta‘mirtalablik yoki mahsulot yo‘qligi bo‘yicha rasmiy dalolatnoma',
    isEditable: true,
  },
  {
    documentType: 'SealDefectAct',
    title: 'Plomba dalolatnomasi (Seal Defect Act)',
    prefix: 'PL',
    periodFormat: 'MMYY',
    sequenceDigits: 3,
    resetPeriod: 'Monthly',
    examplePreview: 'PL-0926-001',
    description: 'Plomba shikastlanganligi, uzilganligi yoki almashtirilganligi to‘g‘risidagi elektron dalolatnoma',
    isEditable: true,
  },
  {
    documentType: 'Waybill',
    title: 'Yuk xati (Waybill / Reyestr)',
    prefix: 'WB',
    periodFormat: 'MMYY',
    sequenceDigits: 3,
    resetPeriod: 'Monthly',
    examplePreview: 'WB-0926-001',
    description: 'Yuklangan mahsulotlarni jo‘natish yuk xati va reyestri',
    isEditable: true,
  },
  {
    documentType: 'Order_PE',
    title: 'Polietilen buyurtmasi',
    prefix: 'PE',
    periodFormat: 'MMYY',
    sequenceDigits: 3,
    resetPeriod: 'Monthly',
    examplePreview: 'PE-0926-001',
    description: 'Polietilen mahsulotini temir yo‘l orqali yuklash oylik buyurtmasi',
    isEditable: true,
  },
  {
    documentType: 'Order_LPG',
    title: 'Suyultirilgan gaz buyurtmasi',
    prefix: 'LPG',
    periodFormat: 'MMYY',
    sequenceDigits: 3,
    resetPeriod: 'Monthly',
    examplePreview: 'LPG-0926-001',
    description: 'Suyultirilgan uglevodorod gazi (SUG) sisterna vagonlari buyurtmasi',
    isEditable: true,
  },
  {
    documentType: 'Order_SULF',
    title: 'Oltingugurt buyurtmasi',
    prefix: 'SULF',
    periodFormat: 'MMYY',
    sequenceDigits: 3,
    resetPeriod: 'Monthly',
    examplePreview: 'SULF-0926-001',
    description: 'Donador/tuyilgan oltingugurt mahsuloti buyurtmasi',
    isEditable: true,
  },
  {
    documentType: 'Order_COND',
    title: 'Gaz kondensati buyurtmasi',
    prefix: 'COND',
    periodFormat: 'MMYY',
    sequenceDigits: 3,
    resetPeriod: 'Monthly',
    examplePreview: 'COND-0926-001',
    description: 'Barqarorlashtirilgan gaz kondensati yuklash buyurtmasi',
    isEditable: true,
  },
];

/** Jonli raqam formatini hisoblash */
function computePreview(prefix: string, periodFormat: string, digits: number, seq = 1): string {
  const p = (prefix || '').trim().toUpperCase();
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);
  const yyyy = String(now.getFullYear());

  let period = `${mm}${yy}`;
  if (periodFormat === 'YYMM') period = `${yy}${mm}`;
  else if (periodFormat === 'YYYY') period = yyyy;

  const paddedSeq = String(seq).padStart(Math.max(2, Math.min(6, digits || 3)), '0');
  return `${p || 'DOC'}-${period}-${paddedSeq}`;
}

export function DocumentNumberingReferencePanel() {
  const [rules, setRules] = useState<DocumentNumberingRule[]>([]);
  const [initialRules, setInitialRules] = useState<DocumentNumberingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [confirmMigrateOpen, setConfirmMigrateOpen] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{
    ordersUpdated: number;
    arrivalsUpdated: number;
    registriesUpdated: number;
    defectActsUpdated: number;
    changeLogs: string[];
  } | null>(null);

  const loadRules = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getDocumentNumberingRules();
      const loaded = res.data && res.data.length > 0 ? res.data : DEFAULT_NUMBERING_RULES;
      setRules(loaded);
      setInitialRules(JSON.parse(JSON.stringify(loaded)));
    } catch {
      setRules(DEFAULT_NUMBERING_RULES);
      setInitialRules(JSON.parse(JSON.stringify(DEFAULT_NUMBERING_RULES)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  const isDirty = useMemo(() => {
    return JSON.stringify(rules) !== JSON.stringify(initialRules);
  }, [rules, initialRules]);

  const handleFieldChange = (
    index: number,
    field: keyof DocumentNumberingRule,
    value: string | number | boolean
  ) => {
    setRules((prev) => {
      const next = [...prev];
      const item = { ...next[index], [field]: value };

      if (field === 'prefix' && typeof value === 'string') {
        item.prefix = value.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
      }

      item.examplePreview = computePreview(
        item.prefix,
        item.periodFormat,
        item.sequenceDigits
      );

      next[index] = item;
      return next;
    });
    setSuccessMessage(null);
  };

  const handleSave = async () => {
    setError(null);
    setSuccessMessage(null);

    for (const rule of rules) {
      if (!rule.prefix || rule.prefix.trim().length === 0) {
        setError(`"${rule.title}" uchun prefiks bo‘sh bo‘lishi mumkin emas`);
        return;
      }
      if (rule.prefix.length > 10) {
        setError(`"${rule.title}" prefiksi 10 ta belgidan oshmasligi kerak`);
        return;
      }
    }

    setSaving(true);
    try {
      const res = await api.updateDocumentNumberingRules(rules);
      const updated = res.data && res.data.length > 0 ? res.data : rules;
      setRules(updated);
      setInitialRules(JSON.parse(JSON.stringify(updated)));
      setSuccessMessage(res.message || 'Hujjat raqamlash standartlari muvaffaqiyatli saqlandi');
      notifyOrdersChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Saqlashda xatolik yuz berdi');
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefaults = () => {
    setRules(JSON.parse(JSON.stringify(DEFAULT_NUMBERING_RULES)));
    setConfirmResetOpen(false);
    setSuccessMessage('Standart qoidalar tiklandi. Saqlash uchun "O‘zgarishlarni saqlash" tugmasini bosing.');
  };

  const handleMigrate = async () => {
    setMigrating(true);
    setError(null);
    setSuccessMessage(null);
    setConfirmMigrateOpen(false);
    try {
      const res = await api.migrateLegacyDocumentNumbers();
      setMigrationResult(res.data);
      setSuccessMessage(res.message || 'Eski hujjatlar yangi standartga muvaffaqiyatli o‘tkazildi');
      notifyOrdersChanged();
      await loadRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Migratsiya qilishda xatolik yuz berdi');
    } finally {
      setMigrating(false);
    }
  };

  const filteredRules = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return rules;
    return rules.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.prefix.toLowerCase().includes(q) ||
        r.documentType.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q))
    );
  }, [rules, search]);

  return (
    <div className="space-y-6">
      {/* Yuqori Panel: Sarlavha va Amallar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200 dark:border-gray-800">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Hash className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            Hujjatlar va Raqamlash Standartlari
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Partiyalar, ruxsatnomalar, yuk xatlari va buyurtmalar uchun yagona korporativ raqamlash formati.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={loadRules}
            disabled={loading || saving}
            className="btn-secondary flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg"
            title="Qayta yuklash"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Yangilash</span>
          </button>

          <button
            type="button"
            onClick={() => setConfirmMigrateOpen(true)}
            disabled={loading || saving || migrating}
            className="btn-secondary flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
            title="Eski formatdagi barcha hujjatlarni (LPG-00001, EWA-..., YX-EWA-...) yangi standartga o‘tkazish"
          >
            <ArrowRightLeft className={`w-4 h-4 ${migrating ? 'animate-spin' : ''}`} />
            <span>{migrating ? 'Migratsiya qilinmoqda...' : 'Eski hujjatlarni standartga moslash'}</span>
          </button>

          <button
            type="button"
            onClick={() => setConfirmResetOpen(true)}
            disabled={loading || saving || migrating}
            className="btn-secondary flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg text-amber-600 dark:text-amber-400 hover:text-amber-700"
            title="Birlamchi holatga qaytarish"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="hidden sm:inline">Standartga qaytarish</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={loading || saving || !isDirty || migrating}
            className={`btn-primary flex items-center gap-2 px-4 py-2 text-sm rounded-lg font-medium shadow-sm transition-all ${
              isDirty ? 'ring-2 ring-primary-500/50 shadow-primary-500/20' : 'opacity-70'
            }`}
          >
            <Save className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
            <span>{saving ? 'Saqlanmoqda...' : 'O‘zgarishlarni saqlash'}</span>
          </button>
        </div>
      </div>

      {/* Tizim strukturasi haqida tushuntirish banneri */}
      <div className="bg-gradient-to-r from-rose-50/80 via-indigo-50/50 to-blue-50/80 dark:from-rose-950/20 dark:via-indigo-950/20 dark:to-blue-950/20 border border-rose-200/60 dark:border-rose-900/40 rounded-xl p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 shrink-0 mt-0.5">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="space-y-2 text-sm">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              Yagona raqamlash formati: <code className="font-mono text-rose-700 dark:text-rose-300 font-bold bg-white/70 dark:bg-gray-900/60 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-800">[PREFIKS]-[DAVR]-[KETMA-KET RAQAM]</code>
            </h3>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed text-xs sm:text-sm">
              Har bir hujjat turi uchun maxsus prefiks belgilanadi. Masalan, Polietilen buyurtmasi uchun{' '}
              <strong className="text-gray-900 dark:text-gray-200">PE-0926-001</strong> (Sentyabr 2026-yil, 1-buyurtma),
              kiritish partiyasi uchun <strong className="text-gray-900 dark:text-gray-200">IB-0926-001</strong>.
              Tiklash davri <span className="underline decoration-dotted font-medium">Oylik (Monthly)</span> bo‘lsa, har oy boshida ketma-ketlik 1 dan boshlanadi.
            </p>
          </div>
        </div>
      </div>

      {/* Xabarlar (Xato / Muvaffaqiyat) */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 flex items-center gap-3 text-red-700 dark:text-red-300 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div className="flex-1 font-medium">{error}</div>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 flex items-center gap-3 text-emerald-700 dark:text-emerald-300 text-sm">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <div className="flex-1 font-medium">{successMessage}</div>
        </div>
      )}

      {/* Qidiruv filtri */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hujjat nomi, kodi yoki prefiksi bo‘yicha izlash..."
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div className="text-xs text-gray-500 dark:text-gray-400">
          Jami: <strong className="text-gray-900 dark:text-gray-200">{filteredRules.length}</strong> ta qoida
          {isDirty && (
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
              Saqlanmagan o‘zgarishlar bor
            </span>
          )}
        </div>
      </div>

      {/* Raqamlash Jadvali */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
        <table className="reestr-table thub-table w-full text-left text-sm">
          <thead className="bg-gray-50/80 dark:bg-gray-800/60 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-800">
            <tr>
              <th className="px-4 py-3.5 w-12 text-center">#</th>
              <th className="px-4 py-3.5 min-w-[220px]">Hujjat turi va tavsifi</th>
              <th className="px-4 py-3.5 w-32">Prefiks</th>
              <th className="px-4 py-3.5 w-36">Davr formati</th>
              <th className="px-4 py-3.5 w-32">Xonalar soni</th>
              <th className="px-4 py-3.5 w-36">Tiklash davri</th>
              <th className="px-4 py-3.5 min-w-[160px]">Jonli namuna</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-primary-500" />
                  Qoidalar yuklanmoqda...
                </td>
              </tr>
            ) : filteredRules.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                  Qidiruv bo‘yicha hech qanday hujjat qoidasi topilmadi.
                </td>
              </tr>
            ) : (
              filteredRules.map((rule) => {
                const actualIndex = rules.findIndex((r) => r.documentType === rule.documentType);
                const isItemDirty =
                  initialRules[actualIndex] &&
                  JSON.stringify(rule) !== JSON.stringify(initialRules[actualIndex]);

                return (
                  <tr
                    key={rule.documentType}
                    className={`transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-800/40 ${
                      isItemDirty ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''
                    }`}
                  >
                    {/* Qator raqami */}
                    <td className="px-4 py-3 text-center text-xs font-medium text-gray-400">
                      {actualIndex + 1}
                    </td>

                    {/* Hujjat nomi va tavsifi */}
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        {rule.title}
                        {isItemDirty && (
                          <span
                            className="w-2 h-2 rounded-full bg-amber-500 inline-block"
                            title="Tahrirlangan"
                          />
                        )}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                        {rule.description || rule.documentType}
                      </div>
                      <div className="mt-1">
                        <code className="text-[11px] font-mono text-gray-400 dark:text-gray-500">
                          {rule.documentType}
                        </code>
                      </div>
                    </td>

                    {/* Prefiks */}
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={rule.prefix}
                        maxLength={10}
                        disabled={!rule.isEditable}
                        onChange={(e) =>
                          handleFieldChange(actualIndex, 'prefix', e.target.value)
                        }
                        className="w-full uppercase font-mono font-bold text-sm px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-50"
                        placeholder="PREFIKS"
                      />
                    </td>

                    {/* Davr formati */}
                    <td className="px-4 py-3">
                      <select
                        value={rule.periodFormat}
                        disabled={!rule.isEditable}
                        onChange={(e) =>
                          handleFieldChange(actualIndex, 'periodFormat', e.target.value)
                        }
                        className="w-full text-xs font-mono px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-50"
                      >
                        <option value="MMYY">MMYY (oy+yil, 0926)</option>
                        <option value="YYMM">YYMM (yil+oy, 2609)</option>
                        <option value="YYYY">YYYY (to‘liq yil, 2026)</option>
                      </select>
                    </td>

                    {/* Xonalar soni */}
                    <td className="px-4 py-3">
                      <select
                        value={rule.sequenceDigits}
                        disabled={!rule.isEditable}
                        onChange={(e) =>
                          handleFieldChange(actualIndex, 'sequenceDigits', Number(e.target.value))
                        }
                        className="w-full text-xs font-mono px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-50"
                      >
                        <option value={2}>2 xona (01)</option>
                        <option value={3}>3 xona (001)</option>
                        <option value={4}>4 xona (0001)</option>
                        <option value={5}>5 xona (00001)</option>
                      </select>
                    </td>

                    {/* Tiklash davri */}
                    <td className="px-4 py-3">
                      <select
                        value={rule.resetPeriod}
                        disabled={!rule.isEditable}
                        onChange={(e) =>
                          handleFieldChange(actualIndex, 'resetPeriod', e.target.value)
                        }
                        className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-50"
                      >
                        <option value="Monthly">Oylik (Har oy)</option>
                        <option value="Yearly">Yillik (Har yil)</option>
                      </select>
                    </td>

                    {/* Jonli Namuna */}
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 font-mono px-3 py-1.5 rounded-md bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 font-bold text-xs tracking-wider border border-rose-200/80 dark:border-rose-900/60 shadow-xs">
                        <FileSpreadsheet className="w-3.5 h-3.5 shrink-0 text-rose-500" />
                        {computePreview(rule.prefix, rule.periodFormat, rule.sequenceDigits)}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Standartga qaytarish tasdiqlash modali */}
      <ConfirmDialog
        open={confirmResetOpen}
        title="Standart qoidalarni tiklash"
        message="Barcha hujjat prefikslari va raqamlash formatlari tizimning birlamchi standart qiymatlariga (IB, OB, ENP, DFA, WB, PE, LPG, SULF, COND) qaytarilsinmi? Saqlash uchun 'O‘zgarishlarni saqlash' tugmasini bosishingiz kerak bo‘ladi."
        confirmLabel="Tiklash"
        cancelLabel="Bekor qilish"
        variant="default"
        onConfirm={handleResetToDefaults}
        onCancel={() => setConfirmResetOpen(false)}
      />

      {/* Eski hujjatlarni yangi standartga migratsiya qilish tasdiqlash modali */}
      <ConfirmDialog
        open={confirmMigrateOpen}
        title="Eski hujjat raqamlarini yangi standartga moslash"
        message="Bazada ilgari yaratilgan barcha eski buyurtmalar (masalan, LPG-00001), bo‘sh vagon partiyalari (EWA-2026-001), ruxsatnomalar (PR-...) va yuk xati/reyestrlari (YX-EWA-...) yangi korporativ standart formatiga (LPG-0926-001, IB-0926-001, ENP-0926-001, WB-0926-001) xavfsiz o‘tkaziladi. O‘zaro bog‘langan barcha jadvallar sinxron yangilanadi. Davom etishni xohlaysizmi?"
        confirmLabel="Standartga o‘tkazish"
        cancelLabel="Bekor qilish"
        variant="default"
        onConfirm={handleMigrate}
        onCancel={() => setConfirmMigrateOpen(false)}
      />

      {/* Migratsiya hisoboti modali */}
      {migrationResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-emerald-50/50 dark:bg-emerald-950/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">
                    Hujjatlar muvaffaqiyatli standartga moslandi
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Bazada mavjud barcha eski formatdagi hujjatlar yangilandi
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMigrationResult(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Stats & Change Log */}
            <div className="p-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-gray-50 dark:bg-gray-800/60 p-3 rounded-xl border border-gray-200 dark:border-gray-700/60 text-center">
                  <span className="text-xs text-gray-500 dark:text-gray-400 block">Buyurtmalar</span>
                  <span className="text-lg font-bold text-gray-900 dark:text-white font-mono">
                    {migrationResult.ordersUpdated}
                  </span>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/60 p-3 rounded-xl border border-gray-200 dark:border-gray-700/60 text-center">
                  <span className="text-xs text-gray-500 dark:text-gray-400 block">Partiyalar</span>
                  <span className="text-lg font-bold text-gray-900 dark:text-white font-mono">
                    {migrationResult.arrivalsUpdated}
                  </span>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/60 p-3 rounded-xl border border-gray-200 dark:border-gray-700/60 text-center">
                  <span className="text-xs text-gray-500 dark:text-gray-400 block">Yuk xatlari / Reyestr</span>
                  <span className="text-lg font-bold text-gray-900 dark:text-white font-mono">
                    {migrationResult.registriesUpdated}
                  </span>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/60 p-3 rounded-xl border border-gray-200 dark:border-gray-700/60 text-center">
                  <span className="text-xs text-gray-500 dark:text-gray-400 block">Nuqson dalolatnomalari</span>
                  <span className="text-lg font-bold text-gray-900 dark:text-white font-mono">
                    {migrationResult.defectActsUpdated}
                  </span>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wider">
                  Bajarilgan o‘zgarishlar jurnali ({migrationResult.changeLogs.length})
                </h4>
                <div className="bg-gray-950 text-gray-200 rounded-xl p-3 font-mono text-xs max-h-60 overflow-y-auto space-y-1.5 border border-gray-800">
                  {migrationResult.changeLogs.length === 0 ? (
                    <span className="text-gray-500">Hech qanday eski formatdagi hujjat topilmadi (barchasi yangi standartda).</span>
                  ) : (
                    migrationResult.changeLogs.map((log, idx) => (
                      <div key={idx} className="flex items-start gap-2 leading-relaxed">
                        <span className="text-emerald-400 select-none">✓</span>
                        <span>{log}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex justify-end bg-gray-50 dark:bg-gray-900/50">
              <button
                type="button"
                onClick={() => setMigrationResult(null)}
                className="px-5 py-2 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-colors"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
