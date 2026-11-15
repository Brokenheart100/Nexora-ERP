namespace Nexora.Inventory.Domain;

public sealed class SalesReservation
{
    private SalesReservation() { }

    public SalesReservation(ShipmentTerms terms, bool held)
    {
        Id = terms.PermitId;
        TenantId = terms.TenantId;
        WorkspaceId = terms.WorkspaceId;
        WarehouseId = terms.WarehouseId;
        Terms = terms;
        Fenced = !held;
    }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public Guid WarehouseId { get; private set; }
    public ShipmentTerms Terms { get; private set; } = null!;
    public decimal Executed { get; private set; }
    public long Revision { get; private set; } = 1;
    public bool Fenced { get; private set; }
    public decimal Remaining => Terms.Quantity - Executed;

    public bool Release(CostPool? pool)
    {
        if (Fenced || Remaining == 0) return false;
        if (pool is null) throw new StockRuleException("The reservation cost pool is missing.");
        pool.Release(Remaining);
        Fenced = true;
        Revision++;
        return true;
    }

    public decimal Ship(CostPool pool, DateOnly on, decimal quantity, DateTimeOffset now)
    {
        if (Fenced || now >= Terms.ExpiresAtUtc)
            throw new StockRuleException("The reservation is no longer available.");
        if (on < Terms.OrderDate || on.Year > 9998 || quantity <= 0 || Math.Round(quantity, 6) != quantity)
            throw new ArgumentException("Invalid shipment date or quantity.");
        if (quantity > Remaining) throw new StockRuleException("Quantity exceeds the reserved remainder.");
        var cost = pool.Ship(quantity, Terms.MinorUnits);
        Executed += quantity;
        Revision++;
        return cost;
    }
}
