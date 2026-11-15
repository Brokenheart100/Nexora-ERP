namespace Nexora.Inventory.Application;

public sealed record PrepareStockOperation(Guid WorkspaceId, Guid OperationId, Guid WarehouseId, Guid ItemId, Guid? DestinationId,
    long ExpectedSequence, DateOnly On, string Quantity, string Reason);

public sealed record DecideStockOperation(Guid WorkspaceId, Guid OperationId, Guid Id, long ExpectedVersion, bool Confirm);

public sealed record ReceiveStockTransfer(Guid WorkspaceId, Guid OperationId, Guid Id, long ExpectedVersion, DateOnly On);
