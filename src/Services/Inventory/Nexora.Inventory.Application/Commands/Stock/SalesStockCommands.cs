namespace Nexora.Inventory.Application;

public sealed record ExpireSalesReservation(Guid TenantId, Guid WorkspaceId, Guid PermitId);

public sealed record ShipStock(Guid WorkspaceId, Guid OperationId, Guid PermitId, long ExpectedRevision, DateOnly On, string Quantity);

public sealed record AuthorizeSalesReturn(Guid WorkspaceId, Guid OperationId, Guid MovementId, DateOnly On, string Quantity, string Reason);

public sealed record DecideSalesReturn(Guid WorkspaceId, Guid OperationId, Guid ReturnId, bool Confirm);
