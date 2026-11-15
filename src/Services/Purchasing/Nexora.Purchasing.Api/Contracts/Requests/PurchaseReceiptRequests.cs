namespace Nexora.Purchasing.Api;

public static partial class PurchaseReceiptEndpoints
{
    public sealed record IssueRequest(Guid OperationId, long ExpectedVersion, Guid LineId, Guid WarehouseId, string Quantity);
    public sealed record FenceRequest(Guid OperationId, long ExpectedVersion, string Reason);
}
