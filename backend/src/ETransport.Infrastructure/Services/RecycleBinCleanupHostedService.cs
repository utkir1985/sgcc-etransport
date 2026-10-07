using ETransport.Infrastructure.Data;
using ETransport.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ETransport.Infrastructure.Services;

/// <summary>
/// Korzinada saqlanish muddati (30 kun) tugagan elementlarni davriy tozalovchi xizmat.
/// Har 6 soatda bir marta tekshiradi.
/// </summary>
public sealed class RecycleBinCleanupHostedService(
    IServiceScopeFactory scopeFactory,
    ILogger<RecycleBinCleanupHostedService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(6);
    private static readonly TimeSpan InitialDelay = TimeSpan.FromMinutes(2);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await Task.Delay(InitialDelay, stoppingToken);
        }
        catch (OperationCanceledException)
        {
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var fileStorage = scope.ServiceProvider.GetRequiredService<IFileStorageService>();

                var now = DateTime.UtcNow;
                var expired = await db.RecycleBinItems
                    .Where(r => r.ExpiresAt <= now)
                    .ToListAsync(stoppingToken);

                if (expired.Count > 0)
                {
                    logger.LogInformation("Korzina tozalash boshlandi: {Count} ta muddati o'tgan element", expired.Count);
                    foreach (var item in expired)
                    {
                        if (!string.IsNullOrWhiteSpace(item.ObjectKey))
                        {
                            try
                            {
                                await fileStorage.DeleteAsync(item.ObjectKey);
                            }
                            catch (Exception ex)
                            {
                                logger.LogWarning(ex, "Faylni o'chirishda xatolik: {Key}", item.ObjectKey);
                            }
                        }
                        db.RecycleBinItems.Remove(item);
                    }
                    await db.SaveChangesAsync(stoppingToken);
                    logger.LogInformation("Korzina tozalash yakunlandi: {Count} ta element to'liq o'chirildi", expired.Count);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Korzina tozalash fon xizmatida xatolik");
            }

            try
            {
                await Task.Delay(Interval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }
}
