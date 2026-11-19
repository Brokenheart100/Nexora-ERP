namespace Nexora.Finance.Domain;

public sealed class CashTaxBalance(decimal gross, IReadOnlyList<(string Code, decimal Amount)> amounts, int minorUnits)
{
    private readonly Dictionary<string, decimal> _tax = amounts.ToDictionary(x => x.Code, x => x.Amount, StringComparer.Ordinal);
    private decimal _gross = gross;
    private decimal _paid;

    public (string Code, decimal Amount)[] Settle(decimal amount)
    {
        var before = Recognized();
        _paid += amount;
        return Difference(before);
    }

    public (string Code, decimal Amount)[] ApplyUnpaidCredit(decimal grossCredit, IReadOnlyList<(string Code, decimal Amount)> taxCredit)
    {
        var before = Recognized();
        _gross -= grossCredit;
        foreach (var (code, amount) in taxCredit)
            _tax[code] = _tax.GetValueOrDefault(code) - amount;
        return Difference(before);
    }

    public static decimal Prorate(decimal total, decimal gross, decimal applied, int minorUnits) =>
        gross > 0 ? Math.Round(total * Math.Clamp(applied, 0m, gross) / gross, minorUnits, MidpointRounding.AwayFromZero) : 0m;

    private Dictionary<string, decimal> Recognized() =>
        _tax.ToDictionary(x => x.Key, x => Prorate(x.Value, _gross, _paid, minorUnits), StringComparer.Ordinal);

    private (string Code, decimal Amount)[] Difference(Dictionary<string, decimal> before) =>
        Recognized().Select(x => (x.Key, x.Value - before.GetValueOrDefault(x.Key))).Where(x => x.Item2 != 0).ToArray();
}
