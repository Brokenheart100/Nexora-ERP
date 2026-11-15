namespace Nexora.Sales.Application;

public sealed record FulfillmentLineInput(Guid LineId, string Quantity);

public sealed record FulfillmentBatchChange(Guid BatchId, Guid[] PermitIds, long OrderVersion);

public sealed record PermitChange(Guid PermitId, long OrderVersion);

public sealed record PermitView(Guid Id, Guid LineId, Guid WarehouseId, string Quantity, string Executed, long Revision, string State, DateTimeOffset ExpiresAtUtc, Guid BatchId);

public sealed record FulfillmentAllowances(bool CanManage, PermitView[] Permits);
