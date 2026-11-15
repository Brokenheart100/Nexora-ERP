namespace Nexora.Purchasing.Domain;

public sealed class ReceiptPermit
{
    private ReceiptPermit() { }
    public ReceiptPermit(PurchaseOrder order, PurchaseOrderLine line, Guid warehouseId, decimal quantity, decimal occupied)
    {
        if (order.State is not (PurchaseState.Approved or PurchaseState.Receiving) || order.ApprovedVersion is null)
            throw new PurchaseRuleException("A receipt permit requires an approved purchase order.");
        if (warehouseId == Guid.Empty || quantity <= 0 || Math.Round(quantity, 6) != quantity)
            throw new ArgumentException("A warehouse and positive receipt quantity are required.");
        if (quantity > line.Quantity - occupied) throw new PurchaseRuleException("Quantity exceeds the remaining order allowance.");
        Id = Guid.CreateVersion7();
        TenantId = order.TenantId;
        WorkspaceId = order.WorkspaceId;
        OrderId = order.Id;
        LineId = line.Id;
        WarehouseId = warehouseId;
        Quantity = quantity;
    }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public Guid OrderId { get; private set; }
    public Guid LineId { get; private set; }
    public Guid WarehouseId { get; private set; }
    public decimal Quantity { get; private set; }
    public decimal Executed { get; private set; }
    public long Revision { get; private set; }
    public bool Cancelling { get; private set; }
    public bool Fenced { get; private set; }
    public decimal Occupied => Fenced ? Executed : Quantity;

    public void RequestFence()
    {
        if (Fenced || Cancelling || Executed == Quantity) throw new PurchaseRuleException("This receipt permit cannot be cancelled.");
        Cancelling = true;
    }

    public bool Advance(long revision, decimal executed, bool fenced)
    {
        if (revision <= Revision) return false;
        if (executed < Executed || executed > Quantity || (Fenced && (!fenced || executed != Executed)) || fenced && !Cancelling)
            throw new PurchaseRuleException("The execution acknowledgement conflicts with permit history.");
        Revision = revision;
        Executed = executed;
        Fenced = fenced;
        if (fenced) Cancelling = false;
        return true;
    }
}
