namespace Nexora.Finance.Application;

public sealed record FinanceAudit(Guid Id, Guid TenantId, Guid WorkspaceId, string Issuer, string Subject,
    Guid OperationId, string Action, string Fingerprint, Guid? TargetId, long ResultVersion, DateTimeOffset OccurredAtUtc);
