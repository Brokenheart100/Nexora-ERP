using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed class FinancialReports(TradeAccess access, IFinancialReportReader reader, ILedgerStore ledger, IFinanceHistoryReader history)
{
    public async Task<FinancialReport> ReadAsync(Guid workspaceId, string kind, DateOnly from, DateOnly through, bool compare,
        long? watermark, string? basis, CancellationToken ct)
    {
        var (current, book) = await access.ReadAsync(workspaceId, ct);
        return await ReadScopedAsync(current.Scope, book, kind, from, through, compare, watermark, basis, ct);
    }

    internal async Task<FinancialReport> ReadScopedAsync(ResourceScope scope, AccountingBook book, string kind, DateOnly from,
        DateOnly through, bool compare, long? watermark, string? basis, CancellationToken ct)
    {
        var (statementKind, period, at) = Validate(book, kind, from, through, watermark);
        var previousPeriod = compare ? period.Previous(book.StartsOn) : null;
        var cash = IsCash(statementKind, basis);
        var facts = cash ? await history.ReadAsync(scope, period.Through, at, true, ct) : null;
        var statement = await Calculate(period);
        var previous = previousPeriod is null ? null : await Calculate(previousPeriod);
        var previousLines = previous?.Rows.ToDictionary(x => x.Key) ?? [];
        var currentLines = statement.Rows.ToDictionary(x => x.Key);
        var lines = currentLines.Keys.Union(previousLines.Keys).Select(key =>
        {
            var row = currentLines.GetValueOrDefault(key) ?? Empty(previousLines[key]);
            decimal? before = previous is null ? null : previousLines.GetValueOrDefault(key)?.Amount ?? 0;
            return new ReportLine(row, before, row.Amount - before);
        }).OrderBy(x => SectionOrder(x.Row.Section))
            .ThenBy(x => x.Row.Key == "earnings").ThenBy(x => x.Row.Code, StringComparer.Ordinal)
            .ThenBy(x => x.Row.Key, StringComparer.Ordinal).ToArray();
        var previousTotals = previous?.Totals.ToDictionary(x => x.Key, x => x.Amount);
        var totals = statement.Totals.Select(x =>
        {
            var before = previousTotals?.GetValueOrDefault(x.Key);
            return new ReportTotal(x.Key, x.Amount, before, x.Amount - before);
        }).ToArray();

        return new(kind, cash ? "cash" : "accrual", book.BaseCurrency, book.MinorUnits, period, previousPeriod, at, lines, totals);

        async Task<AccrualStatement> Calculate(StatementPeriod range) => facts is null
            ? AccrualStatement.Calculate(statementKind, await reader.TotalsAsync(scope, range, at, ct, statementKind == StatementKind.ProfitAndLoss))
            : CashFor(statementKind, facts, range, book.MinorUnits).Statement;
    }

    public async Task<FinancialDrill> DrillAsync(Guid workspaceId, string kind, string row, DateOnly from, DateOnly through,
        long watermark, int page, string? basis, CancellationToken ct)
    {
        var (current, book) = await access.ReadAsync(workspaceId, ct);
        var (statementKind, period, at) = Validate(book, kind, from, through, watermark);
        if (page is < 1 or > 100_000) throw new ArgumentException("Invalid report page.");
        if (IsCash(statementKind, basis))
        {
            var facts = await history.ReadAsync(current.Scope, period.Through, at, true, ct);
            var report = CashFor(statementKind, facts, period, book.MinorUnits);
            if (!report.Statement.Rows.Any(x => x.Key == row)) return new(period, at, false, []);
            var postings = report.Contributions.Where(x => x.Key == row)
                .OrderByDescending(x => x.Source.On).ThenByDescending(x => x.Source.Number)
                .Skip((page - 1) * 50).Take(51)
                .Select(x => new ReportPosting(x.Source.JournalId, x.Source.Number, x.Source.On, x.Source.SourceNumber,
                    x.Source.Memo, x.AccountId ?? Guid.Empty, x.Code, x.Name, x.Debit, x.Credit, x.Amount)).ToArray();
            return new(period, at, postings.Length > 50, postings.Take(50).ToArray());
        }
        Guid? accountId = null;
        if (row != "earnings" || statementKind != StatementKind.BalanceSheet)
        {
            if (!Guid.TryParseExact(row, "D", out var id)) throw new ResourceNotFoundException();
            var account = (await ledger.AccountsAsync(current.Scope, [id], ct)).SingleOrDefault();
            if (account is null || !AccrualStatement.Includes(statementKind, account.Category)) throw new ResourceNotFoundException();
            accountId = id;
        }

        var detailPeriod = statementKind == StatementKind.ProfitAndLoss ? period : period with { From = book.StartsOn };
        var items = await reader.PostingsAsync(current.Scope, detailPeriod, at, accountId, page, ct, statementKind == StatementKind.ProfitAndLoss);
        return new(detailPeriod, at, items.Length > 50, items.Take(50).ToArray());
    }

    private static bool IsCash(StatementKind kind, string? basis)
    {
        if (basis is not (null or "accrual" or "cash")
            || basis == "cash" && kind is not (StatementKind.ProfitAndLoss or StatementKind.CashFlow)
            || basis == "accrual" && kind == StatementKind.CashFlow)
            throw new ArgumentException("The requested accounting basis is unavailable for this report.");
        return kind == StatementKind.CashFlow || basis == "cash";
    }

    private static int SectionOrder(string section) => section switch
    {
        "asset" or "operating" => 1, "liability" or "investing" => 2, "equity" or "financing" => 3, "income" => 4, "expense" => 5, _ => 6
    };

    private static CashStatement CashFor(StatementKind kind, FinanceHistory history, StatementPeriod period, int minorUnits)
    {
        if (kind == StatementKind.CashFlow)
            return CashStatements.Flow(history with
            {
                CashLines = history.CashLines.Where(x => x.Source.On <= period.Through).ToArray()
            }, period);
        return CashStatements.Profit(history with
        {
            CashLines = history.CashLines.Where(x => x.Source.On <= period.Through).ToArray(),
            Customers = history.Customers.Where(x => x.Source.On <= period.Through).ToArray(),
            Trades = history.Trades.Where(x => x.Source.On <= period.Through).ToArray()
        }, period, minorUnits);
    }

    private static StatementRow Empty(StatementRow row) => row with
    {
        Amount = 0, Opening = row.Opening.HasValue ? 0 : null, Debit = row.Debit.HasValue ? 0 : null,
        Credit = row.Credit.HasValue ? 0 : null
    };

    private static (StatementKind, StatementPeriod, long) Validate(AccountingBook book, string kind, DateOnly from,
        DateOnly through, long? watermark)
    {
        var statementKind = kind switch
        {
            "trial-balance" => StatementKind.TrialBalance,
            "profit-and-loss" => StatementKind.ProfitAndLoss,
            "balance-sheet" => StatementKind.BalanceSheet,
            "cash-flow" => StatementKind.CashFlow,
            _ => throw new ResourceNotFoundException()
        };
        if (from < book.StartsOn || through < from || through.Year > 9998)
            throw new ArgumentException("Select a valid report period on or after the book start.");
        if (watermark < 0 || watermark > book.LastPostingNumber) throw new ArgumentException("Invalid report posting watermark.");
        return (statementKind, new(from, through), watermark ?? book.LastPostingNumber);
    }
}
