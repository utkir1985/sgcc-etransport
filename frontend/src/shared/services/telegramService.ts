export interface TelegramConfig {
  botToken: string;
  chatId: string;
  autoWagonAdded: boolean;
  autoWagonLoading: boolean;
  autoWagonExit: boolean;
  autoDemurrage: boolean;
  autoParty: boolean;
  autoDailySummary: boolean;
}

export const DEFAULT_TG_CONFIG: TelegramConfig = {
  botToken: "8984531185:AAE_Z0AzIs4IcDHbFtFug3WAUsf7QPYUbUk",
  chatId: "948197737",
  autoWagonAdded: true,
  autoWagonLoading: true,
  autoWagonExit: true,
  autoDemurrage: true,
  autoParty: true,
  autoDailySummary: true,
};

export function getTelegramConfig(): TelegramConfig {
  try {
    const savedToken = localStorage.getItem("tg_bot_token");
    const savedChatId = localStorage.getItem("tg_chat_id");
    const autoWagonAdded = localStorage.getItem("tg_auto_wagon_added");
    const autoWagonLoading = localStorage.getItem("tg_auto_wagon_loading");
    const autoWagonExit = localStorage.getItem("tg_auto_wagon_exit");
    const autoDemurrage = localStorage.getItem("tg_auto_demurrage");
    const autoParty = localStorage.getItem("tg_auto_party");
    const autoDailySummary = localStorage.getItem("tg_auto_daily_summary");

    return {
      botToken: (savedToken && !savedToken.includes("sample")) ? savedToken : DEFAULT_TG_CONFIG.botToken,
      chatId: (savedChatId && !savedChatId.includes("-1002491823901")) ? savedChatId : DEFAULT_TG_CONFIG.chatId,
      autoWagonAdded: autoWagonAdded !== null ? autoWagonAdded === "true" : DEFAULT_TG_CONFIG.autoWagonAdded,
      autoWagonLoading: autoWagonLoading !== null ? autoWagonLoading === "true" : DEFAULT_TG_CONFIG.autoWagonLoading,
      autoWagonExit: autoWagonExit !== null ? autoWagonExit === "true" : DEFAULT_TG_CONFIG.autoWagonExit,
      autoDemurrage: autoDemurrage !== null ? autoDemurrage === "true" : DEFAULT_TG_CONFIG.autoDemurrage,
      autoParty: autoParty !== null ? autoParty === "true" : DEFAULT_TG_CONFIG.autoParty,
      autoDailySummary: autoDailySummary !== null ? autoDailySummary === "true" : DEFAULT_TG_CONFIG.autoDailySummary,
    };
  } catch {
    return { ...DEFAULT_TG_CONFIG };
  }
}

export function saveTelegramConfig(config: Partial<TelegramConfig>): void {
  try {
    if (config.botToken !== undefined) localStorage.setItem("tg_bot_token", config.botToken.trim());
    if (config.chatId !== undefined) localStorage.setItem("tg_chat_id", config.chatId.trim());
    if (config.autoWagonAdded !== undefined) localStorage.setItem("tg_auto_wagon_added", String(config.autoWagonAdded));
    if (config.autoWagonLoading !== undefined) localStorage.setItem("tg_auto_wagon_loading", String(config.autoWagonLoading));
    if (config.autoWagonExit !== undefined) localStorage.setItem("tg_auto_wagon_exit", String(config.autoWagonExit));
    if (config.autoDemurrage !== undefined) localStorage.setItem("tg_auto_demurrage", String(config.autoDemurrage));
    if (config.autoParty !== undefined) localStorage.setItem("tg_auto_party", String(config.autoParty));
    if (config.autoDailySummary !== undefined) localStorage.setItem("tg_auto_daily_summary", String(config.autoDailySummary));
  } catch (e) {
    console.error("Failed to save telegram config", e);
  }
}

function getFormattedNow(): string {
  return new Intl.DateTimeFormat("uz-UZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tashkent",
  }).format(new Date());
}

export async function sendTelegramMessage(
  text: string,
  customConfig?: Partial<TelegramConfig>
): Promise<{ ok: boolean; description?: string }> {
  const cfg = { ...getTelegramConfig(), ...customConfig };
  if (!cfg.botToken || !cfg.chatId) {
    return { ok: false, description: "Bot tokeni yoki Chat ID sozlanmagan" };
  }

  try {
    const url = "https://api.telegram.org/bot" + encodeURIComponent(cfg.botToken) + "/sendMessage";
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: cfg.chatId,
        text,
      }),
    });
    const data = await res.json();
    return {
      ok: Boolean(data.ok),
      description: data.description || (data.ok ? undefined : "Xatolik yuz berdi"),
    };
  } catch (err: any) {
    console.error("Telegram notification error:", err);
    return { ok: false, description: err?.message || "Tarmoq xatosi" };
  }
}

