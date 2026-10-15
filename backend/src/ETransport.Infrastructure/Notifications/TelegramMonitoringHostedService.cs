using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ETransport.Infrastructure.Notifications;

public class TelegramMonitoringHostedService(
    IServiceScopeFactory scopeFactory,
    ILogger<TelegramMonitoringHostedService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Telegram monitoring xizmati ishga tushdi (Prostoy >20s va Kunlik smena 20:00).");

        // Dastur ishga tushganda 30 soniyadan so'ng birinchi tekshiruv
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
        }
        catch (OperationCanceledException)
        {
            return;
        }

        var lastDemurrageCheck = DateTime.MinValue;

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var notificationService = scope.ServiceProvider.GetRequiredService<ITelegramNotificationService>();

                var nowUtc = DateTime.UtcNow;
                var tashkentNow = nowUtc.AddHours(5);

                // 1. Prostoy xavfini tekshirish (har 20 daqiqada bir marta)
                if (nowUtc - lastDemurrageCheck >= TimeSpan.FromMinutes(20))
                {
                    await notificationService.CheckDemurrageAlertsAsync(stoppingToken);
                    lastDemurrageCheck = nowUtc;
                }

                // 2. Kunlik smena xulosasi (Toshkent vaqti bilan 20:00 - 20:15 oralig'ida)
                if (tashkentNow.Hour == 20 && tashkentNow.Minute <= 15)
                {
                    await notificationService.SendDailySummaryAsync(stoppingToken);
                }

                // 3. Haftalik xulosa (dushanba, Toshkent vaqti bilan 08:00 - 08:15)
                if (tashkentNow.DayOfWeek == DayOfWeek.Monday && tashkentNow.Hour == 8 && tashkentNow.Minute <= 15)
                {
                    await notificationService.SendWeeklySummaryAsync(stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Telegram monitoring siklida xatolik yuz berdi");
            }

            // Har 60 soniyada bir uyg'onish
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(60), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }

        logger.LogInformation("Telegram monitoring xizmati to'xtatildi.");
    }
}
