using Nexora.Purchasing.Application;

namespace Nexora.Purchasing.Api;

public static partial class PurchaseEndpoints
{
    public sealed record CreateRequest(Guid OperationId, string Number, PurchaseDraft Draft);
    public sealed record EditRequest(Guid OperationId, long ExpectedVersion, PurchaseDraft Draft);
    public sealed record DecisionRequest(Guid OperationId, long ExpectedVersion, string Decision, string? Reason);
}
