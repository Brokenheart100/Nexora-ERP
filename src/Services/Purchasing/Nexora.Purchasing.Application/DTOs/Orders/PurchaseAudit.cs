namespace Nexora.Purchasing.Application;

public sealed record PurchaseAudit(Guid Id, Guid TenantId, Guid WorkspaceId, Guid OrderId, string Issuer, string Subject,
    Guid OperationId, string Action, string Fingerprint, long ResultVersion, string? Reason, DateTimeOffset OccurredAtUtc, Guid? TargetId = null);
