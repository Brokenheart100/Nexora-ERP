namespace Nexora.Finance.Domain;

public sealed record TaxRate(Guid Id, Guid TenantId, Guid WorkspaceId, string Code, string Name, DateOnly EffectiveOn, decimal Rate);

public sealed record TaxGroup(Guid Id, Guid TenantId, Guid WorkspaceId, string Code, string Name, long Version, string RateCodes);

public sealed record TaxClassification(Guid Id, Guid TenantId, Guid WorkspaceId, string Kind, Guid ResourceId,
    string GroupCode, long Version, long ReferenceVersion);

public sealed record TaxAssessment(Guid Id, Guid TenantId, Guid WorkspaceId, string SnapshotJson, DateTimeOffset CreatedAtUtc);
