import {
  Timer,
  Clock,
  CheckCircle2,
  AlertTriangle,
  X,
  User,
  Building,
  AlertCircle,
  Flame,
  Info,
} from 'lucide-react';
import type { DemurrageWagonItem, WagonStageStopwatchItem } from '../utils/demurrageUtils';

interface WagonStopwatchModalProps {
  wagon: DemurrageWagonItem | null;
  isOpen: boolean;
  onClose: () => void;
}

function fmtMoney(amount: number): string {
  return new Intl.NumberFormat('uz-UZ').format(amount);
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function WagonStopwatchModal({ wagon, isOpen, onClose }: WagonStopwatchModalProps) {
  if (!isOpen || !wagon) return null;

  const isRed = wagon.zone === 'red';
  const isYellow = wagon.zone === 'yellow';
  const stages = wagon.stageBreakdown || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Timer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white font-mono">
                  Vagon № {wagon.wagonNumber}
                </h2>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  Daqiqabay Xronometraj (Stopwatch)
                </span>
                {wagon.ownership === 'tashqi' ? (
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                    🔴 Tashqi (O‘TY jarimasi xavfi)
                  </span>
                ) : (
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    🔵 Majmua vagoni
                  </span>
                )}
                {wagon.isExited ? (
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                    Chiqib ketgan
                  </span>
                ) : (
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                    Hududda
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>Partiya: <b className="text-slate-700 dark:text-slate-300">{wagon.arrivalNumber}</b></span>
                {wagon.productType && <span>Mahsulot: <b className="text-slate-700 dark:text-slate-300">{wagon.productType}</b></span>}
                {wagon.contractorName && <span>Kontragent: <b className="text-slate-700 dark:text-slate-300">{wagon.contractorName}</b></span>}
                <span>Kelgan: <b className="text-slate-700 dark:text-slate-300">{fmtDate(wagon.arrivalDate)}</b></span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title="Yopish"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {/* Top KPI Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs">
                <span>Jami hududdagi vaqti</span>
                <Clock className="w-4 h-4 text-blue-500" />
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
                {wagon.hoursInPlant} soat
                <span className="text-xs font-normal text-slate-400 ml-1">
                  ({Math.round(wagon.hoursInPlant * 60)} daq)
                </span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Texnologik me‘yor: <b>{wagon.normativeHours}s (533 daq)</b>
              </div>
            </div>

            <div className={`p-3.5 rounded-xl border ${
              isRed
                ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50'
                : isYellow
                ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50'
                : 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50'
            }`}>
              <div className="flex items-center justify-between text-xs">
                <span className={isRed ? 'text-rose-700 dark:text-rose-300 font-semibold' : 'text-slate-500 dark:text-slate-400'}>
                  Me‘yordan kechikish
                </span>
                {isRed ? <Flame className="w-4 h-4 text-rose-500" /> : <Clock className="w-4 h-4 text-amber-500" />}
              </div>
              <div className={`text-xl font-bold mt-1 tabular-nums ${
                isRed ? 'text-rose-600 dark:text-rose-400' : isYellow ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
              }`}>
                {wagon.overdueHours > 0 ? `+${wagon.overdueHours} soat` : "Me‘yorda (0s)"}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {wagon.overdueHours > 0 ? (
                  <span>Normadan <b>{Math.round(wagon.overdueHours * 60)} daq</b> oshgan</span>
                ) : (
                  <span>Ortiqcha turib qolish yo‘q</span>
                )}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs">
                <span>O‘TY Jarimasi</span>
                <AlertTriangle className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-1 font-mono tabular-nums">
                {fmtMoney(wagon.estimatedPenaltyUzs)} <span className="text-xs font-normal">so‘m</span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {wagon.ownership === 'tashqi' ? 'O‘TY soatbay tarif bo‘yicha' : 'Ichki majmua vagoni'}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs">
                <span>Asosiy kechikish sababchisi</span>
                <User className="w-4 h-4 text-purple-500" />
              </div>
              <div className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                {wagon.delayCulprit?.role || "Me‘yorda / Aniqlanmadi"}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate" title={wagon.delayCulprit?.stageName}>
                {wagon.delayCulprit?.stageName || "Xizmat me‘yorni buzmagan"}
              </div>
            </div>
          </div>

          {/* Regulatory explanation banner */}
          <div className="p-3 rounded-xl bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 text-xs text-blue-900 dark:text-blue-200 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Daqiqabay adolatli hisob-kitob qoidasi: </span>
              Sho‘rtan GKM Jarayon reglamenti (2-tahrir, tasdiqlangan me‘yor: <b>533 daqiqa / 8.9 soat</b>). Vagon umumiy kechikkanda, O‘TY jarimasi faqat o‘ziga berilgan daqiqabay me‘yorni buzgan xizmatlarga mutanosib ravishda yuklatiladi. Harakatni o‘z vaqtida bajargan xizmatlarga jarima hisoblanmaydi.
            </div>
          </div>

          {/* 10-Stage Chronological Stopwatch Table */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-3 bg-slate-100/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Timer className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="font-bold text-xs text-slate-900 dark:text-white">
                  10 Bosqichli Jarayon Xronometraji va Mas‘ul Xizmatlar
                </span>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Jami me‘yor: 533 daqiqa (8.9 soat)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center">#</th>
                    <th className="py-2.5 px-3 min-w-[220px]">Bosqich & Mas‘ul Rol</th>
                    <th className="py-2.5 px-3 min-w-[140px]">Mas‘ul xodim</th>
                    <th className="py-2.5 px-3 text-center">Me‘yor</th>
                    <th className="py-2.5 px-3 text-center">Haqiqiy vaqt</th>
                    <th className="py-2.5 px-3 text-center">Holati</th>
                    <th className="py-2.5 px-3 text-right min-w-[130px]">O‘TY Jarima ulushi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {stages.map((st: WagonStageStopwatchItem) => {
                    const isDelayed = st.isOverdue || st.overdueHours > 0;
                    const isCurrent = st.status === 'active';
                    const isPending = st.status === 'pending';
                    const isCompleted = st.status === 'done';

                    return (
                      <tr
                        key={st.stageNumber}
                        className={`transition ${
                          isCurrent
                            ? isDelayed
                              ? 'bg-rose-50/60 dark:bg-rose-950/30'
                              : 'bg-blue-50/60 dark:bg-blue-950/30 font-medium'
                            : isDelayed
                            ? 'bg-amber-50/30 dark:bg-amber-950/15'
                            : isPending
                            ? 'opacity-60 bg-slate-50/30 dark:bg-slate-900/30'
                            : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        {/* Step index */}
                        <td className="py-3 px-3 text-center font-mono">
                          <span
                            className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold ${
                              isCurrent
                                ? 'bg-blue-600 text-white animate-pulse'
                                : isDelayed
                                ? 'bg-rose-500 text-white'
                                : isCompleted
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {st.stageNumber}
                          </span>
                        </td>

                        {/* Stage name & Department */}
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <span>{st.stageName}</span>
                            {isCurrent && (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-blue-600 text-white animate-pulse">
                                Hozir shu yerda
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            <span className="flex items-center gap-1">
                              <Building className="w-3 h-3 text-slate-400" />
                              {st.role}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 italic">
                            {st.description}
                          </div>
                        </td>

                        {/* Responsible Employee */}
                        <td className="py-3 px-3">
                          {st.responsibleEmployee ? (
                            <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200 font-medium">
                              <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="truncate max-w-[140px]" title={st.responsibleEmployee}>
                                {st.responsibleEmployee}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}
                        </td>

                        {/* Normative time */}
                        <td className="py-3 px-3 text-center tabular-nums">
                          <div className="font-medium text-slate-700 dark:text-slate-300">
                            {Math.round(st.standardHours * 60)} daq
                          </div>
                          <div className="text-[10px] text-slate-400">
                            ({st.standardHours} soat)
                          </div>
                        </td>

                        {/* Actual time */}
                        <td className="py-3 px-3 text-center tabular-nums">
                          {st.actualHours > 0 ? (
                            <div>
                              <div
                                className={`font-bold ${
                                  isDelayed
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-slate-900 dark:text-white'
                                }`}
                              >
                                {Math.round(st.actualHours * 60)} daq
                              </div>
                              <div className="text-[10px] text-slate-400">
                                ({st.actualHours.toFixed(1)}s)
                              </div>
                              {isDelayed && (
                                <div className="text-[10px] font-bold text-rose-500">
                                  +{st.overdueHours.toFixed(1)}s kechikish
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-3 px-3 text-center">
                          {isCompleted ? (
                            isDelayed ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                Kechikib yakunlangan
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Me‘yorda
                              </span>
                            )
                          ) : isCurrent ? (
                            isDelayed ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white animate-pulse">
                                <Flame className="w-3 h-3" />
                                Kechikmoqda
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500 text-white">
                                <Clock className="w-3 h-3" />
                                Jarayonda
                              </span>
                            )
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                              Kutilmoqda
                            </span>
                          )}
                        </td>

                        {/* Penalty Share */}
                        <td className="py-3 px-3 text-right tabular-nums">
                          {st.penaltyShareUzs > 0 ? (
                            <div>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold font-mono text-[11px] bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
                                <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
                                {fmtMoney(st.penaltyShareUzs)} so‘m
                              </span>
                              <div className="text-[10px] text-rose-600 font-medium mt-0.5">
                                {st.role} hisobiga
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 font-mono text-[11px]">0 so‘m</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Jami vagon O‘TY jarimasi: <b className="text-rose-600 dark:text-rose-400 font-mono">{fmtMoney(wagon.estimatedPenaltyUzs)} so‘m</b>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition"
          >
            Yopish
          </button>
        </div>
      </div>
    </div>
  );
}
