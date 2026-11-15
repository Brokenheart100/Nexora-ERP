using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed class ReadinessUseCases(IBookAccess authority, IBookStore books, TradeAccess access,
    ILedgerStore ledger, IReadinessStore store, TradeUseCases trades, FinanceMutation mutations, TimeProvider clock)
{
    public async Task<ReadinessView> ReadAsync(Guid workspace, CancellationToken ct)
    {
        var current = await authority.DemandAsync(workspace, false, ct);
        current.Demand(LedgerPermissions.Read);
        var book = await books.FindAsync(current.Scope, ct);
        return await BuildAsync(current, book, ct);
    }

    public async Task<BackfillResult> BackfillAsync(BackfillReadiness command, CancellationToken ct)
    {
        const string action = "readiness.costs.backfilled";
        var (current, book) = await access.LockAsync(command.WorkspaceId, LedgerPermissions.Post, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null)
            return new BackfillResult([], [], true, await BuildAsync(current, book, ct));

        var pending = await store.PendingAccrualsAsync(current.Scope, ct);
        var due = command.Through is DateOnly through
            ? pending.Where(x => x.Fact.On <= through).ToArray()
            : pending;
        var outcome = await trades.BackfillCostsAsync(current.Scope, book, due, ct);
        mutations.Record(current, command.OperationId, action, command, command.WorkspaceId, outcome.Posted.Length);
        return new BackfillResult(outcome.Posted, outcome.Blocked, false, await BuildAsync(current, book, ct));
    }

    private async Task<ReadinessView> BuildAsync(BookAccess current, AccountingBook? book, CancellationToken ct)
    {
        var missingCount = await store.PostedDocumentsWithoutJournalAsync(current.Scope, ct);
        var pendingCount = await store.PendingCostsAsync(current.Scope, ct);
        var opening = "none";
        var hasPostings = false;
        if (book is not null)
        {
            hasPostings = await ledger.HasPostingsAsync(current.Scope, ct);
            var journal = await ledger.SourceAsync(current.Scope, "opening", ct);
            opening = journal is null ? "missing" : journal.State == JournalState.Posted ? "posted" : "pending";
        }

        var (checks, ready) = ReadinessPolicy.Evaluate(new ReadinessFacts(book is not null, opening, missingCount, pendingCount));
        var missing = missingCount == 0 ? [] : await store.MissingDocumentsAsync(current.Scope, 50, ct);
        var pending = pendingCount == 0 ? [] : await store.PendingCostListAsync(current.Scope, 20, ct);
        return new ReadinessView(ready,
            new ReadinessBook(book is not null, book?.BaseCurrency ?? string.Empty, book?.MinorUnits ?? 0,
                book?.StartsOn, book?.LastPostingNumber ?? 0, opening, hasPostings),
            checks, missing, missingCount, pending, pendingCount, clock.GetUtcNow());
    }
}
