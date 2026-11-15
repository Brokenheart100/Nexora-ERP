using System.Text.Json.Serialization;

namespace Nexora.Sales.Application;

public sealed record IssueFulfillmentPermit(Guid WorkspaceId, Guid OperationId, Guid OrderId, long ExpectedVersion,
    Guid WarehouseId, FulfillmentLineInput[] Lines, int HoldSeconds = 900,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] SalesOrderCondition? Condition = null) : ISalesOrderMutation;

public sealed record FenceFulfillmentPermit(Guid WorkspaceId, Guid OperationId, Guid OrderId, long ExpectedVersion, Guid PermitId, string Reason,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] SalesOrderCondition? Condition = null) : ISalesOrderMutation;

public sealed record CloseFulfilling(Guid WorkspaceId, Guid OperationId, Guid OrderId, long ExpectedVersion, string Reason,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] SalesOrderCondition? Condition = null) : ISalesOrderMutation;
