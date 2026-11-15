namespace Nexora.Inventory.Application;

public sealed record TransferDestination(Guid Id, string Code, string Name);

public sealed record StockOperationView(Guid Id, Guid WarehouseId, Guid ItemId, Guid? DestinationId, DateOnly On, string Quantity,
    string BookQuantity, string Reason, string State, bool CanConfirm, bool CanCancel, long Version, Guid? MovementId, Guid? DestinationMovementId,
    string? TransitCost, DateOnly? ReceivedOn, bool CanReceive);
