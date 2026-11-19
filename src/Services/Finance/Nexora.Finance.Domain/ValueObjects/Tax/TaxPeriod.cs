namespace Nexora.Finance.Domain;

public enum TaxCycle { Monthly = 1, Quarterly = 3 }
public enum TaxBasis { Accrual = 0, Cash = 1 }

public sealed record TaxPeriod(DateOnly From, DateOnly Through)
{
    public static TaxPeriod For(DateOnly on, TaxCycle cycle)
    {
        if (on.Year is < 1900 or > 9998 || cycle is not (TaxCycle.Monthly or TaxCycle.Quarterly))
            throw new ArgumentException("Invalid tax period or cycle.");
        var months = (int)cycle;
        var first = new DateOnly(on.Year, (on.Month - 1) / months * months + 1, 1);
        return new(first, first.AddMonths(months).AddDays(-1));
    }
}
