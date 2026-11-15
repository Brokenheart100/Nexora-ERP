namespace Nexora.Organization.Contracts;

// No token, email or personal identity is carried in the invalidation fact.
public sealed record WorkspaceAuthorizationChangedV1(Guid EventId, Guid TenantId, Guid WorkspaceId, long AuthorizationVersion, DateTimeOffset OccurredAtUtc);
