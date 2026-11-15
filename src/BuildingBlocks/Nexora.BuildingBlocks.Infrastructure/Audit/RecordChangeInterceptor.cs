using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Nexora.BuildingBlocks.Infrastructure;

// Saves record-change rows together with the tracked business changes.
public sealed class RecordChangeInterceptor(string service) : SaveChangesInterceptor
{
    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        Capture(eventData.Context);
        return base.SavingChanges(eventData, result);
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData,
        InterceptionResult<int> result, CancellationToken cancellationToken = default)
    {
        Capture(eventData.Context);
        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    private void Capture(DbContext? context)
    {
        if (context is null) return;
        var changes = RecordChangeCapture.Capture(context, service, RecordChangeContext.Actor, DateTimeOffset.UtcNow);
        if (changes.Count == 0) return;
        context.Set<RecordChange>().AddRange(changes);
    }
}
