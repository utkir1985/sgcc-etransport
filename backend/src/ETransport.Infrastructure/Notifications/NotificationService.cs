using Microsoft.Extensions.Logging;

namespace ETransport.Infrastructure.Notifications;

public interface INotificationService
{
    Task SendAsync(string recipient, string subject, string message);
}

public class NotificationService(
    ITelegramNotificationService telegramService,
    ILogger<NotificationService> logger) : INotificationService
{
    public async Task SendAsync(string recipient, string subject, string message)
    {
        try
        {
            var text = $"📌 <b>{subject}</b>\n\n{message}";
            await telegramService.SendMessageAsync(text, recipient);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "NotificationService xabar yuborishda xatolik");
        }
    }
}
