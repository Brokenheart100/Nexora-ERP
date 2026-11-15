namespace Nexora.Sales.Application;

public sealed record SalesAudit(Guid Id, Guid TenantId, Guid WorkspaceId, Guid OrderId, string Issuer, string Subject,
    Guid OperationId, string Action, string Fingerprint, long ResultVersion, string? Reason, DateTimeOffset OccurredAtUtc, Guid? TargetId = null);
