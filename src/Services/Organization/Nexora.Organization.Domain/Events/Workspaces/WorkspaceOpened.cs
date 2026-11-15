namespace Nexora.Organization.Domain;

public sealed record WorkspaceOpened(Guid EventId, Guid TenantId, Guid WorkspaceId, string Name,
    string CountryCode, string BaseCurrency, DateTimeOffset OccurredAtUtc, long Version);
