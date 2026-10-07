import { useState, useEffect } from 'react';
import { api } from '../../../shared/services/api';
import {
  Send,
  X,
  Bell,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Smartphone,
  RefreshCw,
  TrainFront,
  ArrowDownToLine,
  ArrowUpFromLine,
  Flame,
} from 'lucide-react';
import {
  getTelegramConfig,
  saveTelegramConfig,
  sendTelegramMessage,
} from '../../../shared/services/telegramService';

interface TelegramAlertsModalProps {
  isOpen: boolean;
  onClose: () => void;
  redCount?: number;
  totalActive?: number;
}

type TemplateKey = 'wagon_added' | 'wagon_loaded' | 'wagon_exit' | 'demurrage' | 'party' | 'summary';

export function TelegramAlertsModal({
  isOpen,
  onClose,
  redCount = 2,
  totalActive = 28,
}: TelegramAlertsModalProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'settings'>('preview');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateKey>('demurrage');

  // Load configs
  const [botToken, setBotToken] = useState(() => getTelegramConfig().botToken);
  const [chatId, setChatId] = useState(() => getTelegramConfig().chatId);
  const [autoWagonAdded, setAutoWagonAdded] = useState(() => getTelegramConfig().autoWagonAdded);
  const [autoWagonLoading, setAutoWagonLoading] = useState(() => getTelegramConfig().autoWagonLoading);
  const [autoWagonExit, setAutoWagonExit] = useState(() => getTelegramConfig().autoWagonExit);
  const [autoDemurrage, setAutoDemurrage] = useState(() => getTelegramConfig().autoDemurrage);
  const [autoParty, setAutoParty] = useState(() => getTelegramConfig().autoParty);
  const [autoDailySummary, setAutoDailySummary] = useState(() => getTelegramConfig().autoDailySummary);

  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  // Serverdan Telegram sozlamalarini yuklash
  useEffect(() => {
    if (!isOpen) return;
    api.getTelegramSettings()
      .then((res: any) => {
        if (res.data) {
          const d = res.data;
          if (d.botToken) setBotToken(d.botToken);
          if (d.chatId) setChatId(d.chatId);
          if (typeof d.autoWagonAdded === 'boolean') setAutoWagonAdded(d.autoWagonAdded);
          if (typeof d.autoWagonLoading === 'boolean') setAutoWagonLoading(d.autoWagonLoading);
          if (typeof d.autoWagonExit === 'boolean') setAutoWagonExit(d.autoWagonExit);
          if (typeof d.autoDemurrage === 'boolean') setAutoDemurrage(d.autoDemurrage);
          if (typeof d.autoParty === 'boolean') setAutoParty(d.autoParty);
          if (typeof d.autoDailySummary === 'boolean') setAutoDailySummary(d.autoDailySummary);
        }
      })
      .catch((err: any) => {
        console.debug("Backend telegram sozlamalari yuklanmadi, kesh ishlatildi", err);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const todayStr = new Intl.DateTimeFormat('uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tashkent',
  }).format(new Date());

  const templates: Record<TemplateKey, string> = {
    wagon_added: `🆕 YANGI VAGON RO'YXATGA OLINDI / QO'SHILDI\n━━━━━━━━━━━━━━━━━━━━\n🔢 Vagonlar soni: 2 ta\n🛤️ Raqamlari: #63821092, #63821093\n📦 Partiya: #ZF-2026-09-14\n📋 Mahsulot turi: Polietilen (granula)\n🛤️ Kelgan yo'l: 4-yo'l (Kengsoy stansiyasidan)\n🕒 Vaqti: ${todayStr}\n📍 Holati: Zavod hududiga kiritish va ko'rikka tayyorlandi\n━━━━━━━━━━━━━━━━━━━━\nE-Transport Avtomat Nazorati`,
    wagon_loaded: `⚡ VAGON YUKLANDI\n━━━━━━━━━━━━━━━━━━━━\n🔢 Yuklangan vagonlar: 1 ta\n🛤️ Vagon raqamlari: #54218902\n📦 Mahsulot: Polietilen (granula)\n🏭 Estakada: 1-estakada\n⚖️ Brutto: 70.40 tn | Netto: 68.00 tn\n🕒 Vaqti: ${todayStr}\n📍 Holati: Estakadada yuklash yakunlandi. Brutto tarozi va plomba o'rnatishga o'tkazildi\n━━━━━━━━━━━━━━━━━━━━\nE-Transport Avtomat Nazorati`,
    wagon_exit: `🚂 VAGON CHIQARILDI (KENGSOYGA JO'NATILDI)\n━━━━━━━━━━━━━━━━━━━━\n📋 Yuk xati / Reyestr: #RX-2026-102\n🔢 Chiqarilgan vagonlar: 8 ta\n🛤️ Vagon raqamlari: #54218902, #56712344, #63821092, #63821093...\n🏁 Yo'nalish: Kengsoy stansiyasi (O'TY)\n⚖️ Umumiy og'irlik: 544.00 tn\n🕒 Chiqarilgan vaqti: ${todayStr}\n📍 Holati: Barcha nazorat bosqichlari (plomba, qo'riqlash) yakunlanib Kengsoyga chiqarildi\n━━━━━━━━━━━━━━━━━━━━\nE-Transport Avtomat Nazorati`,
    demurrage: `🚨 DIQQAT: PROSTOY VA O'TY JARIMA XAVFI!\n━━━━━━━━━━━━━━━━━━━━\nHududda ${redCount} ta vagon 20 soatdan ortiq qolib ketdi:\n\n• Vagon #54218902 (Tashqi/O'TY) — 22.4 soat\n  Bosqich: Estakadada yuklanmoqda\n  ⚠️ O'TY normatividan oshishiga: 1.6 soat qoldi!\n\n• Vagon #56712344 (Tashqi/O'TY) — 21.0 soat\n  Bosqich: Brutto tarozi navbatida\n\n📌 Dispetcherga ko'rsatma: Ushbu vagonlarni FIFO ustuvorligida birinchi navbatda yuklab chiqarib yuborish talab qilinadi!\n━━━━━━━━━━━━━━━━━━━━\nE-Transport Avtomat Nazorati`,
    party: `📦 YANGI VAGONLAR PARTIYASI KELDI\n━━━━━━━━━━━━━━━━━━━━\nPartiya: #ZF-2026-09-14\nVagonlar soni: 14 ta vagon\nMahsulot turi: Polietilen (granula)\nTemir yo'l yo'lagi: 4-yo'l (Kengsoy stansiyasidan)\nKelgan vaqti: ${todayStr}\nDispetcher holati: Tara tortishga navbatga qo'yildi.\n━━━━━━━━━━━━━━━━━━━━\nE-Transport Logistics System`,
    summary: `📋 KUNLIK SMENA XULOSASI (Soat 20:00)\n━━━━━━━━━━━━━━━━━━━━\nSana: ${todayStr}\n\n📥 Kirgan bo'sh vagonlar: 22 ta (2 ta partiya)\n⚖️ Yuklangan vagonlar: 18 ta (1 224 tonna)\n📤 Kengsoyga jo'natilgan: 16 ta (1 088 tonna)\n⏱️ Hududdagi jami faol: ${totalActive} ta vagon\n🔴 Qizil xavf zonasida: ${redCount} ta vagon\n🟡 Sariq xavf zonasida: 5 ta vagon\n━━━━━━━━━━━━━━━━━━━━\nBoshqaruv paneli: E-Transport Tahlil Markazi`,
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(templates[selectedTemplate]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveSettings = async () => {
    const payload = {
      botToken,
      chatId,
      autoWagonAdded,
      autoWagonLoading,
      autoWagonExit,
      autoDemurrage,
      autoParty,
      autoDailySummary,
    };
    saveTelegramConfig(payload);
    try {
      await api.saveTelegramSettings(payload);
      setStatusMessage({ text: "✅ Sozlamalar serverda va bazada muvaffaqiyatli saqlandi!", ok: true });
    } catch (e: any) {
      setStatusMessage({ text: "⚠️ Brauzerda saqlandi, serverga saqlashda xatolik: " + (e?.message || e), ok: false });
    }
    setTimeout(() => setStatusMessage(null), 3500);
  };

  const handleSendTestMessage = async () => {
    setSending(true);
    setStatusMessage(null);

    try {
      const res = await sendTelegramMessage(templates[selectedTemplate], {
        botToken,
        chatId,
      });

      if (res.ok) {
        setStatusMessage({ text: "✅ Xabar Telegramga muvaffaqiyatli yetkazildi!", ok: true });
      } else if (res.description && res.description.includes('chat not found')) {
        setStatusMessage({
          text: "⚠️ Chat topilmadi! Iltimos, Telegramda @sgccetransport_bot ga kirib Start bosing yoki botni guruhga qo'shing.",
          ok: false,
        });
      } else {
        setStatusMessage({ text: `Xatolik: ${res.description || 'Xabar yuborilmadi'}`, ok: false });
      }
    } catch (e: any) {
      setStatusMessage({ text: `Xabar yuborishda xatolik yuz berdi: ${e?.message || e}`, ok: false });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/10 backdrop-blur-md">
              <Smartphone className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Telegram Dispetcherlik va Rahbariyat Xabarlari</h3>
              <p className="text-xs text-sky-100">Avtomatik operativ ogohlantirishlar va smena xulosalari</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status banner */}
        {statusMessage && (
          <div className={`px-6 py-2.5 text-xs font-semibold flex items-center justify-between ${
            statusMessage.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300'
          }`}>
            <span className="flex items-center gap-2">
              {statusMessage.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-red-600" />}
              {statusMessage.text}
            </span>
            <button type="button" onClick={() => setStatusMessage(null)} className="text-xs underline">Yopish</button>
          </div>
        )}

        {/* Tabs */}
        <div className="px-6 pt-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`pb-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition ${
                activeTab === 'preview'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              Avtomat xabar shablonlari
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`pb-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition ${
                activeTab === 'settings'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Bot sozlamalari
            </button>
          </div>
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800 flex items-center gap-1 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
            Bot faol
          </span>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {activeTab === 'preview' ? (
            <div className="space-y-4">
              {/* Template Selectors */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedTemplate('demurrage')}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    selectedTemplate === 'demurrage'
                      ? 'border-red-500 bg-red-50/60 dark:bg-red-950/30 text-red-900 dark:text-red-200 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <Flame className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    <span>Prostoy xavfi</span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    {redCount} ta vagon &gt;20 soat
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedTemplate('wagon_added')}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    selectedTemplate === 'wagon_added'
                      ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <ArrowDownToLine className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span>Yangi vagon kirdi</span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    Vagon qo'shilganda
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedTemplate('wagon_loaded')}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    selectedTemplate === 'wagon_loaded'
                      ? 'border-amber-500 bg-amber-50/60 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <TrainFront className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>Vagon yuklandi</span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    Estakadada yuklash
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedTemplate('wagon_exit')}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    selectedTemplate === 'wagon_exit'
                      ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <ArrowUpFromLine className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>Vagon chiqarildi</span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    Kengsoyga jo'natish
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedTemplate('party')}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    selectedTemplate === 'party'
                      ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/30 text-indigo-900 dark:text-indigo-200 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <Bell className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span>Yangi partiya</span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    Poyezd / partiya kelishi
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedTemplate('summary')}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    selectedTemplate === 'summary'
                      ? 'border-purple-500 bg-purple-50/60 dark:bg-purple-950/30 text-purple-900 dark:text-purple-200 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                    <span>Kunlik xulosa</span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    20:00 da smena hisoboti
                  </div>
                </button>
              </div>

              {/* Telegram Card Preview Box */}
              <div className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs border border-slate-700/80 shadow-inner relative group">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
                    Telegram xabari ko'rinishi
                  </span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex items-center gap-1 text-slate-300 hover:text-white transition"
                    title="Nusxalash"
                  >
                    {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? "Nusxalandi!" : "Nusxalash"}</span>
                  </button>
                </div>
                <pre className="whitespace-pre-wrap leading-relaxed text-slate-200 selection:bg-blue-600 max-h-56 overflow-y-auto">
                  {templates[selectedTemplate]}
                </pre>
              </div>

              <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 text-xs text-sky-800 dark:text-sky-300 flex items-start gap-2.5">
                <Bell className="w-4 h-4 shrink-0 text-sky-600 dark:text-sky-400 mt-0.5" />
                <div>
                  <span className="font-bold">Avtomatik yetkazish qoidasi:</span> Tanlangan hodisalar yuz berganda (vagon qo'shilishi, yuklanishi, Kengsoyga chiqishi, prostoy xavfi) tizim avtomat tarzda belgilangan Telegram guruh va mas'ullarga operativ xabar yo'llaydi.
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Telegram Bot Token
                </label>
                <input
                  type="text"
                  value={botToken}
                  onChange={e => setBotToken(e.target.value)}
                  placeholder="123456789:ABCDefGhIjKlMnOpQrStUvWxYz..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">@BotFather orqali olingan bot tokeni</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Dispetcherlik guruhi yoki Rahbariyat Chat ID
                </label>
                <input
                  type="text"
                  value={chatId}
                  onChange={e => setChatId(e.target.value)}
                  placeholder="-1001234567890 yoki 948197737"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">Xabarlar yuboriladigan Telegram guruh yoki kanal identifikatori</p>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2">
                  Avtomatik bildirishnoma triggerlari:
                </span>

                {/* 1. Yangi vagon paydo bo'lsa yoki qo'shilsa */}
                <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                  <div className="text-xs">
                    <span className="font-semibold block text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <ArrowDownToLine className="w-3.5 h-3.5 text-blue-600" />
                      Birorta vagon paydo bo'lsa yoki qo'shilsa
                    </span>
                    <span className="text-slate-400">Tizimga yangi vagon kiritilganda darhol ogohlantirish</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoWagonAdded}
                    onChange={e => setAutoWagonAdded(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                </label>

                {/* 2. Vagonlarni yuklash */}
                <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                  <div className="text-xs">
                    <span className="font-semibold block text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <TrainFront className="w-3.5 h-3.5 text-amber-600" />
                      Vagonlarni yuklash (Yuklanganda)
                    </span>
                    <span className="text-slate-400">Vagon estakadada yuklanishi yakunlanganda xabar berish</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoWagonLoading}
                    onChange={e => setAutoWagonLoading(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                </label>

                {/* 3. Vagonlarni chiqarish */}
                <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                  <div className="text-xs">
                    <span className="font-semibold block text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <ArrowUpFromLine className="w-3.5 h-3.5 text-emerald-600" />
                      Vagonlarni chiqarish (Kengsoyga)
                    </span>
                    <span className="text-slate-400">Vagonlar zavoddan Kengsoyga jo'natilganda / chiqarilganda</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoWagonExit}
                    onChange={e => setAutoWagonExit(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                </label>

                {/* 4. Prostoy xavfi */}
                <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                  <div className="text-xs">
                    <span className="font-semibold block text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 text-red-600" />
                      Prostoy xavfi (&gt;20 soat)
                    </span>
                    <span className="text-slate-400">Vagon normativ vaqtga yaqinlashganda ogohlantirish</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoDemurrage}
                    onChange={e => setAutoDemurrage(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                </label>

                {/* 5. Yangi partiya */}
                <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                  <div className="text-xs">
                    <span className="font-semibold block text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Bell className="w-3.5 h-3.5 text-indigo-600" />
                      Yangi partiya kirganda
                    </span>
                    <span className="text-slate-400">Temir yo'ldan yangi partiya kelishi bilan signal berish</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoParty}
                    onChange={e => setAutoParty(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                </label>

                {/* 6. Kunlik smena */}
                <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                  <div className="text-xs">
                    <span className="font-semibold block text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />
                      Kunlik smena yakuni (20:00 da)
                    </span>
                    <span className="text-slate-400">Har kuni soat 20:00 da umumiy sutkalik ko'rsatkichlar xulosasi</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoDailySummary}
                    onChange={e => setAutoDailySummary(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                </label>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-700 text-white font-semibold text-xs shadow transition"
                >
                  Sozlamalarni saqlash
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500">
            <a href="https://t.me/sgccetransport_bot" target="_blank" rel="noopener noreferrer" className="hover:text-blue-500 underline flex items-center gap-1 font-mono">
              Bot: @sgccetransport_bot
            </a>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
            >
              Yopish
            </button>
            <button
              type="button"
              onClick={handleSendTestMessage}
              disabled={sending}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-sm hover:shadow flex items-center gap-1.5 transition disabled:opacity-50"
            >
              {sending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>{sending ? "Yuborilmoqda..." : "Telegramga sinov xabari yuborish"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
