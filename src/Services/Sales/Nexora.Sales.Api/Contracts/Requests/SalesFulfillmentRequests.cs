using Nexora.Sales.Application;

namespace Nexora.Sales.Api;

public static partial class SalesFulfillmentEndpoints
{
    public sealed record IssueRequest(Guid WarehouseId, FulfillmentLineInput[] Lines, int HoldSeconds = 900,
        Guid? OperationId = null, long? ExpectedVersion = null);
    public sealed record FenceRequest(string Reason, Guid? OperationId = null, long? ExpectedVersion = null);
}
