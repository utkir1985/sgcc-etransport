using System.Text;
using System.Text.Json;
using ETransport.Core.Entities;
using ETransport.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace ETransport.Infrastructure.Notifications;

public record TelegramStageEvent(
    string FlowTitle,            // e.g. "VAGONLARNI KIRITISH" yoki "YUKLASH VA CHIQARISH"
    string StageTitle,           // e.g. "2. Tasdiqlash va ijro uchun yo'naltirish"
    string DepartmentOrRole,     // e.g. "ICHDX smena boshlig'i"
    string OperatorName,         // e.g. "Aliyev V."
    string Identifier,           // e.g. "IB-1026-007" yoki "WB-1026-001"
    int WagonCount,              // e.g. 6
    IReadOnlyList<string>? WagonNumbers = null,
    string? ProductType = null,
    string? NextStage = null,
    string? NextDepartment = null,
    string? Details = null
);

public class TelegramSettingsDto
{
    public string BotToken { get; set; } = string.Empty;
    public string ChatId { get; set; } = string.Empty;
    public bool AutoWagonAdded { get; set; } = true;
    public bool AutoWagonLoading { get; set; } = true;
    public bool AutoWagonExit { get; set; } = true;
    public bool AutoDemurrage { get; set; } = true;
    public bool AutoParty { get; set; } = true;
    public bool AutoDailySummary { get; set; } = true;
    public bool Enabled { get; set; } = true;
}

public interface ITelegramNotificationService
{
    Task<bool> SendMessageAsync(string text, string? chatId = null, string? parseMode = "HTML");
    Task NotifyStageChangeAsync(TelegramStageEvent stageEvent);
    Task<TelegramSettingsDto> GetSettingsAsync(CancellationToken ct = default);
    Task SaveSettingsAsync(TelegramSettingsDto settings, CancellationToken ct = default);
    Task CheckDemurrageAlertsAsync(CancellationToken ct = default);
    Task SendDailySummaryAsync(CancellationToken ct = default);
}

public class TelegramOptions
{
    public const string SectionName = "Telegram";
    public string BotToken { get; set; } = "8984531185:AAE_Z0AzIs4IcDHbFtFug3WAUsf7QPYUbUk";
    public string ChatId { get; set; } = "948197737";
    public bool Enabled { get; set; } = true;
}

