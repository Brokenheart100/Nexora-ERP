using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed partial class OpeningSubledgers(IBookAccess authority, TradeAccess access, IBookStore books, IChartStore chart,
    ILedgerStore ledger, ITradeStore trade, IReceivableStore receivables, IOpeningSubledgerStore batches,
    IOpeningReferences references, FinanceMutation mutations, TradePosting posting, BankCutoff cutoff, TimeProvider clock)
{
    public async Task<OpeningSubledgerView?> LatestAsync(Guid workspaceId, CancellationToken ct)
    {
        var (current, _) = await access.ReadAsync(workspaceId, ct);
        var batch = await batches.LatestAsync(current.Scope, ct);
        return batch is null ? null : await ViewAsync(current, batch, ct);
    }

    public async Task<OpeningSubledgerView> DetailAsync(Guid workspaceId, Guid id, CancellationToken ct)
    {
        var (current, _) = await access.ReadAsync(workspaceId, ct);
        return await ViewAsync(current, await FindAsync(current.Scope, id, ct), ct);
    }

    public async Task<OpeningSubledgerPreview> PreviewAsync(Guid workspaceId, Guid equityAccountId, string file, CancellationToken ct)
    {
        var current = await authority.DemandAsync(workspaceId, false, ct);
        var book = await books.FindAsync(current.Scope, ct) ?? throw new ResourceNotFoundException();
        current.DemandOn(LedgerPermissions.Draft, book.StartsOn);
        return await ReadFileAsync(current.Scope, book, equityAccountId, file, ct);
    }

    public async Task<OpeningSubledgerView> SubmitAsync(SubmitOpeningSubledger command, CancellationToken ct)
    {
        const string action = "opening-subledger.submitted";
        var current = await authority.DemandAsync(command.WorkspaceId, false, ct);
        var book = await LockAsync(current.Scope, ct);
        current.DemandOn(LedgerPermissions.Draft, book.StartsOn);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return View(await FindAsync(current.Scope, replay.TargetId!.Value, ct), current);
        if (book.ChartRevision != command.ChartRevision)
            throw new RevisionConflictException("The chart changed. Preview the subledger file again.");
        if (await batches.HasActiveAsync(current.Scope, ct))
            throw new BusinessConflictException("An active opening subledger batch already exists.");
        await DemandCutoverAsync(current.Scope, book, ct);
        var preview = await ReadFileAsync(current.Scope, book, command.EquityAccountId, command.File, ct);
        if (preview.Errors.Length > 0 || preview.FileHash != command.FileHash)
            throw new ArgumentException("Preview and submit the valid opening subledger file.");
        var batch = new OpeningSubledgerBatch(book, command.EquityAccountId, Actor(current), preview.FileHash, preview.Rows, clock.GetUtcNow());
        batches.Add(batch);
        mutations.Record(current, command.OperationId, action, command, batch.Id, batch.Version);
        return View(batch, current);
    }

    public async Task<(OpeningSubledgerView, OpeningStockPlan?)> DecideAsync(DecideOpeningSubledger command, CancellationToken ct)
    {
        var permission = command.Decision switch
        {
            "approve" => LedgerPermissions.Post,
            "cancel" => LedgerPermissions.Draft,
            _ => throw new ArgumentException("Unknown opening subledger decision.")
        };
        var current = await authority.DemandAsync(command.WorkspaceId, false, ct);
        var book = await LockAsync(current.Scope, ct);
        current.DemandOn(permission, book.StartsOn);
        var batch = await FindAsync(current.Scope, command.Id, ct);
        var action = "opening-subledger." + command.Decision;
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return (View(batch, current), null);
        if (batch.Version != command.ExpectedVersion)
            throw new RevisionConflictException("The opening subledger batch changed.");
        if (command.Decision == "cancel")
        {
            batch.Cancel(Actor(current));
            mutations.Record(current, command.OperationId, action, command, batch.Id, batch.Version);
            return (View(batch, current), null);
        }

        await DemandCutoverAsync(current.Scope, book, ct);
        await DemandAccountsAsync(current.Scope, batch.EquityAccountId, batch.Rows, ct);
        await cutoff.DemandPostingAsync(current.Scope, batch.Rows.Select(x => x.AccountId).Distinct().ToArray(), batch.On, ct);
        var stock = batch.Rows.Where(row => row.Kind == OpeningSubledgerKind.Stock).ToArray();
        if (stock.Length > 0) await references.DemandWarehouseManagementAsync(current.Scope.WorkspaceId, ct);
        await DemandReferencesAsync(current.Scope, batch.Rows, ct);
        batch.Approve(Actor(current));
        var plan = stock.Length == 0 ? null : new OpeningStockPlan(batch.Id, batch.TenantId, batch.WorkspaceId, batch.On, batch.Currency, stock);
        if (plan is null) await PostAsync(current.Scope, book, batch, ct);
        mutations.Record(current, command.OperationId, action, command, batch.Id, batch.Version);
        return (View(batch, current), plan);
    }

    public async Task<ResumeCostsAfterOpening[]> FinalizeAsync(Guid tenantId, Guid workspaceId, Guid id, string? rejection, CancellationToken ct)
    {
        var scope = new ResourceScope(tenantId, workspaceId);
        var book = await LockAsync(scope, ct);
        var batch = await FindAsync(scope, id, ct);
        if (batch.State is OpeningSubledgerState.Posted or OpeningSubledgerState.Rejected) return [];
        if (batch.State != OpeningSubledgerState.ApplyingStock)
            throw new LedgerRuleException("The opening subledger batch is not pending stock acknowledgement.");
        if (rejection is not null)
        {
            batch.Reject(rejection);
            return [];
        }
        await PostAsync(scope, book, batch, ct);
        return batch.Rows.Where(row => row.Kind == OpeningSubledgerKind.Stock)
            .Select(row => new ResumeCostsAfterOpening(tenantId, workspaceId, row.Id)).ToArray();
    }

    private async Task DemandCutoverAsync(ResourceScope scope, AccountingBook book, CancellationToken ct)
    {
        if (book.IsTaxLocked(book.StartsOn) || (await ledger.PeriodAsync(scope, FiscalPeriod.MonthOf(book.StartsOn), ct))?.State != PeriodState.Open)
            throw new LedgerRuleException("Open the first accounting period before importing opening balances.");
        if (await ledger.HasOrdinaryPostingsAsync(scope, ct))
            throw new LedgerRuleException("Opening subledgers must be posted before ordinary activity.");
        if ((await ledger.SourceAsync(scope, "opening", ct)) is { State: not JournalState.Posted })
            throw new LedgerRuleException("Complete or cancel the pending general ledger opening first.");
    }

    private async Task<AccountingBook> LockAsync(ResourceScope scope, CancellationToken ct) =>
        await chart.LockBookAsync(scope, ct) ?? throw new ResourceNotFoundException();

    private async Task<OpeningSubledgerBatch> FindAsync(ResourceScope scope, Guid id, CancellationToken ct) =>
        await batches.FindAsync(scope, id, ct) ?? throw new ResourceNotFoundException();

    private static JournalActor Actor(BookAccess current) => new(current.Actor.Issuer, current.Actor.Subject);
}
