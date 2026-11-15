namespace Nexora.Organization.Api;

public sealed record SaveCustomRoleRequest(long ExpectedVersion, Guid? RoleId, string? Name, string[]? Permissions);
public sealed record CreateDepartmentRequest(long ExpectedVersion, string? Name);
public sealed record RequestCustomRoleRequest(long ExpectedVersion, Guid MemberId, Guid RoleId, long RoleRevision, string Scope,
    Guid? ScopeId, DateOnly? StartsOn, DateOnly? EndsOn);
public sealed record DecideCustomRoleRequest(long ExpectedVersion, string Action);
