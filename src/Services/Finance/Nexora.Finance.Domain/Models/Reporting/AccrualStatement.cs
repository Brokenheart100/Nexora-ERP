namespace Nexora.Finance.Domain;

public sealed record StatementPeriod(DateOnly From, DateOnly Through)
{
    public StatementPeriod? Previous(DateOnly startsOn)
    {
        var days = Through.DayNumber - From.DayNumber + 1;
        var priorStart = From.DayNumber - days;
        return priorStart < startsOn.DayNumber ? null : new(DateOnly.FromDayNumber(priorStart), From.AddDays(-1));
    }
}

public sealed record StatementAccount(Guid Id, string Code, string Name, AccountCategory Category,
    decimal Opening, decimal Debit, decimal Credit)
{
    public decimal Closing => Opening + Debit - Credit;
}

public sealed record StatementRow(string Key, string Code, string Name, string Section, decimal Amount,
    decimal? Opening = null, decimal? Debit = null, decimal? Credit = null);

public sealed record StatementTotal(string Key, decimal Amount);

public sealed record AccrualStatement(StatementRow[] Rows, StatementTotal[] Totals)
{
    public static bool Includes(StatementKind kind, AccountCategory category) => kind switch
    {
        StatementKind.TrialBalance => true,
        StatementKind.ProfitAndLoss => IsProfitAndLoss(category),
        StatementKind.BalanceSheet => !IsProfitAndLoss(category),
        _ => throw new ArgumentOutOfRangeException(nameof(kind))
    };

    public static bool IsProfitAndLoss(AccountCategory category) => category is AccountCategory.Income or AccountCategory.Expense;

    public static AccrualStatement Calculate(StatementKind kind, IReadOnlyCollection<StatementAccount> accounts)
    {
        var rows = accounts.Where(x => Includes(kind, x.Category)
            && (kind != StatementKind.ProfitAndLoss || x.Debit != 0 || x.Credit != 0)).OrderBy(x => x.Category).ThenBy(x => x.Code, StringComparer.Ordinal)
            .Select(x => new StatementRow(x.Id.ToString(), x.Code, x.Name, x.Category.ToString().ToLowerInvariant(), kind switch
            {
                StatementKind.TrialBalance => x.Closing,
                StatementKind.ProfitAndLoss => x.Category == AccountCategory.Income ? x.Credit - x.Debit : x.Debit - x.Credit,
                StatementKind.BalanceSheet => x.Category == AccountCategory.Asset ? x.Closing : -x.Closing,
                _ => throw new ArgumentOutOfRangeException(nameof(kind))
            }, kind == StatementKind.TrialBalance ? x.Opening : null, kind == StatementKind.TrialBalance ? x.Debit : null,
                kind == StatementKind.TrialBalance ? x.Credit : null)).ToList();

        decimal Sum(string section) => rows.Where(x => x.Section == section).Sum(x => x.Amount);
        if (kind == StatementKind.BalanceSheet)
        {
            // Income and expense still open in the ledger are part of equity until closing journals transfer them.
            var earnings = -accounts.Where(x => IsProfitAndLoss(x.Category)).Sum(x => x.Closing);
            rows.Add(new("earnings", "", "未结转损益", "equity", earnings));
        }

        var totals = kind switch
        {
            StatementKind.TrialBalance => new StatementTotal[]
            {
                new("opening-net", accounts.Sum(x => x.Opening)), new("period-debit", accounts.Sum(x => x.Debit)),
                new("period-credit", accounts.Sum(x => x.Credit)), new("closing-net", accounts.Sum(x => x.Closing))
            },
            StatementKind.ProfitAndLoss =>
                [new("income", Sum("income")), new("expense", Sum("expense")), new("profit", Sum("income") - Sum("expense"))],
            StatementKind.BalanceSheet =>
                [new("assets", Sum("asset")), new("liabilities", Sum("liability")), new("equity", Sum("equity")),
                    new("balance-difference", Sum("asset") - Sum("liability") - Sum("equity"))],
            _ => throw new ArgumentOutOfRangeException(nameof(kind))
        };
        return new(rows.ToArray(), totals);
    }
}
