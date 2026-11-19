using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed record PartnershipView(int Year, long Version, PartnerCapital[] Partners);
public sealed record ConfigurePartnership(Guid WorkspaceId, Guid OperationId, int Year, long ExpectedVersion, PartnerCapital[] Partners);

public sealed class Partnerships(TradeAccess access, IPartnershipStore partnerships, IFiscalYearStore years,
    ILedgerStore ledger, FinanceMutation mutations)
{
    public async Task<PartnershipView> ReadAsync(Guid workspace, int year, CancellationToken ct)
    {
        var (current, book) = await access.ReadAsync(workspace, ct);
        _ = LastDay(book, year);
        return View(year, await partnerships.FindAsync(current.Scope, year, ct));
    }

    public async Task<PartnershipView> ConfigureAsync(ConfigurePartnership command, CancellationToken ct)
    {
        const string action = "fiscal.partnership-configured";
        var (current, book) = await access.LockAsync(command.WorkspaceId, ChartPermissions.Manage, ct);
        var through = LastDay(book, command.Year);
        var row = await partnerships.FindAsync(current.Scope, command.Year, ct);
        if (await mutations.ReplayAsync(current, command.OperationId, action, command, ct) is not null) return View(command.Year, row);
        if (book.IsPersonal || await years.LatestClosedAsync(current.Scope, ct) >= through)
            throw new LedgerRuleException("Only an open company fiscal year can configure partnership shares.");
        if (command.ExpectedVersion != (row?.Version ?? 0))
            throw new RevisionConflictException("The partnership changed. Refresh before saving.");
        if (row is null)
        {
            row = new(book, command.Year);
            partnerships.Add(row);
        }
        row.Change(command.Partners);
        var ids = row.Partners.SelectMany(x => new[] { x.CapitalAccountId, x.DrawingsAccountId }).ToArray();
        var accounts = await ledger.AccountsAsync(current.Scope, ids, ct);
        if (accounts.Length != ids.Length || accounts.Any(x => x.IsArchived || x.Category != AccountCategory.Equity
            || x.Purpose != AccountPurpose.Posting))
            throw new LedgerRuleException("Choose active equity posting accounts for each partner.");
        mutations.Record(current, command.OperationId, action, command, book.WorkspaceId, row.Version);
        return View(command.Year, row);
    }

    private static DateOnly LastDay(AccountingBook book, int year)
    {
        if (year is < 1899 or > 9997) throw new ArgumentException("Invalid fiscal year.");
        var through = new DateOnly(year + 1, book.FiscalYearStartMonth, 1).AddDays(-1);
        return through >= book.StartsOn ? through : throw new ArgumentException("The fiscal year predates this book.");
    }

    private static PartnershipView View(int year, PartnershipYear? row) =>
        new(year, row?.Version ?? 0, row?.Partners ?? []);
}
