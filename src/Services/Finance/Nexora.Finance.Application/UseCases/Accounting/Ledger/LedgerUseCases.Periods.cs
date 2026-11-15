using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed partial class LedgerUseCases
{
    public async Task<PeriodDetail> PeriodAsync(Guid workspaceId, DateOnly month, CancellationToken ct)
    {
        var (current, _) = await ReadBookAsync(workspaceId, ct);
        current.DemandOn(LedgerPermissions.Read, month);
        var period = await store.PeriodAsync(current.Scope, month, ct) ?? throw new ResourceNotFoundException();
        return new(View(period), await store.CheckAsync(current.Scope, month, ct), await store.TransitionsAsync(current.Scope, month, ct));
    }

    public async Task<PeriodChange> MoveAsync(MoveFiscalPeriod command, CancellationToken ct)
    {
        var (current, book) = await BeginAsync(command.WorkspaceId, LedgerPermissions.Period, ct);
        var action = $"period.{command.Action}";
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return new(command.Month, replay.ResultVersion);
        var reason = Reason(command.Reason);
        var period = await store.PeriodAsync(current.Scope, command.Month, ct);
        DemandVersion(period?.Version ?? 0, command.ExpectedVersion);
        switch (command.Action)
        {
            case "open" when period is null:
                period = new(book, command.Month);
                store.Add(period);
                break;
            case "begin-close" when period is not null:
                period.BeginClosing((await store.CheckAsync(current.Scope, period.Month, ct)).Watermark);
                break;
            case "close" when period is not null:
                var check = await store.CheckAsync(current.Scope, period.Month, ct);
                if (check.Debit != check.Credit) throw new LedgerRuleException("Period debits and credits do not reconcile.");
                period.Close(check.Watermark, check.PendingCount != 0);
                break;
            case "reopen" when period is not null:
                if (await years.IsClosedAsync(current.Scope, period.Month, ct))
                    throw new LedgerRuleException("Reopen the fiscal year before reopening this period.");
                period.Reopen();
                break;
            default:
                throw new LedgerRuleException("Invalid period transition.");
        }
        var transition = new PeriodTransition(Guid.CreateVersion7(), book.TenantId, book.WorkspaceId, period.Month,
            period.Version, period.State, period.ClosingWatermark, reason, current.Actor.Issuer, current.Actor.Subject, clock.GetUtcNow());
        store.Add(transition);
        mutations.Record(current, command.OperationId, action, command, transition.Id, period.Version);
        return new(period.Month, period.Version);
    }
}
