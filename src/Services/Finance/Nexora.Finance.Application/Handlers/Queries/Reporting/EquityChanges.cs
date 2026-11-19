using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed partial class FinancialReports
{
    private async Task<FinancialReport> EquityChangesAsync(ResourceScope scope, AccountingBook book, DateOnly from, DateOnly through,
        bool compare, long? watermark, string? basis, CancellationToken ct)
    {
        var (kind, period, at) = Validate(book, "balance-sheet", from, through, watermark);
        _ = IsCash(kind, basis);
        var facts = await history.ReadAsync(scope, period.Through, at, false, ct);
        var trades = facts.Trades.ToDictionary(x => x.Id);
        var previous = compare ? period.Previous(book.StartsOn) : null;
        var prior = previous is null ? null : await Totals(previous);
        var current = await Totals(period);
        var totals = current.Select((x, i) => new ReportTotal(x.Key, x.Amount, prior?[i].Amount, x.Amount - prior?[i].Amount)).ToArray();
        var year = FiscalInvoiceNumber.Year(from, book.FiscalYearStartMonth);
        PartnerEquityView[]? members = null;
        if (year == FiscalInvoiceNumber.Year(through, book.FiscalYearStartMonth)
            && await partnerships.FindAsync(scope, year, ct) is { } configuration)
        {
            var accounts = (await reader.TotalsAsync(scope, period, at, ct)).ToDictionary(x => x.Id);
            var movements = Movements(period).ToArray();
            var shares = configuration.Allocate(current.Single(x => x.Key == "profit").Amount, book.MinorUnits);
            members = configuration.Partners.Select((partner, i) =>
            {
                var capital = accounts.GetValueOrDefault(partner.CapitalAccountId);
                var drawing = accounts.GetValueOrDefault(partner.DrawingsAccountId);
                return new PartnerEquityView(partner.Code, partner.Name, partner.Share,
                    -(capital?.Opening ?? 0) - (drawing?.Opening ?? 0),
                    movements.Where(x => x.Kind == TradeKind.OwnerContribution && x.Account == partner.CapitalAccountId).Sum(x => x.Amount),
                    movements.Where(x => x.Kind == TradeKind.OwnerDrawing && x.Account == partner.DrawingsAccountId).Sum(x => x.Amount),
                    shares[i], -(capital?.Closing ?? 0) - (drawing?.Closing ?? 0));
            }).ToArray();
        }
        return new("equity-changes", "accrual", book.BaseCurrency, book.MinorUnits, period, previous, at, [], totals, members);

        async Task<StatementTotal[]> Totals(StatementPeriod range)
        {
            var accounts = await reader.TotalsAsync(scope, range, at, ct);
            var operating = await reader.TotalsAsync(scope, range, at, ct, excludeClosing: true);
            var opening = -accounts.Where(x => x.Category == AccountCategory.Equity || AccrualStatement.IsProfitAndLoss(x.Category))
                .Sum(x => x.Opening);
            var profit = operating.Where(x => AccrualStatement.IsProfitAndLoss(x.Category)).Sum(x => x.Credit - x.Debit);
            var movements = Movements(range).ToArray();
            var contribution = movements.Where(x => x.Kind == TradeKind.OwnerContribution).Sum(x => x.Amount);
            var drawing = movements.Where(x => x.Kind == TradeKind.OwnerDrawing).Sum(x => x.Amount);
            var sheet = AccrualStatement.Calculate(kind, accounts).Totals.ToDictionary(x => x.Key, x => x.Amount);
            var closing = sheet["equity"];
            return [new("equity-opening", opening), new("profit", profit), new("owner-contribution", contribution),
                new("owner-drawing", drawing), new("other-equity-adjustments", closing - opening - profit - contribution + drawing),
                new("equity-closing", closing), new("balance-difference", sheet["assets"] - sheet["liabilities"] - closing)];
        }

        IEnumerable<(TradeKind Kind, Guid? Account, decimal Amount)> Movements(StatementPeriod range)
        {
            foreach (var posting in facts.Trades.Where(x => x.Source.On >= range.From && x.Source.On <= range.Through))
            {
                var effective = posting;
                var sign = 1;
                if (posting.Terms.Kind == TradeKind.Void)
                {
                    if (posting.Terms.SourceId is not Guid original || !trades.TryGetValue(original, out effective!)) continue;
                    sign = -1;
                }
                if (effective.Terms.Kind is TradeKind.OwnerContribution or TradeKind.OwnerDrawing)
                    yield return (effective.Terms.Kind, effective.Terms.CounterAccountId, sign * effective.Total);
            }
        }
    }
}
