namespace Nexora.Inventory.Domain;

public sealed class CostPool
{
    private CostPool() { }
    public CostPool(CostPool source, Guid destinationId)
    {
        TenantId = source.TenantId;
        WorkspaceId = source.WorkspaceId;
        WarehouseId = destinationId;
        ItemId = source.ItemId;
        UnitId = source.UnitId;
        Currency = source.Currency;
    }

    public CostPool(ReceiptTerms terms)
    {
        TenantId = terms.TenantId;
        WorkspaceId = terms.WorkspaceId;
        WarehouseId = terms.WarehouseId;
        ItemId = terms.ItemId;
        UnitId = terms.UnitId;
        Currency = terms.Currency;
    }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public Guid WarehouseId { get; private set; }
    public Guid ItemId { get; private set; }
    public Guid UnitId { get; private set; }
    public string Currency { get; private set; } = "";
    public long Sequence { get; private set; }
    public decimal Quantity { get; private set; }
    public decimal Value { get; private set; }
    public decimal Reserved { get; private set; }
    public decimal Available => Quantity - Reserved;

    public void Receive(ReceiptTerms terms, decimal quantity, decimal cost)
    {
        if (terms.UnitId != UnitId || terms.Currency != Currency)
            throw new StockRuleException("Receipt unit or currency differs from the cost pool.");
        Quantity += quantity;
        Value += cost;
        Sequence++;
    }

    public bool CanReserve(Guid unitId, string currency, decimal quantity) =>
        unitId == UnitId && currency == Currency && quantity > 0 && quantity <= Available;

    public bool TryReserve(Guid unitId, string currency, decimal quantity)
    {
        if (!CanReserve(unitId, currency, quantity)) return false;
        Reserved += quantity;
        return true;
    }

    public void Release(decimal quantity)
    {
        if (quantity < 0 || quantity > Reserved) throw new StockRuleException("The reservation balance is inconsistent.");
        Reserved -= quantity;
    }

    public decimal Ship(decimal quantity, int minorUnits)
    {
        Release(quantity);
        return Issue(quantity, minorUnits);
    }

    public void Restock(decimal quantity, decimal cost)
    {
        if (quantity <= 0 || cost < 0) throw new StockRuleException("Invalid stock return.");
        Quantity += quantity;
        Value += cost;
        Sequence++;
    }

    public decimal Issue(decimal quantity, int minorUnits)
    {
        if (quantity <= 0 || quantity > Available || Math.Round(quantity, 6) != quantity)
            throw new StockRuleException("Insufficient available stock for this issue.");
        var cost = quantity == Quantity ? Value : Math.Round(Value / Quantity * quantity, minorUnits, MidpointRounding.AwayFromZero);
        Quantity -= quantity;
        Value -= cost;
        Sequence++;
        return cost;
    }

    public decimal AdjustPurchaseCost(decimal variance, decimal billed, decimal remaining, int minorUnits)
    {
        if (billed <= 0 || remaining < 0 || remaining > billed) throw new ArgumentException("Invalid cost allocation quantities.");
        var delta = Math.Round(variance * remaining / billed, minorUnits, MidpointRounding.AwayFromZero);
        if (Value + delta < 0) delta = -Value;
        Value += delta;
        Sequence++;
        return delta;
    }
}
