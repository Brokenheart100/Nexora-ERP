namespace Nexora.Purchasing.Application;

public sealed record CreatePurchase(Guid WorkspaceId, Guid OperationId, string Number, PurchaseDraft Draft);

public sealed record EditPurchase(Guid WorkspaceId, Guid OperationId, Guid Id, long ExpectedVersion, PurchaseDraft Draft);

public sealed record DecidePurchase(Guid WorkspaceId, Guid OperationId, Guid Id, long ExpectedVersion, string Decision, string? Reason);