/** 1. Yangi vagon qo'shilganda yoki paydo bo'lganda ogohlantirish */
export async function notifyWagonAdded(payload: {
  wagonNumbers: string[] | string;
  count?: number;
  partyNumber?: string;
  productType?: string;
  trackNumber?: string;
  note?: string;
}): Promise<void> {
  const cfg = getTelegramConfig();
  if (!cfg.autoWagonAdded) return;

  const rawNums = Array.isArray(payload.wagonNumbers)
    ? payload.wagonNumbers
    : String(payload.wagonNumbers || "").split(/[,\s]+/).filter(Boolean);
  const count = payload.count || rawNums.length || 1;
  const numList = rawNums.length > 0
    ? rawNums.slice(0, 10).map(n => "#" + n).join(", ") + (rawNums.length > 10 ? " va yana " + (rawNums.length - 10) + " ta" : "")
    : "—";
  const party = payload.partyNumber ? `Partiya: ${payload.partyNumber}` : "Yangi kiritilgan vagonlar";
  const time = getFormattedNow();

  const lines = [
    "🆕 YANGI VAGON RO'YXATGA OLINDI / QO'SHILDI",
    "━━━━━━━━━━━━━━━━━━━━",
    `🔢 Vagonlar soni: ${count} ta`,
    `🛤️ Raqamlari: ${numList}`,
    `📦 ${party}`,
    payload.productType ? `📋 Mahsulot turi: ${payload.productType}` : null,
    payload.trackNumber ? `🛤️ Kelgan yo'l: ${payload.trackNumber}` : null,
    payload.note ? `💬 Izoh: ${payload.note}` : null,
    `🕒 Vaqti: ${time}`,
    "📍 Holati: Zavod hududiga kiritish va ko'rikka tayyorlandi",
    "━━━━━━━━━━━━━━━━━━━━",
    "E-Transport Avtomat Nazorati",
  ].filter(Boolean);

  void sendTelegramMessage(lines.join("\n"));
}

/** 2. Vagon yuklanganda ogohlantirish */
export async function notifyWagonsLoaded(payload: {
  wagonNumbers: string[] | string;
  count?: number;
  productType?: string;
  tareWeight?: string | number;
  grossWeight?: string | number;
  netWeight?: string | number;
  estakada?: string;
}): Promise<void> {
  const cfg = getTelegramConfig();
  if (!cfg.autoWagonLoading) return;

  const rawNums = Array.isArray(payload.wagonNumbers)
    ? payload.wagonNumbers
    : String(payload.wagonNumbers || "").split(/[,\s]+/).filter(Boolean);
  const count = payload.count || rawNums.length || 1;
  const numList = rawNums.length > 0
    ? rawNums.slice(0, 10).map(n => "#" + n).join(", ") + (rawNums.length > 10 ? " va yana " + (rawNums.length - 10) + " ta" : "")
    : "—";
  const time = getFormattedNow();

  const lines = [
    "⚡ VAGON YUKLANDI",
    "━━━━━━━━━━━━━━━━━━━━",
    `🔢 Yuklangan vagonlar: ${count} ta`,
    `🛤️ Vagon raqamlari: ${numList}`,
    payload.productType ? `📦 Mahsulot: ${payload.productType}` : null,
    payload.estakada ? `🏭 Estakada: ${payload.estakada}` : null,
    payload.grossWeight ? `⚖️ Brutto: ${payload.grossWeight} tn` : null,
    payload.netWeight ? `⚖️ Netto: ${payload.netWeight} tn` : null,
    `🕒 Vaqti: ${time}`,
    "📍 Holati: Estakadada yuklash yakunlandi. Brutto tarozi va plomba o'rnatishga o'tkazildi",
    "━━━━━━━━━━━━━━━━━━━━",
    "E-Transport Avtomat Nazorati",
  ].filter(Boolean);

  void sendTelegramMessage(lines.join("\n"));
}

