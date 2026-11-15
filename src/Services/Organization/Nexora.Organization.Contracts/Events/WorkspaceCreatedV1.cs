namespace Nexora.Organization.Contracts;

// Stable integration contract: contains no EF, Domain, HTTP or credential types.
public sealed record WorkspaceCreatedV1(Guid EventId, Guid TenantId, Guid WorkspaceId,
    string Name, string CountryCode, string BaseCurrency, DateTimeOffset OccurredAtUtc, long Version)
{
    public static int SchemaVersion => 1;
}
