namespace Nexora.Inventory.Api;

public static partial class InventoryEndpoints
{
    public sealed record AddRequest(Guid OperationId, string Code, string Name);
    public sealed record AssignRequest(Guid OperationId, long ExpectedVersion, Guid? MemberId);
    public sealed record ReceiveRequest(Guid OperationId, long ExpectedRevision, DateOnly On, string Quantity);
    public sealed record ReturnRequest(Guid OperationId, DateOnly On, string Quantity, string Reason);
    public sealed record ReturnDecisionRequest(Guid OperationId, bool Confirm);
}
