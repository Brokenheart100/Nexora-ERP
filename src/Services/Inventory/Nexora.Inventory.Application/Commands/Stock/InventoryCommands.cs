namespace Nexora.Inventory.Application;

public sealed record AddWarehouse(Guid WorkspaceId, Guid OperationId, string Code, string Name);

public sealed record AssignWarehouse(Guid WorkspaceId, Guid OperationId, Guid WarehouseId, long ExpectedVersion, Guid? MemberId);

public sealed record ReceiveStock(Guid WorkspaceId, Guid OperationId, Guid PermitId, long ExpectedRevision, DateOnly On, string Quantity);

public sealed record AuthorizeStockReturn(Guid WorkspaceId, Guid OperationId, Guid MovementId, DateOnly On, string Quantity, string Reason);

public sealed record DecideStockReturn(Guid WorkspaceId, Guid OperationId, Guid ReturnId, bool Confirm);
