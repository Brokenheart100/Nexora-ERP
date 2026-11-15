namespace Nexora.Inventory.Domain;

public sealed class StockOperation
{
    private StockOperation() { }

    public StockOperation(CostPool pool, Guid maker, Guid? destination, DateOnly on, decimal quantity, string reason)
    {
        if (destination == pool.WarehouseId || on.Year is < 1900 or > 9998 || reason.Length is < 1 or > 300
            || quantity is < 0 or > 1_000_000m || Math.Round(quantity, 6) != quantity
            || destination is not null && (quantity <= 0 || quantity > pool.Available))
            throw new StockRuleException("A valid quantity, date, destination and reason are required.");
        if (destination is null && (quantity < pool.Reserved || quantity > 0 && pool.Quantity == 0))
            throw new StockRuleException("A count cannot consume reservations or introduce stock without an established cost.");
        Id = Guid.CreateVersion7();
        TenantId = pool.TenantId;
        WorkspaceId = pool.WorkspaceId;
        WarehouseId = pool.WarehouseId;
        ItemId = pool.ItemId;
        DestinationId = destination;
        MakerId = maker;
        On = on;
        Quantity = quantity;
        Reason = reason;
        ExpectedSequence = pool.Sequence;
        BookQuantity = pool.Quantity;
    }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public Guid WarehouseId { get; private set; }
    public Guid ItemId { get; private set; }
    public Guid? DestinationId { get; private set; }
    public Guid MakerId { get; private set; }
    public Guid? ReviewerId { get; private set; }
    public DateOnly On { get; private set; }
    public decimal Quantity { get; private set; }
    public string Reason { get; private set; } = "";
    public long ExpectedSequence { get; private set; }
    public decimal BookQuantity { get; private set; }
    public Guid? MovementId { get; private set; }
    public Guid? DestinationMovementId { get; private set; }
    public decimal? TransitCost { get; private set; }
    public DateOnly? ReceivedOn { get; private set; }
    public bool Cancelled { get; private set; }
    public long Version { get; private set; } = 1;
    public bool Pending => !Cancelled && ReviewerId is null;
    public bool InTransit => DestinationId is not null && MovementId is not null && DestinationMovementId is null && TransitCost is not null;

    public void Confirm(Guid reviewer, CostPool pool, Guid? movementId)
    {
        if (!Pending || MakerId == reviewer || ExpectedSequence != pool.Sequence)
            throw new StockRuleException("An independent reviewer and unchanged source cost pool are required.");
        ReviewerId = reviewer;
        MovementId = movementId;
        Version++;
    }

    public void RecordDispatch(decimal cost)
    {
        if (DestinationId is null || MovementId is null || TransitCost is not null || cost < 0)
            throw new StockRuleException("A dispatched transfer and its cost are required.");
        TransitCost = cost;
    }

    public void Receive(Guid actor, Guid movementId, DateOnly on)
    {
        if (!InTransit || actor == MakerId || on < On || on.Year > 9998)
            throw new StockRuleException("An in-transit transfer requires independent receipt on or after dispatch.");
        DestinationMovementId = movementId;
        ReceivedOn = on;
        Version++;
    }

    public void Cancel()
    {
        if (!Pending) throw new StockRuleException("Only a pending operation can be cancelled.");
        Cancelled = true;
        Version++;
    }
}
