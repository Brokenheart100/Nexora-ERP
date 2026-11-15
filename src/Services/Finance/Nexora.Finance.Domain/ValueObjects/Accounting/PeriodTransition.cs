namespace Nexora.Finance.Domain;

public sealed record PeriodTransition(Guid Id, Guid TenantId, Guid WorkspaceId, DateOnly Month, long Version,
    PeriodState State, long? Watermark, string Reason, string Issuer, string Subject, DateTimeOffset OccurredAtUtc);