/** 3. Vagon chiqarilganda (Kengsoyga jo'natilganda) ogohlantirish */
export async function notifyWagonsExited(payload: {
  registryNumber?: string;
  wagonNumbers: string[] | string;
  count?: number;
  destination?: string;
  totalWeight?: string | number;
  productType?: string;
}): Promise<void> {
  const cfg = getTelegramConfig();
  if (!cfg.autoWagonExit) return;

  const rawNums = Array.isArray(payload.wagonNumbers)
    ? payload.wagonNumbers
    : String(payload.wagonNumbers || "").split(/[,\s]+/).filter(Boolean);
  const count = payload.count || rawNums.length || 1;
  const numList = rawNums.length > 0
    ? rawNums.slice(0, 10).map(n => "#" + n).join(", ") + (rawNums.length > 10 ? " va yana " + (rawNums.length - 10) + " ta" : "")
    : "—";
  const time = getFormattedNow();

  const lines = [
    "🚂 VAGON CHIQARILDI (KENGSOYGA JO'NATILDI)",
    "━━━━━━━━━━━━━━━━━━━━",
    payload.registryNumber ? `📋 Yuk xati / Reyestr: ${payload.registryNumber}` : "📋 Reyestr: Rasmiylashtirildi",
    `🔢 Chiqarilgan vagonlar: ${count} ta`,
    `🛤️ Vagon raqamlari: ${numList}`,
    payload.productType ? `📦 Mahsulot: ${payload.productType}` : null,
    `🏁 Yo'nalish: ${payload.destination || "Kengsoy stansiyasi (O'TY)"}`,
    payload.totalWeight ? `⚖️ Umumiy og'irlik: ${payload.totalWeight} tn` : null,
    `🕒 Chiqarilgan vaqti: ${time}`,
    "📍 Holati: Barcha nazorat bosqichlari (plomba, qo'riqlash) yakunlanib Kengsoyga chiqarildi",
    "━━━━━━━━━━━━━━━━━━━━",
    "E-Transport Avtomat Nazorati",
  ].filter(Boolean);

  void sendTelegramMessage(lines.join("\n"));
}

/** 4. Yangi partiya kelganda */
export async function notifyPartyArrival(payload: {
  partyNumber: string;
  count: number;
  productType?: string;
  trackNumber?: string;
  wagonNumbers?: string[];
}): Promise<void> {
  const cfg = getTelegramConfig();
  if (!cfg.autoParty) return;

  const time = getFormattedNow();
  const numList = payload.wagonNumbers && payload.wagonNumbers.length > 0
    ? "\n🛤️ Vagonlar: " + payload.wagonNumbers.slice(0, 8).map(n => "#" + n).join(", ")
    : "";

  const lines = [
    "📦 YANGI VAGONLAR PARTIYASI KELDI",
    "━━━━━━━━━━━━━━━━━━━━",
    `Partiya: ${payload.partyNumber}`,
    `Vagonlar soni: ${payload.count} ta vagon${numList}`,
    payload.productType ? `�� Mahsulot turi: ${payload.productType}` : null,
    payload.trackNumber ? `🛤️ Temir yo'l yo'lagi: ${payload.trackNumber}` : "🛤️ Temir yo'l yo'lagi: 4-yo'l (Kengsoy stansiyasidan)",
    `🕒 Kelgan vaqti: ${time}`,
    "📍 Dispetcher holati: Tara tortishga navbatga qo'yildi.",
    "━━━━━━━━━━━━━━━━━━━━",
    "E-Transport Logistics System",
  ].filter(Boolean);

  void sendTelegramMessage(lines.join("\n"));
}

/** 5. Prostoy xavfi (>20 soat) */
export async function notifyDemurrageAlert(payload: {
  redCount: number;
  criticalWagons?: Array<{ number: string; hours: number | string; stage: string }>;
}): Promise<void> {
  const cfg = getTelegramConfig();
  if (!cfg.autoDemurrage) return;

  const wagonLines = (payload.criticalWagons && payload.criticalWagons.length > 0)
    ? payload.criticalWagons.map(w => `• Vagon #${w.number} — ${w.hours} soat\n  Bosqich: ${w.stage}`).join("\n\n")
    : "• Bir nechta vagon me'yoriy 20 soatlik muddatga yaqinlashdi";

  const lines = [
    "🚨 DIQQAT: PROSTOY VA O'TY JARIMA XAVFI!",
    "━━━━━━━━━━━━━━━━━━━━",
    `Hududda ${payload.redCount} ta vagon 20 soatdan ortiq qolib ketdi:\n`,
    wagonLines,
    "\n📌 Dispetcherga ko'rsatma: Ushbu vagonlarni FIFO ustuvorligida birinchi navbatda yuklab chiqarib yuborish talab qilinadi!",
    "━━━━━━━━━━━━━━━━━━━━",
    "E-Transport Avtomat Nazorati",
  ];

  void sendTelegramMessage(lines.join("\n"));
}
