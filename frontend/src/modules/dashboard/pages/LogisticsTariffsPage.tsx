import React, { useState, useEffect } from 'react';
import {
  Settings,
  DollarSign,
  Clock,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Info,
  FileText,
  Calculator,
  Scale,
  TrendingDown,
  Building2,
  Save,
  Check,
  ExternalLink,
  Shield,
  Layers,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { ReportsHistoryTabs } from '../components/ReportsHistoryTabs';
import {
  getTariffSettings,
  saveTariffSettings,
  DEFAULT_TARIFF_SETTINGS,
  type LogisticsTariffSettings,
  OFFICIAL_FINISHED_GOODS_STAGES,
  OFFICIAL_TOTAL_NORM_MINUTES,
  OFFICIAL_TOTAL_NORM_HOURS,
} from '../utils/demurrageUtils';

function fmtMoney(amount: number): string {
  return new Intl.NumberFormat('uz-UZ').format(amount);
}

export function LogisticsTariffsPage() {
  const [tariffs, setTariffs] = useState<LogisticsTariffSettings>(DEFAULT_TARIFF_SETTINGS);
  const [contractNumber, setContractNumber] = useState('O‘TY-2026/04-Sh');
  const [contractDate, setContractDate] = useState('2026-01-10');
  const [contractPartner, setContractPartner] = useState('«O‘zbekiston Temir Yo‘llari» AJ (Qarshi MTU)');
  const [processRegulation, setProcessRegulation] = useState(
    "«Sho'rtan GKM» MCHJ Bosh direktori Sh.Ch. Aslanov tasdiqlagan Jarayon reglamenti (2-tahrir, 533 daqiqa)"
  );
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [isSavedAlert, setIsSavedAlert] = useState(false);

  // Live calculator state
  const [calcHours, setCalcHours] = useState<number>(10);
  const [calcOwnership, setCalcOwnership] = useState<'tashqi' | 'majmua'>('tashqi');

  useEffect(() => {
    const loaded = getTariffSettings();
    setTariffs(loaded);
    const savedMeta = localStorage.getItem('etransport_tariffs_meta');
    if (savedMeta) {
      try {
        const meta = JSON.parse(savedMeta);
        if (meta.contractNumber) setContractNumber(meta.contractNumber);
        if (meta.contractDate) setContractDate(meta.contractDate);
        if (meta.contractPartner) setContractPartner(meta.contractPartner);
        if (meta.processRegulation) setProcessRegulation(meta.processRegulation);
        if (meta.lastSaved) setLastSaved(meta.lastSaved);
      } catch (e) {
        // ignore
      }
    }
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveTariffSettings(tariffs);

    const now = new Intl.DateTimeFormat('uz-UZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Tashkent',
    }).format(new Date());

    setLastSaved(now);
    localStorage.setItem(
      'etransport_tariffs_meta',
      JSON.stringify({
        contractNumber,
        contractDate,
        contractPartner,
        processRegulation,
        lastSaved: now,
      })
    );

    setIsSavedAlert(true);
    setTimeout(() => setIsSavedAlert(false), 3500);
  };

  const handleReset = () => {
    if (
      window.confirm(
        "Barcha stavka va me'yorlarni Sho'rtan GKM Bosh direktori tasdiqlagan rasmiy me'yorlarga (533 daqiqa / 8.9 soat, 65 000 so'm/soat) qaytarmoqchimisiz?"
      )
    ) {
      setTariffs(DEFAULT_TARIFF_SETTINGS);
      saveTariffSettings(DEFAULT_TARIFF_SETTINGS);
      setIsSavedAlert(true);
      setTimeout(() => setIsSavedAlert(false), 2500);
    }
  };

  // Preset apply handler
  const applyPreset = (preset: 'official' | 'railway24' | 'export12') => {
    if (preset === 'official') {
      setTariffs((prev: LogisticsTariffSettings) => ({
        ...prev,
        normativeHoursTashqi: OFFICIAL_TOTAL_NORM_HOURS, // 8.9h (533 daqiqa)
        warningHoursTashqi: 6.0,
        normativeHoursMajmua: 12,
        hourlyPenaltyUzs: 65000,
      }));
    } else if (preset === 'railway24') {
      setTariffs((prev: LogisticsTariffSettings) => ({
        ...prev,
        normativeHoursTashqi: 24.0,
        warningHoursTashqi: 18.0,
        normativeHoursMajmua: 24,
      }));
    } else if (preset === 'export12') {
      setTariffs((prev: LogisticsTariffSettings) => ({
        ...prev,
        normativeHoursTashqi: 12.0,
        warningHoursTashqi: 8.0,
        normativeHoursMajmua: 12,
      }));
    }
  };

  // Check which preset is active
  const isOfficialPreset =
    Math.abs(tariffs.normativeHoursTashqi - OFFICIAL_TOTAL_NORM_HOURS) < 0.05 &&
    tariffs.warningHoursTashqi === 6.0;
  const isRailway24Preset = tariffs.normativeHoursTashqi === 24.0 && tariffs.warningHoursTashqi === 18.0;
  const isExport12Preset = tariffs.normativeHoursTashqi === 12.0 && tariffs.warningHoursTashqi === 8.0;

  // Live calculation results
  const normHours = calcOwnership === 'tashqi' ? tariffs.normativeHoursTashqi : tariffs.normativeHoursMajmua;
  const overdueHours = Math.max(0, calcHours - normHours);
  const calculatedPenalty = calcOwnership === 'tashqi' ? Math.round(overdueHours * tariffs.hourlyPenaltyUzs) : 0;

  // Status for calculator
  const calcStatus =
    calcOwnership === 'majmua'
      ? calcHours <= tariffs.normativeHoursMajmua
        ? 'green'
        : 'yellow'
      : calcHours <= tariffs.warningHoursTashqi
      ? 'green'
      : calcHours <= tariffs.normativeHoursTashqi
      ? 'yellow'
      : 'red';

  return (
    <div className="thub min-h-screen pb-16 w-full max-w-full overflow-x-hidden">
      <ReportsHistoryTabs active="tariffs" />

      {/* Hero Header */}
      <header className="thub__hero">
        <div className="thub__hero-text">
          <p className="thub__eyebrow flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
            <Settings className="w-3.5 h-3.5" />
            Temir yo‘l shartnomasi va ichki texnologik me'yorlar
          </p>
          <h1 className="thub__title">Qo‘lda kiritiladigan stavkalar va tariflar</h1>
          <p className="thub__lead">
            Sho'rtan GKM Bosh direktori tasdiqlagan <b>Jarayon reglamenti (533 daqiqa / 8.9 soat)</b> va «O‘zbekiston Temir Yo‘llari» AJ
            bilan tuzilgan shartnomaviy vagon-soat jarima stavkalari, normativ vaqtlar va nedogruz narxlarini boshqarish.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 shadow-xs transition cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Standartga qaytarish</span>
          </button>
        </div>
      </header>

      {/* Saved Toast Notification */}
      {isSavedAlert && (
        <div className="mb-6 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500 text-white shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm">Tariflar va me'yorlar muvaffaqiyatli saqlandi!</div>
              <div className="text-xs text-emerald-600 dark:text-emerald-400">
                Barcha demurrage nazorati va jarima hisobotlari kiritilgan parametrlar bo‘yicha yangilandi.
              </div>
            </div>
          </div>
          {lastSaved && (
            <span className="text-xs font-mono text-emerald-800 dark:text-emerald-200 bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-1 rounded-lg self-start sm:self-auto">
              Saqlangan: {lastSaved}
            </span>
          )}
        </div>
      )}

      {/* Quick Preset Selector Bar */}
      <div className="mb-6 p-4 sm:p-5 rounded-2xl bg-sky-50/60 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/40 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Tezkor me'yor andozalari (1-bosish bilan o'rnatish)
            </span>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Tanlangan andoza bo'yicha normativ va ogohlantirish soatlari avtomatik to'ldiriladi
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* Preset 1: Official 533 min */}
          <button
            type="button"
            onClick={() => applyPreset('official')}
            className={`p-3 rounded-xl border text-left transition flex items-start gap-2.5 cursor-pointer ${
              isOfficialPreset
                ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20 ring-2 ring-blue-400/40'
                : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-blue-300'
            }`}
          >
            <div className={`p-1.5 rounded-lg shrink-0 ${isOfficialPreset ? 'bg-white/20 text-white' : 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400'}`}>
              <Shield className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xs">Sho'rtan GKM reglamenti</span>
                {isOfficialPreset && (
                  <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-white/25 text-white">Faol</span>
                )}
              </div>
              <div className={`text-[11px] font-mono mt-0.5 ${isOfficialPreset ? 'text-blue-100' : 'text-blue-600 dark:text-blue-400'}`}>
                <b>533 daqiqa</b> (8.9 soat) / 6s ogohlantirish
              </div>
              <div className={`text-[10px] mt-0.5 truncate ${isOfficialPreset ? 'text-white/80' : 'text-slate-400'}`}>
                Rasmiy 2-tahrir (Bosh direktor tasdiqlagan)
              </div>
            </div>
          </button>

          {/* Preset 2: Classic O'TY 24h */}
          <button
            type="button"
            onClick={() => applyPreset('railway24')}
            className={`p-3 rounded-xl border text-left transition flex items-start gap-2.5 cursor-pointer ${
              isRailway24Preset
                ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20 ring-2 ring-blue-400/40'
                : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-blue-300'
            }`}
          >
            <div className={`p-1.5 rounded-lg shrink-0 ${isRailway24Preset ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
              <Clock className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xs">O‘TY umumiy shartnomasi</span>
                {isRailway24Preset && (
                  <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-white/25 text-white">Faol</span>
                )}
              </div>
              <div className={`text-[11px] font-mono mt-0.5 ${isRailway24Preset ? 'text-blue-100' : 'text-slate-600 dark:text-slate-300'}`}>
                <b>24 soat</b> (1440 daqiqa) / 18s ogohlantirish
              </div>
              <div className={`text-[10px] mt-0.5 truncate ${isRailway24Preset ? 'text-white/80' : 'text-slate-400'}`}>
                Klassik shartnomaviy 24 soatlik muddat
              </div>
            </div>
          </button>

          {/* Preset 3: Export 12h */}
          <button
            type="button"
            onClick={() => applyPreset('export12')}
            className={`p-3 rounded-xl border text-left transition flex items-start gap-2.5 cursor-pointer ${
              isExport12Preset
                ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20 ring-2 ring-blue-400/40'
                : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-blue-300'
            }`}
          >
            <div className={`p-1.5 rounded-lg shrink-0 ${isExport12Preset ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
              <Layers className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xs">Eksport / Tezkor grafik</span>
                {isExport12Preset && (
                  <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-white/25 text-white">Faol</span>
                )}
              </div>
              <div className={`text-[11px] font-mono mt-0.5 ${isExport12Preset ? 'text-blue-100' : 'text-slate-600 dark:text-slate-300'}`}>
                <b>12 soat</b> (720 daqiqa) / 8s ogohlantirish
              </div>
              <div className={`text-[10px] mt-0.5 truncate ${isExport12Preset ? 'text-white/80' : 'text-slate-400'}`}>
                Tezkor partiyalar va bojxona rejimida
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Main Tariff Form & Responsive Layout */}
      <form onSubmit={handleSave} className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start w-full">
        {/* Left Column: Tariffs & Norms (7 cols on XL, 100% on tablet/mobile) */}
        <div className="xl:col-span-7 2xl:col-span-8 space-y-6 w-full min-w-0">
          {/* Card 1: Asosiy O'TY Vagon-soat Jarima stavkasi va Texnologik me'yorlar */}
          <div className="p-4 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40 shrink-0">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                    1. Vagon-soat to‘xtab turish (Prostoy) stavkasi va Texnologik me’yorlar
                  </h2>
                  <p className="text-xs text-slate-500">
                    O‘TY vagoni me’yoriy vaqtdan oshganda har 1 soat kechikish narxi va vaqt chegaralari
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 self-start sm:self-auto">
                Majburiy stavka
              </span>
            </div>

            <div className="space-y-4">
              {/* Asosiy Stavka */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <span>Asosiy vagon-soat jarima stavkasi (so‘m/soat):</span>
                  </label>
                  <div className="flex items-center gap-1">
                    {[48000, 55000, 65000, 75000].map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setTariffs({ ...tariffs, hourlyPenaltyUzs: val })}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono transition cursor-pointer ${
                          tariffs.hourlyPenaltyUzs === val
                            ? 'bg-rose-600 text-white font-bold'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                        }`}
                      >
                        {val / 1000}k
                      </button>
                    ))}
                  </div>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={tariffs.hourlyPenaltyUzs}
                    onChange={(e: any) => setTariffs({ ...tariffs, hourlyPenaltyUzs: Number(e.target.value) || 0 })}
                    className="w-full px-4 py-3 pl-12 pr-32 text-lg sm:text-xl font-black text-rose-600 dark:text-rose-400 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                    required
                  />
                  <span className="absolute left-4 top-3.5 font-bold text-xs text-slate-400">UZS</span>
                  <span className="absolute right-4 top-3.5 text-xs font-medium text-slate-400 hidden sm:inline">so‘m / vagon-soat</span>
                </div>
                <p className="text-xs text-slate-500">
                  Amaldagi korxona shartnomasida ko‘rsatilgan stavkani kiriting (amalda: <b>65 000 so‘m/soat</b>).
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 pt-2">
                {/* Bepul normativ Tashqi */}
                <div className="space-y-1.5 p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-blue-500" />
                      <span>Tashqi vagonlar me’yori:</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setTariffs({ ...tariffs, normativeHoursTashqi: OFFICIAL_TOTAL_NORM_HOURS })}
                      className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      533 daqiqaga moslash
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      max="120"
                      step="0.1"
                      value={tariffs.normativeHoursTashqi}
                      onChange={(e: any) => setTariffs({ ...tariffs, normativeHoursTashqi: Number(e.target.value) || OFFICIAL_TOTAL_NORM_HOURS })}
                      className="w-full px-4 py-2.5 pr-14 text-sm sm:text-base font-bold text-slate-900 dark:text-white rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      required
                    />
                    <span className="absolute right-4 top-3 text-xs font-semibold text-slate-400">soat</span>
                  </div>
                  <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/40 text-[11px] text-blue-800 dark:text-blue-300 flex items-center justify-between">
                    <span>
                      Daqiqalarda: <b>{Math.round(tariffs.normativeHoursTashqi * 60)} daqiqa</b>
                    </span>
                    <span className="text-[10px] font-mono text-blue-600 dark:text-blue-400">
                      ({Math.floor(tariffs.normativeHoursTashqi)}s {Math.round((tariffs.normativeHoursTashqi % 1) * 60)}d)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Sho'rtan GKM Bosh direktori tasdiqlagan rasmiy me'yor: <b>533 daqiqa (8 soat 53 daqiqa ≈ 8.9 soat)</b>.
                  </p>
                </div>

                {/* Sariq zona ogohlantirish */}
                <div className="space-y-1.5 p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                      <span>Sariq xavf chegarasi:</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setTariffs({ ...tariffs, warningHoursTashqi: 6.0 })}
                      className="text-[10px] font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                    >
                      6.0 soatga moslash
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      step="0.1"
                      value={tariffs.warningHoursTashqi}
                      onChange={(e: any) => setTariffs({ ...tariffs, warningHoursTashqi: Number(e.target.value) || 6.0 })}
                      className="w-full px-4 py-2.5 pr-14 text-sm sm:text-base font-bold text-slate-900 dark:text-white rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                      required
                    />
                    <span className="absolute right-4 top-3 text-xs font-semibold text-slate-400">soat</span>
                  </div>
                  <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/40 text-[11px] text-amber-800 dark:text-amber-300 flex items-center justify-between">
                    <span>
                      Daqiqalarda: <b>{Math.round(tariffs.warningHoursTashqi * 60)} daqiqa</b>
                    </span>
                    <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400">
                      ({Math.floor(tariffs.warningHoursTashqi)}s {Math.round((tariffs.warningHoursTashqi % 1) * 60)}d)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Dispetcherga sariq signal berish vaqti (amalda: <b>6.0 soat / 360 daqiqa</b>).
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Majmua o'z vagonlari & Nedogruz tarifi */}
          <div className="p-4 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
            <div className="flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/40 shrink-0">
                <Scale className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  2. Majmua vagonlari va Nedogruz (kam yuklash) tarifi
                </h2>
                <p className="text-xs text-slate-500">
                  Xususiy vagonlar aylanma me’yori va bo‘sh sig‘im yo‘qotish narxi
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
              {/* Majmua me'yori */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Majmua vagonlari me’yori (soat):</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max="168"
                    step="0.5"
                    value={tariffs.normativeHoursMajmua}
                    onChange={(e: any) => setTariffs({ ...tariffs, normativeHoursMajmua: Number(e.target.value) || 12 })}
                    className="w-full px-4 py-2.5 pr-14 text-sm sm:text-base font-bold text-slate-900 dark:text-white rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    required
                  />
                  <span className="absolute right-4 top-3 text-xs font-semibold text-slate-400">soat</span>
                </div>
                <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/40 text-[11px] text-emerald-800 dark:text-emerald-300">
                  Ichki reja ko‘rsatkichi: <b>O‘TY ga jarima to‘lanmaydi (0 so‘m)</b>.
                </div>
              </div>

              {/* Nedogruz 1t narxi */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <TrendingDown className="w-3.5 h-3.5 text-cyan-500" />
                  <span>Nedogruz 1 tonna narxi (so‘m/t):</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="5000"
                    value={tariffs.underloadLossPerTonUzs}
                    onChange={(e: any) => setTariffs({ ...tariffs, underloadLossPerTonUzs: Number(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 pr-20 text-sm sm:text-base font-bold text-slate-900 dark:text-white rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-cyan-500 focus:outline-hidden"
                    required
                  />
                  <span className="absolute right-4 top-3 text-xs font-semibold text-slate-400">so‘m / t</span>
                </div>
                <div className="p-2 rounded-lg bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-100 dark:border-cyan-900/40 text-[11px] text-cyan-800 dark:text-cyan-300">
                  Kam yuklangandagi logistika yo‘qotish qiymati (odatda <b>50 000 so‘m/t</b>).
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Yuridik asos va Reglament ma'lumotlari */}
          <div className="p-4 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  3. Asoslovchi me’yoriy hujjatlar va shartnoma rekvizitlari
                </h2>
                <p className="text-xs text-slate-500">
                  Stavkalar va texnologik vaqtlar aynan qaysi rasmiy hujjatlar asosida amal qilishining yuridik asosi
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Rasmiy reglament hujjati */}
              <div className="sm:col-span-2 space-y-1 p-3 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-blue-600" />
                    <span>Texnologik reglament asosi (Ichki 533 daqiqa me'yori):</span>
                  </label>
                  <a
                    href="/normative-files/SHGKM_jarayoni_tahrir_2.pdf"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    <span>Asl PDF hujjatni ko'rish</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <input
                  type="text"
                  value={processRegulation}
                  onChange={(e: any) => setProcessRegulation(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  O‘TY shartnoma raqami:
                </label>
                <input
                  type="text"
                  value={contractNumber}
                  onChange={(e: any) => setContractNumber(e.target.value)}
                  placeholder="masalan: № 482/2026-TY"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Shartnoma tuzilgan sana:
                </label>
                <input
                  type="date"
                  value={contractDate}
                  onChange={(e: any) => setContractDate(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Temir yo‘l bo‘linmasi / Hamkor:
                </label>
                <input
                  type="text"
                  value={contractPartner}
                  onChange={(e: any) => setContractPartner(e.target.value)}
                  placeholder="«O‘zbekiston Temir Yo‘llari» AJ (Qarshi MTU)"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
            <a
              href="#reglament-jadvali"
              className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              <span>13-bosqichli to'liq me'yorlar jadvalini ko'rish (533 daqiqa)</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
            <button
              type="submit"
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-bold text-sm shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Yangi stavka va me'yorlarni saqlash</span>
            </button>
          </div>
        </div>

        {/* Right Column: Live Simulator Card (5 cols on XL, 100% on tablet/mobile) */}
        <div className="xl:col-span-5 2xl:col-span-4 space-y-6 w-full min-w-0">
          {/* Live Simulator Card */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden space-y-0">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-850 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-xs shrink-0">
                <Calculator className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
                  JONLI JARIMA KALKULYATORI
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Kiritilgan stavka va vaqt qanday hisoblanishini darhol tekshiring
                </p>
              </div>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-5 space-y-5">
              {/* Selector: Ownership */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Vagon egaligi:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCalcOwnership('tashqi')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border cursor-pointer ${
                      calcOwnership === 'tashqi'
                        ? 'bg-rose-500 text-white border-rose-500 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>Tashqi (O‘TY)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalcOwnership('majmua')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border cursor-pointer ${
                      calcOwnership === 'majmua'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span>Majmua vagoni</span>
                  </button>
                </div>
              </div>

              {/* Slider: Hours in plant */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-700 dark:text-slate-300 font-semibold">
                    Zavod hududida turish vaqti:
                  </span>
                  <div className="text-right">
                    <span className="font-black text-rose-600 dark:text-rose-400 text-base tabular-nums">
                      {calcHours} soat
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      ({Math.round(calcHours * 60)} daqiqa)
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min="1"
                  max="48"
                  step="0.5"
                  value={calcHours}
                  onChange={(e: any) => setCalcHours(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>1 soat</span>
                  <span>12 soat</span>
                  <span>24 soat</span>
                  <span>48 soat</span>
                </div>
              </div>

              {/* Status pill */}
              <div className="flex items-center justify-between text-xs p-2.5 rounded-xl border font-bold">
                <span className="text-slate-600 dark:text-slate-400 font-medium">Holat baholanishi:</span>
                {calcStatus === 'green' && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300">
                    🟢 Yashil (Xavfsiz zona)
                  </span>
                )}
                {calcStatus === 'yellow' && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-300">
                    🟡 Sariq (Ogohlantirish zonasi)
                  </span>
                )}
                {calcStatus === 'red' && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-300">
                    🔴 Qizil (Muddati o'tgan / Jarima)
                  </span>
                )}
              </div>

              {/* Calculation Summary Table */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Belgilangan me’yoriy vaqt:</span>
                  <span className="font-semibold text-slate-900 dark:text-white font-mono">
                    {normHours} soat ({Math.round(normHours * 60)} daq)
                  </span>
                </div>

                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Haqiqiy turish vaqti:</span>
                  <span className="font-semibold text-slate-900 dark:text-white font-mono">
                    {calcHours} soat ({Math.round(calcHours * 60)} daq)
                  </span>
                </div>

                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Ortiqcha prostoy vaqti:</span>
                  <span className={`font-mono font-bold ${overdueHours > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {overdueHours.toFixed(1)} soat ({Math.round(overdueHours * 60)} daq)
                  </span>
                </div>

                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>1 soatlik stavka:</span>
                  <span className="font-mono text-slate-900 dark:text-white">
                    {calcOwnership === 'tashqi' ? `${fmtMoney(tariffs.hourlyPenaltyUzs)} so‘m` : '0 so‘m (Ichki)'}
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
                  <span className="font-bold text-slate-900 dark:text-white text-xs">
                    Hisoblangan jami jarima:
                  </span>
                  <div className="text-right">
                    <div className="text-lg font-black text-rose-600 dark:text-rose-400 tabular-nums">
                      {fmtMoney(calculatedPenalty)} <span className="text-xs font-normal">so‘m</span>
                    </div>
                    {calcOwnership === 'majmua' && (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                        Majmuaga jarima yo‘q
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Helper badge */}
              <div className="p-3 rounded-xl bg-blue-50/80 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 text-[11px] text-blue-800 dark:text-blue-300 leading-relaxed flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  <b>Dispetcherga ko‘rsatma:</b> Agar vagon <b>{tariffs.warningHoursTashqi} soatdan ({Math.round(tariffs.warningHoursTashqi * 60)} daqiqa)</b> oshsa,
                  tizim uni <b>Sariq</b> xavf zonasiga kiritadi va <b>{tariffs.normativeHoursTashqi} soatdan ({Math.round(tariffs.normativeHoursTashqi * 60)} daqiqa / 533 daqiqa)</b> oshganda
                  jarima hisoblashni boshlaydi.
                </span>
              </div>
            </div>
          </div>

          {/* Practical Guidelines Card */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
              <Check className="w-4 h-4 text-emerald-500" />
              Muhim amaliy qoidalar
            </h4>
            <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-2 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                <span><b>533 daqiqa me'yori:</b> Sho'rtan GKM Bosh direktori Sh.Ch. Aslanov tasdiqlagan 13 bosqichli reglament bo'yicha vagonning zavodda bo'lish to'liq ruxsat etilgan sikli.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                <span><b>Tashqi vagonlar:</b> Har bir soatiga {fmtMoney(tariffs.hourlyPenaltyUzs)} so'm jarima hisoblanmasligi uchun FIFO navbatida 1-o‘ringa qo‘yiladi.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                <span><b>Majmua vagonlari:</b> Kechiksa ham O‘TY jarimasi hisoblanmaydi (0 so‘m), faqat ichki texnologik unumdorlik nazorat qilinadi.</span>
              </li>
            </ul>
          </div>
        </div>
      </form>

      {/* ======================================================== */}
      {/* OFFICIAL 13-STAGE NORMATIVE BREAKDOWN (533 MINUTES) */}
      {/* ======================================================== */}
      <div id="reglament-jadvali" className="mt-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-xs uppercase tracking-wider">
              <FileText className="w-4 h-4" />
              Tasdiqlangan texnologik me'yorlar (2-tahrir)
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-1">
              Tayyor mahsulotlarni qabul qilish, tekshirish, o‘lchash, yuklash va jo‘natish sxemasi
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              «Sho'rtan GKM» MCHJ Bosh direktori Sh.Ch. Aslanov tasdiqlagan va Qo'riqlash xizmati 2-batalyoni bilan kelishilgan reglament
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/normative-files/SHGKM_jarayoni_tahrir_2.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 text-xs font-bold flex items-center gap-1.5 transition"
            >
              <span>PDF Hujjat</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <div className="px-4 py-2 rounded-xl bg-blue-600 text-white text-right shrink-0 shadow-xs">
              <span className="text-[10px] text-blue-100 font-bold uppercase block">Jami me'yoriy vaqt</span>
              <span className="text-base sm:text-lg font-black font-mono">
                {OFFICIAL_TOTAL_NORM_MINUTES} daqiqa <span className="text-xs font-semibold text-blue-100">(8s 53d)</span>
              </span>
            </div>
          </div>
        </div>

        {/* Department Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
            <div className="text-[10px] font-bold text-slate-400 uppercase">1. TYTTX</div>
            <div className="text-sm font-black text-slate-900 dark:text-white font-mono mt-0.5">135 daq</div>
            <div className="text-[10px] text-slate-500 truncate">Vagonlar uzatish / tortish</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
            <div className="text-[10px] font-bold text-slate-400 uppercase">2. Qo'riqlash (2-bat.)</div>
            <div className="text-sm font-black text-slate-900 dark:text-white font-mono mt-0.5">80 daq</div>
            <div className="text-[10px] text-slate-500 truncate">Post tekshiruvi & plombalash</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
            <div className="text-[10px] font-bold text-slate-400 uppercase">3. Tarozi xo'jaligi</div>
            <div className="text-sm font-black text-slate-900 dark:text-white font-mono mt-0.5">15 daq</div>
            <div className="text-[10px] text-slate-500 truncate">Brutto / Tara tortish</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
            <div className="text-[10px] font-bold text-slate-400 uppercase">4. TM va XAS / TMT</div>
            <div className="text-sm font-black text-slate-900 dark:text-white font-mono mt-0.5">198 daq</div>
            <div className="text-[10px] text-slate-500 truncate">Yuklash, tozalash, hujjat</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
            <div className="text-[10px] font-bold text-slate-400 uppercase">5. ICHDX (Bojxona)</div>
            <div className="text-sm font-black text-slate-900 dark:text-white font-mono mt-0.5">105 daq</div>
            <div className="text-[10px] text-slate-500 truncate">Bojxona ko'rigi & rasmiylashtiruv</div>
          </div>
        </div>

        {/* 13-stage table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50 dark:bg-slate-800/30">
                <th className="py-2.5 px-3 w-12 text-center">№</th>
                <th className="py-2.5 px-3">Jarayon / Bosqich nomi</th>
                <th className="py-2.5 px-3">Mas'ul xizmat</th>
                <th className="py-2.5 px-3 text-right">Ajratilgan vaqt</th>
                <th className="py-2.5 px-3">Bajariladigan ishlar mazmuni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
              {OFFICIAL_FINISHED_GOODS_STAGES.map((st: any) => (
                <tr key={st.stepNumber} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-400">{st.stepNumber}</td>
                  <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100">{st.name}</td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                      {st.responsible}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                    {st.standardMinutes} daqiqa
                  </td>
                  <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 text-[11px]">{st.description}</td>
                </tr>
              ))}
              <tr className="bg-blue-50/60 dark:bg-blue-950/30 font-bold border-t-2 border-blue-200 dark:border-blue-800">
                <td colSpan={3} className="py-3 px-3 text-right text-slate-800 dark:text-slate-200 uppercase tracking-wider text-xs">
                  JAMI ME'YORIY VAQT (Sikllar yig'indisi):
                </td>
                <td className="py-3 px-3 text-right font-mono text-sm text-blue-700 dark:text-blue-300">
                  {OFFICIAL_TOTAL_NORM_MINUTES} daqiqa
                </td>
                <td className="py-3 px-3 text-xs text-blue-700 dark:text-blue-300">
                  8 soat 53 daqiqa (≈ 8.9 soat)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
