namespace Nexora.Inventory.Domain;

public sealed class StockReturn
{
    private StockReturn() { }
    public StockReturn(StockMovement original, Guid approverId, DateOnly on, decimal quantity, string reason, bool sales = false)
    {
        if ((sales ? original.Quantity >= 0 : original.Quantity <= 0) || original.ReversesId is not null || on < original.On || on.Year > 9998 || reason.Length is < 1 or > 300
            || quantity <= 0 || Math.Round(quantity, 6) != quantity)
            throw new ArgumentException("A receipt, valid return date and quantity, and reason are required.");
        Id = Guid.CreateVersion7();
        TenantId = original.TenantId;
        WorkspaceId = original.WorkspaceId;
        WarehouseId = original.WarehouseId;
        OriginalId = original.Id;
        IsSales = sales;
        ApproverId = approverId;
        On = on;
        Quantity = quantity;
        Reason = reason;
    }
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public Guid WarehouseId { get; private set; }
    public Guid OriginalId { get; private set; }
    public bool IsSales { get; private set; }
    public Guid ApproverId { get; private set; }
    public DateOnly On { get; private set; }
    public decimal Quantity { get; private set; }
    public string Reason { get; private set; } = "";
    public Guid? MovementId { get; private set; }
    public bool Cancelled { get; private set; }
    public void Confirm(Guid receiverId, Guid movementId)
    {
        if (Cancelled || MovementId is not null || receiverId == ApproverId)
            throw new StockRuleException("This return requires independent warehouse confirmation and a pending authorization.");
        MovementId = movementId;
    }
    public void Cancel()
    {
        if (MovementId is not null || Cancelled) throw new StockRuleException("Only a pending return can be cancelled.");
        Cancelled = true;
    }
}
