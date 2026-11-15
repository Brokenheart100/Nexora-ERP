using Nexora.Inventory.Domain;
using Nexora.Purchasing.Domain;

namespace Nexora.Tests;

public sealed class P3FulfillmentTests
{
    [Fact]
    public void Fence_releases_only_unexecuted_quantity_and_ignores_duplicate_or_older_acknowledgements()
    {
        var maker = new PurchaseActor("test", "maker");
        var reviewer = new PurchaseActor("test", "reviewer");
        var today = new DateOnly(2026, 1, 1);
        var order = PurchaseOrder.Start(Guid.NewGuid(), Guid.NewGuid(), "PO-TEST", new("CNY", 2, today), today,
            new(Guid.NewGuid(), "SUP", "Supplier", 1),
            [new(new(Guid.NewGuid(), "SKU", "Item", 1, Guid.NewGuid(), 1, Guid.NewGuid(), "PCS", 1), 10, 10)],
            null, maker, DateTimeOffset.UnixEpoch);
        order.Submit(maker);
        order.Approve(reviewer, DateTimeOffset.UnixEpoch);
        var permit = new ReceiptPermit(order, order.Lines.Single(), Guid.NewGuid(), 10, 0);

        Assert.True(permit.Advance(2, 4, false));
        permit.RequestFence();
        Assert.Equal(10m, permit.Occupied);
        Assert.True(permit.Advance(4, 5, true));
        Assert.False(permit.Advance(4, 5, true));
        Assert.False(permit.Advance(3, 5, false));
        Assert.Equal(5m, permit.Occupied);
        Assert.Throws<PurchaseRuleException>(() => permit.Advance(5, 6, false));
    }

    [Fact]
    public void Fence_written_before_grant_blocks_execution_and_is_idempotent()
    {
        var terms = CreateTerms();
        var execution = new ReceiptExecution(terms);
        Assert.True(execution.Fence());
        Assert.False(execution.Fence());
        Assert.Throws<StockRuleException>(() => execution.Receive(1, terms.OrderDate));
        Assert.Equal(2L, execution.Revision);
        Assert.Equal(0m, execution.Executed);
    }

    [Fact]
    public void Weighted_cost_and_variance_preserve_inventory_value_and_the_remaining_share()
    {
        var terms = CreateTerms();
        var pool = new CostPool(terms);
        pool.Receive(terms, 10, 100);
        pool.Receive(terms, 10, 140);

        Assert.Equal(60m, pool.Issue(5, 2));
        Assert.Equal(15m, pool.Quantity);
        Assert.Equal(180m, pool.Value);
        Assert.Equal(1.50m, pool.AdjustPurchaseCost(2.50m, 10, 6, 2));
        Assert.Equal(181.50m, pool.Value);
        Assert.Equal(4L, pool.Sequence);
        Assert.Throws<StockRuleException>(() => pool.Issue(16, 2));
    }

    private static ReceiptTerms CreateTerms() => new(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(),
        Guid.NewGuid(), 2, Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), new DateOnly(2026, 1, 1), 10, 10, "CNY", 2);
}
