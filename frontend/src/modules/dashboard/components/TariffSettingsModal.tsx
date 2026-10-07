import React, { useState, useEffect } from 'react';
import {
  X,
  Settings,
  DollarSign,
  Clock,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Info,
} from 'lucide-react';
import {
  getTariffSettings,
  saveTariffSettings,
  DEFAULT_TARIFF_SETTINGS,
  type LogisticsTariffSettings,
} from '../utils/demurrageUtils';

interface TariffSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export function TariffSettingsModal({ isOpen, onClose, onSaved }: TariffSettingsModalProps) {
  const [form, setForm] = useState<LogisticsTariffSettings>(DEFAULT_TARIFF_SETTINGS);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm(getTariffSettings());
      setSavedSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveTariffSettings(form);
    setSavedSuccess(true);
    if (onSaved) onSaved();
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 900);
  };

  const handleReset = () => {
    setForm(DEFAULT_TARIFF_SETTINGS);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/40">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Temir yo'l stavkalari va jarima tariflari
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                O'TY shartnomasi va korxona normativ stavkalarini sozlash
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-5">
          {savedSuccess && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 flex items-center gap-2.5 text-emerald-700 dark:text-emerald-300 text-sm font-medium animate-in zoom-in-95 duration-150">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>Stavkalar muvaffaqiyatli saqlandi! Hisob-kitoblar yangilandi.</span>
            </div>
          )}

          {/* Info banner */}
          <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 text-xs text-blue-800 dark:text-blue-300 flex items-start gap-2.5 leading-relaxed">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <strong>Rasmiy asos:</strong> «Sho'rtan GKM» MCHJ Bosh direktori Sh.Ch. Aslanov tasdiqlagan va Qo'riqlash xizmati 2-batalyoni bilan kelishilgan «Jarayon reglamenti (2-tahrir)»ga asosan vagonning zavodda bo'lish jami me'yori: <b>533 daqiqa (8 soat 53 daqiqa)</b>.
              <span className="block mt-1 text-slate-600 dark:text-slate-400">
                Faqat <strong>Tashqi</strong> (O'TY va ijaradagi) vagonlar belgilangan me'yordan oshganda jarima hisoblanadi.
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* OTY Hourly penalty */}
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-rose-500" />
                O'TY soatbay jarima stavkasi (so'm / vagon-soat)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={form.hourlyPenaltyUzs}
                  onChange={e => setForm({ ...form, hourlyPenaltyUzs: Number(e.target.value) || 0 })}
                  className="w-full px-3 py-2 pl-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  required
                />
                <span className="absolute left-3 top-2.5 text-xs text-slate-400">UZS</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Standart etalon: 65,000 so'm/soat (shartnomangiz bo'yicha o'zgartirishingiz mumkin)
              </p>
            </div>

            {/* Normative hours Tashqi */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-500" />
                Tashqi vagonlar me'yori (soat)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max="120"
                  step="0.1"
                  value={form.normativeHoursTashqi}
                  onChange={e => setForm({ ...form, normativeHoursTashqi: Number(e.target.value) || 8.9 })}
                  className="w-full px-3 py-2 pr-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  required
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-400">soat</span>
              </div>
              <p className="text-[11px] text-slate-500">Rasmiy me'yor: 8.9 soat (533 daqiqa — 2-tahrir)</p>
            </div>

            {/* Warning hours Tashqi */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                Sariq xavf zonasi (soat)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="0.1"
                  value={form.warningHoursTashqi}
                  onChange={e => setForm({ ...form, warningHoursTashqi: Number(e.target.value) || 6.0 })}
                  className="w-full px-3 py-2 pr-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  required
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-400">soat</span>
              </div>
              <p className="text-[11px] text-slate-500">Rasmiy xavf chegarasi: 6.0 soat (sariq signal)</p>
            </div>

            {/* Normative hours Majmua */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-500" />
                Majmua vagonlari me'yori (soat)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max="168"
                  value={form.normativeHoursMajmua}
                  onChange={e => setForm({ ...form, normativeHoursMajmua: Number(e.target.value) || 36 })}
                  className="w-full px-3 py-2 pr-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  required
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-400">soat</span>
              </div>
              <p className="text-[11px] text-slate-500">Ichki me'yor (jarimasiz, aylanma unumi)</p>
            </div>

            {/* Underload loss per ton */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-cyan-500" />
                Nedogruz 1t narxi (so'm / t)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="5000"
                  value={form.underloadLossPerTonUzs}
                  onChange={e => setForm({ ...form, underloadLossPerTonUzs: Number(e.target.value) || 0 })}
                  className="w-full px-3 py-2 pr-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  required
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-400">so'm/t</span>
              </div>
              <p className="text-[11px] text-slate-500">Bo'sh quvvat tashish logistika yo'qotishi</p>
            </div>
          </div>

          {/* Footer buttons */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Standartga qaytarish
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
              >
                Bekor qilish
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 rounded-lg shadow-sm shadow-blue-500/20 transition"
              >
                Saqlash va hisoblash
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
