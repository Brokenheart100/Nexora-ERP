using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed partial class LedgerUseCases
{
    public async Task<LedgerHome> HomeAsync(Guid workspaceId, CancellationToken ct)
    {
        var (current, book) = await ReadBookAsync(workspaceId, ct);
        var monthKeys = current.MonthKeys(LedgerPermissions.Read);
        return new(book.BaseCurrency, book.MinorUnits, book.StartsOn, current.AllowsAny(LedgerPermissions.Draft),
            current.AllowsAny(LedgerPermissions.Post), current.AllowsAny(LedgerPermissions.Reverse), current.Allows(LedgerPermissions.Period),
            (await store.PeriodsAsync(current.Scope, ct))
                .Where(period => monthKeys is null || monthKeys.Contains(period.Month.Year * 100 + period.Month.Month))
                .Select(View).ToArray(), !book.IsPersonal && current.Allows(ChartPermissions.Manage));
    }

    public async Task<JournalSummary[]> ListAsync(Guid workspaceId, DateOnly? month, Guid? accountId, bool postedOnly, PageWindow page, CancellationToken ct)
    {
        var (current, _) = await ReadBookAsync(workspaceId, ct);
        if (month is { Day: not 1 } or { Year: > 9998 }) throw new ArgumentException("Invalid period.");
        if (accountId is Guid account && (await store.AccountsAsync(current.Scope, [account], ct)).Length == 0)
            throw new ResourceNotFoundException();
        return await store.ListAsync(current.Scope, month, accountId, postedOnly, page,
            current.MonthKeys(LedgerPermissions.Read), ct);
    }

    public async Task<JournalView> DetailAsync(Guid workspaceId, Guid id, CancellationToken ct)
    {
        var (current, _) = await ReadBookAsync(workspaceId, ct);
        var journal = await store.FindAsync(current.Scope, id, false, ct) ?? throw new ResourceNotFoundException();
        current.DemandOn(LedgerPermissions.Read, journal.On);
        return new(Summary(journal), journal.Lines.OrderBy(x => x.Ordinal)
            .Select(x => new JournalLineSnapshot(x.AccountId, x.Code, x.Name, x.Debit, x.Credit)).ToArray(),
            new(journal.MakerIssuer, journal.MakerSubject),
            journal.ReviewerIssuer is null ? null : new(journal.ReviewerIssuer, journal.ReviewerSubject!),
            journal.ApprovedVersion, journal.PostedAtUtc,
            journal.MakerIssuer == current.Actor.Issuer && journal.MakerSubject == current.Actor.Subject, journal.CashActivity?.ToString().ToLowerInvariant());
    }

    public async Task<TrialBalance> BalancesAsync(Guid workspaceId, DateOnly through, CancellationToken ct)
    {
        var (current, book) = await ReadBookAsync(workspaceId, ct);
        current.Demand(LedgerPermissions.Read);
        if (through < book.StartsOn || through.Year > 9998) throw new ArgumentException("Invalid balance cutoff.");
        var rows = await store.BalancesAsync(current.Scope, through, ct);
        return new(through, book.BaseCurrency, rows.Sum(x => x.Debit), rows.Sum(x => x.Credit), rows);
    }

    private static CashActivity? ParseCashActivity(string? value) => value switch
    {
        null or "" => null,
        "operating" => CashActivity.Operating,
        "investing" => CashActivity.Investing,
        "financing" => CashActivity.Financing,
        _ => throw new ArgumentException("Invalid cash flow classification.")
    };
}
