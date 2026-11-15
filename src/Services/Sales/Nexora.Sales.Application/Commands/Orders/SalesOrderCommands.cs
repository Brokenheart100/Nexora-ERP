using System.Text.Json.Serialization;

namespace Nexora.Sales.Application;

public sealed record CreateSales(Guid WorkspaceId, Guid OperationId, string Number, SalesDraft Draft, bool IsQuote = false);

public sealed record ConvertQuote(Guid WorkspaceId, Guid OperationId, Guid Id, long ExpectedVersion, string OrderNumber,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] SalesOrderCondition? Condition = null) : ISalesOrderMutation;

public sealed record EditSales(Guid WorkspaceId, Guid OperationId, Guid Id, long ExpectedVersion, SalesDraft Draft,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] SalesOrderCondition? Condition = null) : ISalesOrderMutation;

public sealed record DecideSales(Guid WorkspaceId, Guid OperationId, Guid Id, long ExpectedVersion, string Decision, string? Reason,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] SalesOrderCondition? Condition = null) : ISalesOrderMutation;