public class TelegramNotificationService(
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    IServiceScopeFactory scopeFactory,
    ILogger<TelegramNotificationService> logger) : ITelegramNotificationService
{
    private const string DefaultBotToken = "8984531185:AAE_Z0AzIs4IcDHbFtFug3WAUsf7QPYUbUk";
    private const string DefaultChatId = "948197737";

    public async Task<bool> SendMessageAsync(string text, string? targetChatId = null, string? parseMode = "HTML")
    {
        try
        {
            var settings = await GetSettingsAsync();
            if (!settings.Enabled)
            {
                logger.LogDebug("Telegram bildirishnomalari konfiguratsiyada o'chirilgan.");
                return false;
            }

            var activeChatId = !string.IsNullOrWhiteSpace(targetChatId) ? targetChatId : settings.ChatId;
            var botToken = settings.BotToken;

            if (string.IsNullOrWhiteSpace(botToken) || string.IsNullOrWhiteSpace(activeChatId))
            {
                logger.LogWarning("Telegram BotToken yoki ChatId sozlanmagan.");
                return false;
            }

            var client = httpClientFactory.CreateClient("Telegram");
            var url = $"https://api.telegram.org/bot{botToken}/sendMessage";

            var payload = new
            {
                chat_id = activeChatId,
                text,
                parse_mode = parseMode,
                disable_web_page_preview = true
            };

            var jsonContent = new StringContent(
                JsonSerializer.Serialize(payload),
                Encoding.UTF8,
                "application/json");

            var response = await client.PostAsync(url, jsonContent);
            if (response.IsSuccessStatusCode)
            {
                logger.LogInformation("Telegram xabarnomasi muvaffaqiyatli yuborildi: {ChatId}", activeChatId);
                return true;
            }

            var errBody = await response.Content.ReadAsStringAsync();
            logger.LogWarning("Telegram API xatosi {StatusCode}: {Error}", response.StatusCode, errBody);
            return false;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Telegramga xabar jo'natishda xatolik yuz berdi");
            return false;
        }
    }

    public async Task NotifyStageChangeAsync(TelegramStageEvent stageEvent)
    {
        try
        {
            var settings = await GetSettingsAsync();
            if (!settings.Enabled) return;

            // Trigger filtrlarini tekshirish
            if (stageEvent.FlowTitle.Contains("KIRITISH", StringComparison.OrdinalIgnoreCase))
            {
                // 1. Yangi partiya kirganda yoki 1-bosqich
                if (stageEvent.StageTitle.StartsWith("1", StringComparison.OrdinalIgnoreCase))
                {
                    if (!settings.AutoParty && !settings.AutoWagonAdded)
                    {
                        logger.LogDebug("Partiya/Vagon qo'shilishi bo'yicha bildirishnomalar o'chirilgan, o'tkazib yuborildi.");
                        return;
                    }
                }
                else
                {
                    // 2-6 bosqichlar: Vagon qo'shilishi / kiritilishi
                    if (!settings.AutoWagonAdded)
                    {
                        logger.LogDebug("Vagon kiritilishi triggeri o'chirilgan, o'tkazib yuborildi.");
                        return;
                    }
                }
            }
            else if (stageEvent.FlowTitle.Contains("YUKLASH VA CHIQARISH", StringComparison.OrdinalIgnoreCase))
            {
                // Vagon yuklash va tayyorlash bosqichlari (Estakada, Plomba, Tarozi, Zaxira)
                if (stageEvent.StageTitle.Contains("yuklash", StringComparison.OrdinalIgnoreCase) ||
                    stageEvent.StageTitle.Contains("Estakada", StringComparison.OrdinalIgnoreCase) ||
                    stageEvent.StageTitle.Contains("Plomba", StringComparison.OrdinalIgnoreCase) ||
                    stageEvent.StageTitle.Contains("Tarozi", StringComparison.OrdinalIgnoreCase) ||
                    stageEvent.StageTitle.Contains("zaxira", StringComparison.OrdinalIgnoreCase) ||
                    stageEvent.StageTitle.StartsWith("2", StringComparison.OrdinalIgnoreCase))
                {
                    if (!settings.AutoWagonLoading)
                    {
                        logger.LogDebug("Vagon yuklanishi/tayyorlanishi triggeri o'chirilgan, o'tkazib yuborildi.");
                        return;
                    }
                }
                // Vagon chiqarish bosqichi (Kengsoyga jo'natish)
                else if (stageEvent.StageTitle.Contains("Kengsoy", StringComparison.OrdinalIgnoreCase) ||
                         stageEvent.StageTitle.StartsWith("6", StringComparison.OrdinalIgnoreCase) ||
                         stageEvent.StageTitle.StartsWith("7", StringComparison.OrdinalIgnoreCase))
                {
                    if (!settings.AutoWagonExit)
                    {
                        logger.LogDebug("Vagon chiqarilishi triggeri o'chirilgan, o'tkazib yuborildi.");
                        return;
                    }
                }
            }

            var sb = new StringBuilder();
            sb.AppendLine($"🔔 <b>BOSQICH O'ZGARDI: {EscapeHtml(stageEvent.FlowTitle)}</b>");
            sb.AppendLine("━━━━━━━━━━━━━━━━━━━━");
            sb.AppendLine($"📦 <b>Partiya / Hujjat:</b> <code>{EscapeHtml(stageEvent.Identifier)}</code>");

            var wagonsText = $"{stageEvent.WagonCount} ta";
            if (stageEvent.WagonNumbers != null && stageEvent.WagonNumbers.Count > 0)
            {
                var cleanNums = stageEvent.WagonNumbers.Where(w => !string.IsNullOrWhiteSpace(w)).ToList();
                if (cleanNums.Count > 0)
                {
                    var sample = string.Join(", ", cleanNums.Take(6).Select(w => $"#{w.Trim()}"));
                    if (cleanNums.Count > 6) sample += $" va yana {cleanNums.Count - 6} ta";
                    wagonsText += $" ({sample})";
                }
            }
            sb.AppendLine($"🔢 <b>Vagonlar soni:</b> {wagonsText}");

            if (!string.IsNullOrWhiteSpace(stageEvent.ProductType))
            {
                sb.AppendLine($"📋 <b>Mahsulot:</b> {EscapeHtml(stageEvent.ProductType)}");
            }

            sb.AppendLine($"📍 <b>Yakunlangan bosqich:</b> {EscapeHtml(stageEvent.StageTitle)} ✅");
            sb.AppendLine($"👤 <b>Mas'ul:</b> {EscapeHtml(stageEvent.DepartmentOrRole)} (<i>{EscapeHtml(stageEvent.OperatorName)}</i>)");

            if (!string.IsNullOrWhiteSpace(stageEvent.NextStage))
            {
                var nextText = EscapeHtml(stageEvent.NextStage);
                if (!string.IsNullOrWhiteSpace(stageEvent.NextDepartment))
                {
                    nextText += $" ({EscapeHtml(stageEvent.NextDepartment)})";
                }
                sb.AppendLine($"➡️ <b>Keyingi bosqich:</b> {nextText} ⏳");
            }

            if (!string.IsNullOrWhiteSpace(stageEvent.Details))
            {
                sb.AppendLine($"💬 <b>Izoh:</b> {EscapeHtml(stageEvent.Details)}");
            }

            // Toshkent vaqti (UTC+5)
            var tashkentTime = DateTime.UtcNow.AddHours(5).ToString("dd.MM.yyyy HH:mm");
            sb.AppendLine($"🕒 <b>Vaqti:</b> {tashkentTime}");
            sb.AppendLine("━━━━━━━━━━━━━━━━━━━━");
            sb.AppendLine("🌐 <i>E-Transport:</i> <a href=\"https://etransport.sgcc.uz\">etransport.sgcc.uz</a>");

            await SendMessageAsync(sb.ToString());
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Bosqich o'zgarishi bo'yicha Telegram xabarnomasini tayyorlashda xatolik: {Identifier}", stageEvent.Identifier);
        }
    }

    public async Task<TelegramSettingsDto> GetSettingsAsync(CancellationToken ct = default)
    {
        var dto = new TelegramSettingsDto
        {
            BotToken = configuration["Telegram:BotToken"] ?? DefaultBotToken,
            ChatId = configuration["Telegram:ChatId"] ?? DefaultChatId,
            Enabled = true,
            AutoWagonAdded = true,
            AutoWagonLoading = true,
            AutoWagonExit = true,
            AutoDemurrage = true,
            AutoParty = true,
            AutoDailySummary = true
        };

        var enabledStr = configuration["Telegram:Enabled"];
        if (!string.IsNullOrEmpty(enabledStr) && bool.TryParse(enabledStr, out var e))
            dto.Enabled = e;

        try
        {
            using var scope = scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetService<AppDbContext>();
            if (db != null)
            {
                var rows = await db.SystemSettings
                    .AsNoTracking()
                    .Where(s => s.Key.StartsWith("tg_"))
                    .ToDictionaryAsync(s => s.Key, s => s.Value, ct);

                if (rows.TryGetValue("tg_bot_token", out var dbToken) && !string.IsNullOrWhiteSpace(dbToken) && !dbToken.Contains("sample"))
                    dto.BotToken = dbToken.Trim();

                if (rows.TryGetValue("tg_chat_id", out var dbChatId) && !string.IsNullOrWhiteSpace(dbChatId))
                    dto.ChatId = dbChatId.Trim();

                if (rows.TryGetValue("tg_enabled", out var vEnabled) && bool.TryParse(vEnabled, out var bEnabled))
                    dto.Enabled = bEnabled;

                if (rows.TryGetValue("tg_auto_wagon_added", out var vAdded) && bool.TryParse(vAdded, out var bAdded))
                    dto.AutoWagonAdded = bAdded;

                if (rows.TryGetValue("tg_auto_wagon_loading", out var vLoad) && bool.TryParse(vLoad, out var bLoad))
                    dto.AutoWagonLoading = bLoad;

                if (rows.TryGetValue("tg_auto_wagon_exit", out var vExit) && bool.TryParse(vExit, out var bExit))
                    dto.AutoWagonExit = bExit;

                if (rows.TryGetValue("tg_auto_demurrage", out var vDem) && bool.TryParse(vDem, out var bDem))
                    dto.AutoDemurrage = bDem;

                if (rows.TryGetValue("tg_auto_party", out var vParty) && bool.TryParse(vParty, out var bParty))
                    dto.AutoParty = bParty;

                if (rows.TryGetValue("tg_auto_daily_summary", out var vSum) && bool.TryParse(vSum, out var bSum))
                    dto.AutoDailySummary = bSum;
            }
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "SystemSettings jadvalidan Telegram sozlamalarini yuklashda xatolik");
        }

        return dto;
    }

    public async Task SaveSettingsAsync(TelegramSettingsDto settings, CancellationToken ct = default)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var map = new Dictionary<string, string>
        {
            ["tg_bot_token"] = settings.BotToken?.Trim() ?? string.Empty,
            ["tg_chat_id"] = settings.ChatId?.Trim() ?? string.Empty,
            ["tg_enabled"] = settings.Enabled.ToString().ToLowerInvariant(),
            ["tg_auto_wagon_added"] = settings.AutoWagonAdded.ToString().ToLowerInvariant(),
            ["tg_auto_wagon_loading"] = settings.AutoWagonLoading.ToString().ToLowerInvariant(),
            ["tg_auto_wagon_exit"] = settings.AutoWagonExit.ToString().ToLowerInvariant(),
            ["tg_auto_demurrage"] = settings.AutoDemurrage.ToString().ToLowerInvariant(),
            ["tg_auto_party"] = settings.AutoParty.ToString().ToLowerInvariant(),
            ["tg_auto_daily_summary"] = settings.AutoDailySummary.ToString().ToLowerInvariant()
        };

        var existing = await db.SystemSettings
            .Where(s => map.Keys.Contains(s.Key))
            .ToDictionaryAsync(s => s.Key, ct);

        foreach (var (k, v) in map)
        {
            if (existing.TryGetValue(k, out var entity))
            {
                entity.Value = v;
                entity.UpdatedAt = DateTime.UtcNow;
            }
            else
            {
                db.SystemSettings.Add(new SystemSetting
                {
                    Key = k,
                    Value = v,
                    UpdatedAt = DateTime.UtcNow
                });
            }
        }

        await db.SaveChangesAsync(ct);
        logger.LogInformation("Telegram sozlamalari SystemSettings jadvaliga saqlandi.");
    }

    public async Task CheckDemurrageAlertsAsync(CancellationToken ct = default)
    {
        try
        {
            var settings = await GetSettingsAsync(ct);
            if (!settings.Enabled || !settings.AutoDemurrage) return;

            using var scope = scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            // Faol (chiqib ketmagan, qaytarilmagan) vagonlarni aniqlash
            var activeArrivals = await db.EmptyWagonArrivals
                .Include(a => a.Units)
                .Where(a => !a.ArrivalNumber.StartsWith("1C-"))
                .OrderByDescending(a => a.CreatedAt)
                .ToListAsync(ct);

            var criticalWagons = new List<(string WagonNumber, string Ownership, double Hours, string StageLabel)>();
            var nowUtc = DateTime.UtcNow;

            foreach (var arrival in activeArrivals)
            {
                var arrivalTime = arrival.ArrivalDate != default ? arrival.ArrivalDate : arrival.CreatedAt;
                foreach (var unit in arrival.Units)
                {
                    // Returned yoki scaleExitedAt mavjud bo'lsa hisoblanmaydi
                    if (string.Equals(unit.Status, EmptyWagonUnitStatuses.Returned, StringComparison.OrdinalIgnoreCase))
                        continue;
                    if (unit.ScaleExitedAt.HasValue)
                        continue;

                    var hours = (nowUtc - arrivalTime).TotalHours;
                    if (hours >= 20.0)
                    {
                        var stageLabel = unit.Status switch
                        {
                            EmptyWagonUnitStatuses.AwaitingTare => "Tara kutilmoqda",
                            EmptyWagonUnitStatuses.Tared => "Tara olingan (Estakadaga navbat)",
                            EmptyWagonUnitStatuses.Estakada => "Estakadada (Yuklashga tayyor)",
                            EmptyWagonUnitStatuses.Loading => "Estakadada yuklanmoqda",
                            EmptyWagonUnitStatuses.Loaded => "Yuklangan (Taroziga navbat)",
                            EmptyWagonUnitStatuses.ToRailwayScale => "Taroziga navbatda",
                            EmptyWagonUnitStatuses.GrossWeighed => "Brutto tortilgan",
                            EmptyWagonUnitStatuses.SealPending => "Plombalash kutilmoqda",
                            EmptyWagonUnitStatuses.Sealed => "Chiqishga tayyor (Plombalangan)",
                            _ => "Hududda harakatda"
                        };

                        criticalWagons.Add((unit.WagonNumber, unit.Ownership ?? "Tashqi", Math.Round(hours, 1), stageLabel));
                    }
                }
            }

            if (criticalWagons.Count == 0) return;

            // Spaming oldini olish uchun oxirgi jo'natilgan vaqtni tekshirish
            var lastAlertRow = await db.SystemSettings.FirstOrDefaultAsync(s => s.Key == "tg_last_demurrage_alert_at", ct);
            var lastCountRow = await db.SystemSettings.FirstOrDefaultAsync(s => s.Key == "tg_last_demurrage_count", ct);

            if (lastAlertRow != null && DateTime.TryParse(lastAlertRow.Value, out var lastAlertTime))
            {
                var hoursSinceLast = (nowUtc - lastAlertTime).TotalHours;
                var lastCount = lastCountRow != null && int.TryParse(lastCountRow.Value, out var c) ? c : 0;

                // Agar 4 soatdan kam vaqt o'tgan bo'lsa va xavfdagi vagonlar soni ko'paymagan bo'lsa jo'natmaymiz
                if (hoursSinceLast < 4.0 && criticalWagons.Count <= lastCount)
                {
                    return;
                }
            }

            var sb = new StringBuilder();
            sb.AppendLine("🚨 <b>DIQQAT: PROSTOY VA O'TY JARIMA XAVFI!</b>");
            sb.AppendLine("━━━━━━━━━━━━━━━━━━━━");
            sb.AppendLine($"Hududda <b>{criticalWagons.Count} ta vagon</b> 20 soatdan ortiq qolib ketdi:\n");

            foreach (var w in criticalWagons.OrderByDescending(x => x.Hours).Take(8))
            {
                var remainHours = Math.Max(0.0, Math.Round(24.0 - w.Hours, 1));
                sb.AppendLine($"• Vagon <b>#{EscapeHtml(w.WagonNumber)}</b> ({EscapeHtml(w.Ownership)}) — <b>{w.Hours} soat</b>");
                sb.AppendLine($"  Bosqich: {EscapeHtml(w.StageLabel)}");
                if (remainHours > 0)
                {
                    sb.AppendLine($"  ⚠️ <i>O'TY normatividan oshishiga: {remainHours} soat qoldi!</i>");
                }
                else
                {
                    sb.AppendLine($"  🔴 <b>O'TY 24 soatlik me'yori oshib ketgan!</b>");
                }
                sb.AppendLine();
            }

            if (criticalWagons.Count > 8)
            {
                sb.AppendLine($"<i>...va yana {criticalWagons.Count - 8} ta vagon xavf zonasida.</i>\n");
            }

            sb.AppendLine("📌 <b>Dispetcherga ko'rsatma:</b> Ushbu vagonlarni FIFO ustuvorligida birinchi navbatda yuklab chiqarib yuborish talab qilinadi!");
            sb.AppendLine("━━━━━━━━━━━━━━━━━━━━");
            sb.AppendLine("🌐 <i>E-Transport Avtomat Nazorati</i>");

            var sent = await SendMessageAsync(sb.ToString());
            if (sent)
            {
                // Oxirgi ogohlantirish vaqtini saqlaymiz
                if (lastAlertRow != null)
                {
                    lastAlertRow.Value = nowUtc.ToString("o");
                    lastAlertRow.UpdatedAt = nowUtc;
                }
                else
                {
                    db.SystemSettings.Add(new SystemSetting { Key = "tg_last_demurrage_alert_at", Value = nowUtc.ToString("o"), UpdatedAt = nowUtc });
                }

                if (lastCountRow != null)
                {
                    lastCountRow.Value = criticalWagons.Count.ToString();
                    lastCountRow.UpdatedAt = nowUtc;
                }
                else
                {
                    db.SystemSettings.Add(new SystemSetting { Key = "tg_last_demurrage_count", Value = criticalWagons.Count.ToString(), UpdatedAt = nowUtc });
                }

                await db.SaveChangesAsync(ct);
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Prostoy xavfini tekshirish va ogohlantirishda xatolik");
        }
    }

    public async Task SendDailySummaryAsync(CancellationToken ct = default)
    {
        try
        {
            var settings = await GetSettingsAsync(ct);
            if (!settings.Enabled || !settings.AutoDailySummary) return;

            using var scope = scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            // Toshkent vaqti (UTC+5)
            var tashkentNow = DateTime.UtcNow.AddHours(5);
            var todayKey = tashkentNow.ToString("yyyy-MM-dd");

            // Bugun uchun allaqachon yuborilganligini tekshirish
            var lastSumRow = await db.SystemSettings.FirstOrDefaultAsync(s => s.Key == "tg_last_daily_summary_date", ct);
            if (lastSumRow != null && lastSumRow.Value == todayKey)
            {
                return; // Bugun uchun allaqachon yuborilgan
            }

            var startOfDayUtc = tashkentNow.Date.AddHours(-5); // Bugun Toshkent 00:00 ning UTC ekvivalenti

            // Bugun kirgan partiyalar va vagonlar
            var todayArrivals = await db.EmptyWagonArrivals
                .AsNoTracking()
                .Where(a => a.CreatedAt >= startOfDayUtc && !a.ArrivalNumber.StartsWith("1C-"))
                .ToListAsync(ct);

            var inBatches = todayArrivals.Count;
            var inWagons = todayArrivals.Sum(a => a.WagonCount);

            // Bugun yuklangan vagonlar
            var loadedUnits = await db.EmptyWagonUnits
                .AsNoTracking()
                .Where(u => u.LoadingCompletedAt >= startOfDayUtc)
                .ToListAsync(ct);
            var loadedCount = loadedUnits.Count;
            var loadedWeight = 0.0m;
            foreach (var u in loadedUnits)
            {
                if (decimal.TryParse(u.GrossWeight, out var g) && decimal.TryParse(u.TareWeight, out var t) && g > t)
                    loadedWeight += (g - t);
                else
                    loadedWeight += 65.0m;
            }

            // Bugun Kengsoyga chiqarilgan vagonlar
            var exitedUnits = await db.EmptyWagonUnits
                .AsNoTracking()
                .Where(u => u.ScaleExitedAt >= startOfDayUtc)
                .ToListAsync(ct);
            var exitedCount = exitedUnits.Count;
            var exitedWeight = 0.0m;
            foreach (var u in exitedUnits)
            {
                if (decimal.TryParse(u.GrossWeight, out var g))
                    exitedWeight += g;
                else
                    exitedWeight += 70.0m;
            }

            // Hududdagi jami faol vagonlar
            var activeUnits = await db.EmptyWagonUnits
                .Include(u => u.Arrival)
                .Where(u => u.ScaleExitedAt == null && u.Status != EmptyWagonUnitStatuses.Returned)
                .ToListAsync(ct);

            var totalActive = activeUnits.Count;
            var redCount = 0;
            var yellowCount = 0;
            var nowUtc = DateTime.UtcNow;

            foreach (var u in activeUnits)
            {
                var arrTime = u.Arrival?.ArrivalDate != default ? u.Arrival!.ArrivalDate : (u.Arrival?.CreatedAt ?? nowUtc);
                var hours = (nowUtc - arrTime).TotalHours;
                if (hours >= 20.0) redCount++;
                else if (hours >= 16.0) yellowCount++;
            }

            var sb = new StringBuilder();
            sb.AppendLine("📋 <b>KUNLIK SMENA XULOSASI (Soat 20:00)</b>");
            sb.AppendLine("━━━━━━━━━━━━━━━━━━━━");
            sb.AppendLine($"📅 Sana: <b>{tashkentNow:dd.MM.yyyy}</b> (Toshkent vaqti)\n");
            sb.AppendLine($"📥 <b>Kirgan bo'sh vagonlar:</b> {inWagons} ta ({inBatches} ta partiya)");
            sb.AppendLine($"⚖️ <b>Yuklangan vagonlar:</b> {loadedCount} ta ({Math.Round(loadedWeight, 1)} tonna)");
            sb.AppendLine($"📤 <b>Kengsoyga jo'natilgan:</b> {exitedCount} ta ({Math.Round(exitedWeight, 1)} tonna)");
            sb.AppendLine($"⏱️ <b>Hududdagi jami faol:</b> {totalActive} ta vagon");
            sb.AppendLine($"🔴 <b>Qizil xavf zonasida (&gt;20s):</b> {redCount} ta vagon");
            sb.AppendLine($"🟡 <b>Sariq xavf zonasida (16-20s):</b> {yellowCount} ta vagon");
            sb.AppendLine("━━━━━━━━━━━━━━━━━━━━");
            sb.AppendLine("🌐 <i>Boshqaruv paneli: E-Transport Tahlil Markazi</i>");

            var sent = await SendMessageAsync(sb.ToString());
            if (sent)
            {
                if (lastSumRow != null)
                {
                    lastSumRow.Value = todayKey;
                    lastSumRow.UpdatedAt = DateTime.UtcNow;
                }
                else
                {
                    db.SystemSettings.Add(new SystemSetting
                    {
                        Key = "tg_last_daily_summary_date",
                        Value = todayKey,
                        UpdatedAt = DateTime.UtcNow
                    });
                }
                await db.SaveChangesAsync(ct);
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Kunlik smena xulosasini yuborishda xatolik");
        }
    }

    private static string EscapeHtml(string text)
    {
        if (string.IsNullOrEmpty(text)) return string.Empty;
        return text.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;");
    }
}
