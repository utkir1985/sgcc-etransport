using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
namespace ETransport.Infrastructure.Integrations;

public sealed class QrFinalizationWorker(IServiceScopeFactory scopes, IOptions<QrLinkOptions> options,
    ILogger<QrFinalizationWorker> logger) : BackgroundService
{
    private static readonly SemaphoreSlim Wake = new(0, 1);
    public static void Signal() { try { Wake.Release(); } catch (SemaphoreFullException) { } }
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Reconcile existing documents on startup, then on approval or every minute after a failure.
        await Task.Yield();
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (options.Value.Enabled)
                {
                    using var scope = scopes.CreateScope();
                    var result = await scope.ServiceProvider.GetRequiredService<QrFinalizationService>().SyncAsync(stoppingToken);
                    if (result.Uploaded > 0 || result.Failed > 0)
                        logger.LogInformation("Final QR sync: {Uploaded} uploaded, {Unchanged} unchanged, {Failed} pending",
                            result.Uploaded, result.Unchanged, result.Failed);
                }
                await Wake.WaitAsync(TimeSpan.FromMinutes(1), stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                logger.LogError(ex, "Final QR reconciliation failed; will retry");
                await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
            }
        }
    }
}
