using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Nexora.BuildingBlocks.Infrastructure;

// Trims expired snapshots on a slow cadence; each service owns its own retention sweep.
public sealed class RecordChangeRetentionService<TContext>(
    IServiceScopeFactory scopeFactory,
    IOptions<RecordChangeOptions> options,
    ILogger<RecordChangeRetentionService<TContext>> logger) : BackgroundService
    where TContext : DbContext
{
    private static readonly TimeSpan FirstDelay = TimeSpan.FromMinutes(1);
    private static readonly TimeSpan Interval = TimeSpan.FromHours(6);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var delay = FirstDelay;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(delay, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                return;
            }

            try
            {
                await SweepAsync(stoppingToken);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                logger.LogWarning(exception, "Record change retention sweep failed.");
            }

            delay = Interval;
        }
    }

    private async Task SweepAsync(CancellationToken cancellationToken)
    {
        var retentionDays = Math.Max(1, options.Value.RetentionDays);
        var cutoff = DateTimeOffset.UtcNow.AddDays(-retentionDays);
        await using var scope = scopeFactory.CreateAsyncScope();
        var context = scope.ServiceProvider.GetRequiredService<TContext>();
        var removed = await context.Set<RecordChange>()
            .Where(change => change.OccurredAtUtc < cutoff)
            .ExecuteDeleteAsync(cancellationToken);
        if (removed > 0)
            logger.LogInformation("Removed {Count} record changes older than {Cutoff}.", removed, cutoff);
    }
}
