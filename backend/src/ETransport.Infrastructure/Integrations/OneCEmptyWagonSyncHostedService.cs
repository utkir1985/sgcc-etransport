using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ETransport.Infrastructure.Integrations;

/// <summary>
/// 1C plombali ЖД tortishlarini davriy ravishda EmptyWagonUnit ga yozadi —
/// Scale / Security / Economist jarayonlari Admin sahifasisiz yangilanadi.
/// </summary>
public sealed class OneCEmptyWagonSyncHostedService(
    IServiceScopeFactory scopeFactory,
    ILogger<OneCEmptyWagonSyncHostedService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan InitialDelay = TimeSpan.FromSeconds(20);

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
                var sync = scope.ServiceProvider.GetRequiredService<IOneCEmptyWagonSyncService>();
                var result = await sync.SyncSealedRailwayAsync(cancellationToken: stoppingToken);
                if (result.Updated > 0)
                {
                    logger.LogInformation(
                        "1C sync: plombali {Sealed}, yangilangan {Updated}, topilmagan {Miss}",
                        result.SealedCandidates,
                        result.Updated,
                        result.SkippedNoMatch);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "1C fon sync xatosi");
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
