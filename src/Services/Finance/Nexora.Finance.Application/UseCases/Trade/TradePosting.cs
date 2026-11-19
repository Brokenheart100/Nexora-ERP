using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed class TradePosting(ILedgerStore ledger, TimeProvider clock, BankCutoff cutoff)
{
    public static readonly JournalActor InventoryMaker = new("urn:nexora:inventory", "receipt-cost");
    public static readonly JournalActor InventoryReviewer = new("urn:nexora:finance", "receipt-accrual");

    public async Task<string?> GateAsync(ResourceScope scope, AccountingBook book, DateOnly on, CancellationToken ct)
    {
        if (on < book.StartsOn || on.Year > 9998) return "The posting date is outside the accounting book.";
        if (book.IsTaxLocked(on)) return "The posting date is locked by a tax filing.";
        var period = await ledger.PeriodAsync(scope, FiscalPeriod.MonthOf(on), ct);
        if (period?.State != PeriodState.Open) return "The accounting period is not open.";
        if (await ledger.HasApplyingOpeningSubledgersAsync(scope, ct)) return "Wait for the approved opening subledger batch to post.";
        if ((await ledger.SourceAsync(scope, "opening", ct)) is { State: not JournalState.Posted })
            return "Complete or cancel the pending book opening first.";
        return null;
    }

    public async Task<Guid> PostAsync(ResourceScope scope, AccountingBook book, Guid sourceId, string sourceNumber,
        DateOnly on, string memo, JournalActor maker, JournalActor reviewer, IReadOnlyList<PostLine> lines, CancellationToken ct,
        JournalKind kind = JournalKind.Automatic)
    {
        var entries = lines.GroupBy(x => x.AccountId).Select(x => new PostLine(x.Key, x.Sum(y => y.SignedAmount)))
            .Where(x => x.SignedAmount != 0).ToArray();
        var accountIds = entries.Select(x => x.AccountId).ToArray();
        await cutoff.DemandPostingAsync(scope, accountIds, on, ct);
        var accounts = await ledger.AccountsAsync(scope, accountIds, ct);
        if (accounts.Length != entries.Length) throw new ResourceNotFoundException();
        if (accounts.Any(x => x.IsArchived || x.Purpose == AccountPurpose.Group))
            throw new LedgerRuleException("A posting account is archived or unavailable.");
        var accountLookup = accounts.ToDictionary(x => x.Id);
        var snapshots = entries.Select(entry =>
        {
            var account = accountLookup[entry.AccountId];
            return new JournalLineSnapshot(account.Id, account.Code, account.Name,
                Math.Max(0, entry.SignedAmount), Math.Max(0, -entry.SignedAmount));
        }).ToArray();
        var now = clock.GetUtcNow();
        var source = kind == JournalKind.SubledgerOpening ? "opening-subledger" : maker == InventoryMaker ? "stock" : "trade";
        var journal = Journal.Start(book, kind, sourceNumber, $"{source}:{sourceId:N}", on, memo, maker, snapshots, now);
        journal.Submit(maker);
        journal.Post(reviewer, book.NextPostingNumber(), now);
        if (accounts.Any(x => !x.IsUsed)) book.AdvanceChart();
        foreach (var account in accounts) account.MarkUsed();
        book.RegisterAccountingActivity();
        ledger.Add(journal);
        return journal.Id;
    }

    public async Task<Guid> ReverseAsync(ResourceScope scope, AccountingBook book, Guid id, TradeDocument reversal, JournalActor reviewer, CancellationToken ct)
    {
        var original = await ledger.FindAsync(scope, id, true, ct) ?? throw new ResourceNotFoundException();
        await cutoff.DemandPostingAsync(scope, original.Lines.Select(x => x.AccountId).Distinct().ToArray(), reversal.Terms.On, ct);
        var journal = original.ReverseAutomatic(book, reversal.Terms.On, reversal.Terms.Memo, new(reversal.MakerIssuer, reversal.MakerSubject),
            reviewer, clock.GetUtcNow());
        ledger.Add(journal);
        return journal.Id;
    }
}
