namespace Nexora.Reporting.Application;

public sealed record WorkspaceProjection(Guid WorkspaceId, Guid TenantId, string Name,
    string CountryCode, string BaseCurrency, long Version, Guid LastEventId, DateTimeOffset ProjectedAtUtc);
