using ETransport.Core.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ETransport.Infrastructure.Notifications.Controllers;

[ApiController]
[Route("api/notifications/telegram-settings")]
[Authorize]
public class TelegramSettingsController(ITelegramNotificationService telegramService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<TelegramSettingsDto>>> GetSettings(CancellationToken ct)
    {
        var settings = await telegramService.GetSettingsAsync(ct);
        return Ok(new ApiResponse<TelegramSettingsDto>(true, settings));
    }

    [HttpPost]
    public async Task<ActionResult<ApiResponse<TelegramSettingsDto>>> SaveSettings(
        [FromBody] TelegramSettingsDto settings,
        CancellationToken ct)
    {
        await telegramService.SaveSettingsAsync(settings, ct);
        var updated = await telegramService.GetSettingsAsync(ct);
        return Ok(new ApiResponse<TelegramSettingsDto>(true, updated, "Telegram sozlamalari muvaffaqiyatli saqlandi"));
    }

    [HttpPost("test")]
    public async Task<ActionResult<ApiResponse<bool>>> SendTest(
        [FromBody] TelegramSettingsDto? customSettings,
        CancellationToken ct)
    {
        var targetChat = !string.IsNullOrWhiteSpace(customSettings?.ChatId) ? customSettings.ChatId : null;
        var nowStr = DateTime.UtcNow.AddHours(5).ToString("dd.MM.yyyy HH:mm:ss");
        var text = $"🤖 <b>E-Transport Telegram Tizimi Testi</b>\n━━━━━━━━━━━━━━━━━━━━\n✅ Bot aloqasi muvaffaqiyatli o'rnatildi!\n🕒 Vaqti: {nowStr} (Toshkent)\n━━━━━━━━━━━━━━━━━━━━\n<i>E-Transport Avtomat Nazorati</i>";

        var ok = await telegramService.SendMessageAsync(text, targetChat);
        if (ok)
        {
            return Ok(new ApiResponse<bool>(true, true, "Test xabari muvaffaqiyatli yuborildi"));
        }
        return BadRequest(new ApiResponse<bool>(false, false, "Test xabarini yuborib bo'lmadi. Bot token yoki Chat ID ni tekshiring"));
    }

    [HttpPost("trigger-daily-summary")]
    public async Task<ActionResult<ApiResponse<bool>>> TriggerDailySummary(CancellationToken ct)
    {
        await telegramService.SendDailySummaryAsync(ct, force: true);
        return Ok(new ApiResponse<bool>(true, true, "Kunlik xulosa Telegramga jo'natildi"));
    }

    [HttpPost("trigger-weekly-summary")]
    public async Task<ActionResult<ApiResponse<bool>>> TriggerWeeklySummary(CancellationToken ct)
    {
        await telegramService.SendWeeklySummaryAsync(ct, force: true);
        return Ok(new ApiResponse<bool>(true, true, "Haftalik xulosa Telegramga jo'natildi"));
    }

    [HttpPost("trigger-demurrage")]
    public async Task<ActionResult<ApiResponse<bool>>> TriggerDemurrage(CancellationToken ct)
    {
        await telegramService.CheckDemurrageAlertsAsync(ct);
        return Ok(new ApiResponse<bool>(true, true, "Prostoy xavfi bo'yicha tahlil o'tkazildi"));
    }
}
