import React, { useState, useEffect } from 'react';
import {
  Send,
  Bell,
  CheckCircle2,
  AlertTriangle,
  Copy,
  RefreshCw,
  TrainFront,
  ArrowDownToLine,
  ArrowUpFromLine,
  Flame,
  Settings,
  ExternalLink,
  Bot,
  Layers,
} from 'lucide-react';
import { api } from '../../../shared/services/api';
import {
  getTelegramConfig,
  saveTelegramConfig,
  sendTelegramMessage,
} from '../../../shared/services/telegramService';

type TemplateKey = 'demurrage' | 'wagon_added' | 'wagon_loaded' | 'wagon_exit' | 'party' | 'summary';

export function TelegramAlertsPage() {
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
  const [redCount] = useState(2);
  const [totalActive] = useState(28);

  // Serverdan Telegram sozlamalarini yuklash
  useEffect(() => {
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
  }, []);

  const todayStr = new Intl.DateTimeFormat('uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tashkent',
  }).format(new Date());

  const templates: Record<TemplateKey, string> = {
    demurrage: `🚨 DIQQAT: PROSTOY VA O'TY JARIMA XAVFI!\n━━━━━━━━━━━━━━━━━━━━\nHududda ${redCount} ta vagon 20 soatdan ortiq qolib ketdi:\n\n• Vagon #54218902 (Tashqi/O'TY) — 22.4 soat\n  Bosqich: Estakadada yuklanmoqda\n  ⚠️ O'TY normatividan oshishiga: 1.6 soat qoldi!\n\n• Vagon #56712344 (Tashqi/O'TY) — 21.0 soat\n  Bosqich: Brutto tarozi navbatida\n\n📌 Dispetcherga ko'rsatma: Ushbu vagonlarni FIFO ustuvorligida birinchi navbatda yuklab chiqarib yuborish talab qilinadi!\n━━━━━━━━━━━━━━━━━━━━\nE-Transport Avtomat Nazorati`,
    wagon_added: `🆕 YANGI VAGON RO'YXATGA OLINDI / QO'SHILDI\n━━━━━━━━━━━━━━━━━━━━\n🔢 Vagonlar soni: 2 ta\n🛤️ Raqamlari: #63821092, #63821093\n📦 Partiya: #ZF-2026-09-14\n📋 Mahsulot turi: Polietilen (granula)\n🛤️ Kelgan yo'l: 4-yo'l (Kengsoy stansiyasidan)\n🕒 Vaqti: ${todayStr}\n📍 Holati: Zavod hududiga kiritish va ko'rikka tayyorlandi\n━━━━━━━━━━━━━━━━━━━━\nE-Transport Avtomat Nazorati`,
    wagon_loaded: `⚡ VAGON YUKLANDI\n━━━━━━━━━━━━━━━━━━━━\n🔢 Yuklangan vagonlar: 1 ta\n🛤️ Vagon raqamlari: #54218902\n📦 Mahsulot: Polietilen (granula)\n🏭 Estakada: 1-estakada\n⚖️ Brutto: 70.40 tn | Netto: 68.00 tn\n🕒 Vaqti: ${todayStr}\n📍 Holati: Estakadada yuklash yakunlandi. Brutto tarozi va plomba o'rnatishga o'tkazildi\n━━━━━━━━━━━━━━━━━━━━\nE-Transport Avtomat Nazorati`,
    wagon_exit: `🚂 VAGON CHIQARILDI (KENGSOYGA JO'NATILDI)\n━━━━━━━━━━━━━━━━━━━━\n📋 Yuk xati / Reyestr: #RX-2026-102\n🔢 Chiqarilgan vagonlar: 8 ta\n🛤️ Vagon raqamlari: #54218902, #56712344, #63821092, #63821093...\n🏁 Yo'nalish: Kengsoy stansiyasi (O'TY)\n⚖️ Umumiy og'irlik: 544.00 tn\n🕒 Chiqarilgan vaqti: ${todayStr}\n📍 Holati: Barcha nazorat bosqichlari (plomba, qo'riqlash) yakunlanib Kengsoyga chiqarildi\n━━━━━━━━━━━━━━━━━━━━\nE-Transport Avtomat Nazorati`,
    party: `📦 YANGI VAGONLAR PARTIYASI KELDI\n━━━━━━━━━━━━━━━━━━━━\nPartiya: #ZF-2026-09-14\nVagonlar soni: 14 ta vagon\nMahsulot turi: Polietilen (granula)\nTemir yo'l yo'lagi: 4-yo'l (Kengsoy stansiyasidan)\nKelgan vaqti: ${todayStr}\nDispetcher holati: Tara tortishga navbatga qo'yildi.\n━━━━━━━━━━━━━━━━━━━━\nE-Transport Logistics System`,
    summary: `📋 KUNLIK SMENA XULOSASI (Soat 20:00)\n━━━━━━━━━━━━━━━━━━━━\nSana: ${todayStr}\n\n📥 Kirgan bo'sh vagonlar: 22 ta (2 ta partiya)\n⚖️ Yuklangan vagonlar: 18 ta (1 224 tonna)\n📤 Kengsoyga jo'natilgan: 16 ta (1 088 tonna)\n⏱️ Hududdagi jami faol: ${totalActive} ta vagon\n🔴 Qizil xavf zonasida: ${redCount} ta vagon\n🟡 Sariq xavf zonasida: 5 ta vagon\n━━━━━━━━━━━━━━━━━━━━\nBoshqaruv paneli: E-Transport Tahlil Markazi`,
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(templates[selectedTemplate]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
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
      setStatusMessage({ text: "Sozlamalar serverda va bazada muvaffaqiyatli saqlandi!", ok: true });
    } catch (err: any) {
      setStatusMessage({ text: "Brauzerda saqlandi, serverga saqlashda xatolik: " + (err?.message || err), ok: false });
    }
    setTimeout(() => setStatusMessage(null), 4000);
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
        setStatusMessage({ text: "Xabar Telegramga muvaffaqiyatli yetkazildi!", ok: true });
      } else if (res.description && res.description.includes('chat not found')) {
        setStatusMessage({
          text: "Chat topilmadi! Iltimos, Telegramda @sgccetransport_bot ga kirib Start bosing yoki botni guruhga qo'shing.",
          ok: false,
        });
      } else {
        setStatusMessage({ text: `Xatolik: ${res.description || 'Xabar yuborilmadi'}`, ok: false });
      }
    } catch (err: any) {
      setStatusMessage({ text: `Xabar yuborishda xatolik yuz berdi: ${err?.message || err}`, ok: false });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="thub min-h-screen pb-12 w-full max-w-full overflow-x-hidden">

      {/* Hero Header */}
      <header className="thub__hero">
        <div className="thub__hero-text">
          <p className="thub__eyebrow flex items-center gap-1.5 text-sky-600 dark:text-sky-400 font-bold">
            <Send className="w-3.5 h-3.5" />
            Operativ ogohlantirishlar va bot nazorati
          </p>
          <h1 className="thub__title">Telegram Dispetcherlik va Rahbariyat Xabarlari</h1>
          <p className="thub__lead">
            Vagonlar qo‘shilishi, yuklanishi, Kengsoy stansiyasiga chiqarilishi, prostoy xavfi hamda kunlik
            smena xulosalarini Telegram guruh va kanallariga avtomat tarzda yetkazish boshqaruvi.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
            Bot faol
          </span>
          <button
            type="button"
            onClick={handleSendTestMessage}
            disabled={sending}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white shadow-xs flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {sending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            <span>{sending ? "Yuborilmoqda..." : "Telegramga sinov xabari yuborish"}</span>
          </button>
        </div>
      </header>

      {/* Notification Toast */}
      {statusMessage && (
        <div className={`p-4 rounded-2xl mb-6 border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs animate-in fade-in duration-200 ${
          statusMessage.ok
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
            : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl text-white shrink-0 ${statusMessage.ok ? 'bg-emerald-500' : 'bg-rose-500'}`}>
              {statusMessage.ok ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            </div>
            <div>
              <div className="font-bold text-sm">{statusMessage.ok ? "Muvaffaqiyatli bajarildi" : "Xatolik yuz berdi"}</div>
              <div className="text-xs opacity-90">{statusMessage.text}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-xs font-medium underline self-start sm:self-auto cursor-pointer"
          >
            Yopish
          </button>
        </div>
      )}

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start w-full">
        {/* Left Column: Template Cards & Realistic Preview (7 cols on XL) */}
        <div className="xl:col-span-7 2xl:col-span-8 space-y-6 w-full min-w-0">
          <div className="p-4 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-900/40 shrink-0">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                    1. Operativ xabar shablonlari va jonli ko‘rinish
                  </h2>
                  <p className="text-xs text-slate-500">
                    Hodisa yuz berganda Telegramga yuboriladigan avtomatik format va matn strukturasi
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 self-start sm:self-auto">
                6 ta shablon
              </span>
            </div>

            {/* Template Selector Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setSelectedTemplate('demurrage')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedTemplate === 'demurrage'
                    ? 'border-red-400 bg-red-50/70 dark:bg-red-950/30 text-red-950 dark:text-red-200 shadow-xs ring-1 ring-red-400/30'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <Flame className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <span>Prostoy xavfi</span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                  {redCount} ta vagon &gt;20 soat
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedTemplate('wagon_added')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedTemplate === 'wagon_added'
                    ? 'border-sky-500 bg-sky-50/70 dark:bg-sky-950/30 text-sky-950 dark:text-sky-200 shadow-xs ring-1 ring-sky-500/30'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <ArrowDownToLine className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                  <span>Yangi vagon kirdi</span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                  Vagon qo‘shilganda
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedTemplate('wagon_loaded')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedTemplate === 'wagon_loaded'
                    ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/30 text-amber-950 dark:text-amber-200 shadow-xs ring-1 ring-amber-500/30'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <TrainFront className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Vagon yuklandi</span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                  Estakadada yuklash
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedTemplate('wagon_exit')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedTemplate === 'wagon_exit'
                    ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-950 dark:text-emerald-200 shadow-xs ring-1 ring-emerald-500/30'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <ArrowUpFromLine className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Vagon chiqarildi</span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                  Kengsoyga jo‘natish
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedTemplate('party')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedTemplate === 'party'
                    ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/30 text-indigo-950 dark:text-indigo-200 shadow-xs ring-1 ring-indigo-500/30'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <Bell className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>Yangi partiya</span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                  Poyezd kelishi
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedTemplate('summary')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedTemplate === 'summary'
                    ? 'border-purple-500 bg-purple-50/70 dark:bg-purple-950/30 text-purple-950 dark:text-purple-200 shadow-xs ring-1 ring-purple-500/30'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                  <span>Kunlik xulosa</span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                  20:00 da smena hisoboti
                </div>
              </button>
            </div>

            {/* Telegram Chat Message Bubble (Native Preview) */}
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-950/70 p-4 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/80 dark:border-slate-800 text-xs">
                <div className="flex items-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#2AABEE] text-white shadow-xs">
                    <Send className="w-2.5 h-2.5 -translate-x-[0.5px] translate-y-[0.5px]" />
                  </div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    Telegram xabari jonli ko‘rinishi
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-xs cursor-pointer"
                  title="Nusxalash"
                >
                  {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                  <span>{copied ? "Nusxalandi!" : "Matnni nusxalash"}</span>
                </button>
              </div>

              <div className="rounded-2xl rounded-tl-sm bg-white dark:bg-slate-900 p-4 shadow-xs border border-slate-200/80 dark:border-slate-800/80">
                <pre className="whitespace-pre-wrap font-sans text-xs sm:text-sm leading-relaxed text-slate-800 dark:text-slate-200 max-h-72 overflow-y-auto pr-1">
                  {templates[selectedTemplate]}
                </pre>
                <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                  <span>{todayStr.split(' ')[1] || '20:00'}</span>
                  <span className="text-[#2AABEE] font-bold">✓✓</span>
                </div>
              </div>
            </div>

            {/* Information Notice */}
            <div className="p-4 rounded-xl bg-sky-50/70 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/40 text-xs text-sky-900 dark:text-sky-300 flex items-start gap-3">
              <Bell className="w-4 h-4 shrink-0 text-sky-600 dark:text-sky-400 mt-0.5" />
              <div className="leading-relaxed">
                <span className="font-semibold text-sky-950 dark:text-sky-200">Avtomatik operativ ogohlantirish qoidasi:</span> Tanlangan
                hodisalar yuz berganda (vagon qo‘shilishi, estakadada yuklanishi, Kengsoy stansiyasiga chiqarilishi, prostoy xavfi)
                tizim avtomat tarzda belgilangan Telegram guruh va mas’ullarga zudlik bilan bildirishnoma yo‘llaydi.
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Bot Connection & Triggers Settings (5 cols on XL) */}
        <div className="xl:col-span-5 2xl:col-span-4 space-y-6 w-full min-w-0">
          <form onSubmit={handleSaveSettings} className="p-4 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
            <div className="flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/40 shrink-0">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  2. Telegram Bot va kanal parametrlari
                </h2>
                <p className="text-xs text-slate-500">
                  BotFather kaliti va xabarlar yuboriladigan guruh ID
                </p>
              </div>
            </div>

            {/* Bot Token Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span>Telegram Bot Token</span>
                <span className="text-[10px] text-slate-400 font-normal">@BotFather orqali</span>
              </label>
              <input
                type="text"
                value={botToken}
                onChange={e => setBotToken(e.target.value)}
                placeholder="123456789:ABCDefGhIjKlMnOpQrStUvWxYz..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-850 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 font-mono"
              />
            </div>

            {/* Chat ID Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span>Dispetcherlik guruhi yoki Chat ID</span>
                <span className="text-[10px] text-slate-400 font-normal">Guruh ID yoki @kanal</span>
              </label>
              <input
                type="text"
                value={chatId}
                onChange={e => setChatId(e.target.value)}
                placeholder="-1001234567890 yoki 948197737"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-855 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 font-mono"
              />
            </div>

            {/* Trigger Checkboxes */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-1">
                Avtomatik yetkazish triggerlari:
              </span>

              {/* 1. Yangi vagon */}
              <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
                <div className="text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <ArrowDownToLine className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                    Yangi vagon kiritilganda
                  </span>
                  <span className="text-slate-400 text-[11px]">Ro‘yxatga olinganda darhol signal</span>
                </div>
                <input
                  type="checkbox"
                  checked={autoWagonAdded}
                  onChange={e => setAutoWagonAdded(e.target.checked)}
                  className="w-4 h-4 text-sky-600 rounded cursor-pointer"
                />
              </label>

              {/* 2. Yuklash */}
              <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
                <div className="text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <TrainFront className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    Estakadada yuklanganda
                  </span>
                  <span className="text-slate-400 text-[11px]">Mahsulot to‘ldirilganda xabar berish</span>
                </div>
                <input
                  type="checkbox"
                  checked={autoWagonLoading}
                  onChange={e => setAutoWagonLoading(e.target.checked)}
                  className="w-4 h-4 text-sky-600 rounded cursor-pointer"
                />
              </label>

              {/* 3. Chiqarish */}
              <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
                <div className="text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <ArrowUpFromLine className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    Kengsoyga jo‘natilganda
                  </span>
                  <span className="text-slate-400 text-[11px]">Zavoddan chiqarilganda bildirishnoma</span>
                </div>
                <input
                  type="checkbox"
                  checked={autoWagonExit}
                  onChange={e => setAutoWagonExit(e.target.checked)}
                  className="w-4 h-4 text-sky-600 rounded cursor-pointer"
                />
              </label>

              {/* 4. Prostoy xavfi */}
              <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
                <div className="text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                    Prostoy xavfi (&gt;20 soat)
                  </span>
                  <span className="text-slate-400 text-[11px]">Normativdan oshish xavfida ogohlantirish</span>
                </div>
                <input
                  type="checkbox"
                  checked={autoDemurrage}
                  onChange={e => setAutoDemurrage(e.target.checked)}
                  className="w-4 h-4 text-sky-600 rounded cursor-pointer"
                />
              </label>

              {/* 5. Yangi partiya */}
              <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
                <div className="text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    Yangi partiya kirganda
                  </span>
                  <span className="text-slate-400 text-[11px]">Poyezd kelganda signal berish</span>
                </div>
                <input
                  type="checkbox"
                  checked={autoParty}
                  onChange={e => setAutoParty(e.target.checked)}
                  className="w-4 h-4 text-sky-600 rounded cursor-pointer"
                />
              </label>

              {/* 6. Kunlik smena */}
              <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
                <div className="text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                    Kunlik smena xulosasi (20:00)
                  </span>
                  <span className="text-slate-400 text-[11px]">Sutkalik yakuniy hisobot</span>
                </div>
                <input
                  type="checkbox"
                  checked={autoDailySummary}
                  onChange={e => setAutoDailySummary(e.target.checked)}
                  className="w-4 h-4 text-sky-600 rounded cursor-pointer"
                />
              </label>
            </div>

            <div className="pt-3">
              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white font-semibold text-xs shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <Settings className="w-4 h-4" />
                <span>Sozlamalarni saqlash</span>
              </button>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                <Bot className="w-3.5 h-3.5 text-sky-500" />
                Rasmiy bot:
              </span>
              <a
                href="https://t.me/sgccetransport_bot"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-sky-600 dark:hover:text-sky-400 font-mono underline inline-flex items-center gap-1"
              >
                @sgccetransport_bot
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
