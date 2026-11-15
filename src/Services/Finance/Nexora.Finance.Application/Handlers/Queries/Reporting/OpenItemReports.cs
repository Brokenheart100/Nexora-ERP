using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed class OpenItemReports(TradeAccess access, IFinanceHistoryReader history, IFinancialReportReader ledger)
{
    public async Task<AgingReport> AgingAsync(Guid workspaceId, string kind, DateOnly through, long? watermark, CancellationToken ct)
    {
        var customers = kind switch
        {
            "receivables" => true,
            "payables" => false,
            _ => throw new Nexora.BuildingBlocks.Application.ResourceNotFoundException()
        };
        var (current, book) = await access.ReadAsync(workspaceId, ct);
        var at = Watermark(book, through, watermark);
        var facts = await history.ReadAsync(current.Scope, through, at, false, ct);
        var items = OpenItems.At(facts, through, customers);
        var groups = items.ToLookup(x => x.Bucket);
        string[] keys = ["current", "1-30", "31-60", "61-90", "over-90"];
        return new(kind, book.BaseCurrency, book.MinorUnits, through, at, items.Sum(x => x.Outstanding),
            keys.Select(key => new AgingBucket(key, groups[key].Count(), groups[key].Sum(x => x.Outstanding))).ToArray(), items);
    }

    public async Task<FinanceOverview> OverviewAsync(Guid workspaceId, DateOnly from, DateOnly through, long? watermark, CancellationToken ct)
    {
        var (current, book) = await access.ReadAsync(workspaceId, ct);
        var at = Watermark(book, through, watermark);
        if (from < book.StartsOn || from > through) throw new ArgumentException("Invalid report dates.");
        var period = new StatementPeriod(from, through);
        var balances = await ledger.TotalsAsync(current.Scope, period, at, ct, excludeClosing: true);
        var result = AccrualStatement.Calculate(StatementKind.ProfitAndLoss, balances).Totals.ToDictionary(x => x.Key, x => x.Amount);
        var facts = await history.ReadAsync(current.Scope, through, at, true, ct);
        var cash = CashStatements.Flow(facts, period).Statement.Totals.Single(x => x.Key == "cash-closing").Amount;
        return new(book.BaseCurrency, book.MinorUnits, period, at, result["income"], result["expense"], result["profit"], cash,
            OpenItems.At(facts, through, true).Sum(x => x.Outstanding), OpenItems.At(facts, through, false).Sum(x => x.Outstanding));
    }

    private static long Watermark(AccountingBook book, DateOnly through, long? watermark)
    {
        if (through < book.StartsOn || through.Year > 9998 || watermark < 0 || watermark > book.LastPostingNumber)
            throw new ArgumentException("Invalid report date or posting watermark.");
        return watermark ?? book.LastPostingNumber;
    }
}
