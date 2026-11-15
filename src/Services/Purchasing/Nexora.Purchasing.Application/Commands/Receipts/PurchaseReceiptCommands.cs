namespace Nexora.Purchasing.Application;

public sealed record IssueReceiptPermit(Guid WorkspaceId, Guid OperationId, Guid OrderId, long ExpectedVersion, Guid LineId,
    Guid WarehouseId, string Quantity);

public sealed record FenceReceiptPermit(Guid WorkspaceId, Guid OperationId, Guid OrderId, long ExpectedVersion, Guid PermitId, string Reason);

public sealed record CloseReceiving(Guid WorkspaceId, Guid OperationId, Guid OrderId, long ExpectedVersion, string Reason);
