namespace Nexora.Finance.Domain;

public static class TaxCalculation
{
    public const string Policy = "line-additive-away-from-zero-v1";

    public static TaxAmounts Calculate(int minorUnits, decimal unitPrice, decimal quantity, decimal discount,
        bool includesTax, IReadOnlyList<TaxRate> rates, decimal? allocatedNet = null)
    {
        if (!ValidNumber(unitPrice, 0, 1_000_000_000m) || !ValidNumber(quantity, 0.000001m, 1_000_000m)
            || !ValidNumber(discount, 0, 1))
            throw new ArgumentException("Invalid tax calculation input or precision.");
        var basis = unitPrice * quantity * (1 - discount);
        var combinedRate = rates.Sum(x => x.Rate);
        if (allocatedNet is not null && (includesTax || allocatedNet < 0 || Round(allocatedNet.Value) != allocatedNet))
            throw new ArgumentException("Invalid allocated net amount.");
        var rawNet = includesTax ? basis / (1 + combinedRate) : allocatedNet ?? basis;
        var net = Round(rawNet);
        var components = rates.Select(x => new TaxAmount(x.Id, x.Code, x.EffectiveOn, x.Rate, Round(rawNet * x.Rate))).ToArray();
        var tax = components.Sum(x => x.Amount);
        if (includesTax)
        {
            // Reconcile the rounded components to the quoted gross, with a stable component order.
            var difference = Round(basis) - net - tax;
            var largest = Array.FindIndex(components, x => x.Amount == components.Max(y => y.Amount));
            if (largest >= 0 && components[largest].Amount + difference >= 0)
            {
                components[largest] = components[largest] with { Amount = components[largest].Amount + difference };
                tax += difference;
            }
            else
            {
                // Several tiny rounded components can exceed gross. Allocate the residual by component order.
                var remaining = Round(basis) - net;
                for (var i = 0; i < components.Length; i++)
                {
                    var amount = Math.Min(components[i].Amount, remaining);
                    components[i] = components[i] with { Amount = amount };
                    remaining -= amount;
                }
                tax = components.Sum(x => x.Amount);
            }
        }
        return new(net, tax, net + tax, components);

        decimal Round(decimal value) => Math.Round(value, minorUnits, MidpointRounding.AwayFromZero);
    }

    public static bool ValidNumber(decimal value, decimal minimum, decimal maximum) =>
        value >= minimum && value <= maximum && Math.Round(value, 6) == value;
}
