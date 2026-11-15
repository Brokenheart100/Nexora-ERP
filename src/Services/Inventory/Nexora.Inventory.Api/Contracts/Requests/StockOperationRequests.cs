namespace Nexora.Inventory.Api;

public static partial class StockOperationEndpoints
{
    public sealed record PrepareRequest(Guid OperationId, Guid ItemId, Guid? DestinationId, long ExpectedSequence,
        DateOnly On, string Quantity, string Reason);
    public sealed record DecideRequest(Guid OperationId, long ExpectedVersion, bool Confirm);
    public sealed record ReceiveRequest(Guid OperationId, long ExpectedVersion, DateOnly On);
}
