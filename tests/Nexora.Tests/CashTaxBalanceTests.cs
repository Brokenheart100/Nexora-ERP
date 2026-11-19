using Nexora.Finance.Domain;

namespace Nexora.Tests;

public sealed class CashTaxBalanceTests
{
    [Fact]
    public void Unpaid_credit_reallocates_recognized_tax_to_the_remaining_tax_codes()
    {
        var balance = new CashTaxBalance(220m, [("A", 10m), ("B", 20m)], 2);

        Assert.Equal([("A", 2.50m), ("B", 5m)], balance.Settle(55m));
        Assert.Equal([("A", 2.50m), ("B", -5m)], balance.ApplyUnpaidCredit(110m, [("B", 20m)]));
        Assert.Equal([("A", 5m)], balance.Settle(55m));
    }

    [Fact]
    public void Cumulative_rounding_preserves_total_tax_and_reverses_only_the_recognized_delta()
    {
        var balance = new CashTaxBalance(3m, [("A", 0.02m)], 2);

        Assert.Equal([("A", 0.01m)], balance.Settle(1m));
        Assert.Empty(balance.Settle(1m));
        Assert.Equal([("A", 0.01m)], balance.Settle(1m));
        Assert.Equal([("A", -0.01m)], balance.Settle(-1m));
    }
}
