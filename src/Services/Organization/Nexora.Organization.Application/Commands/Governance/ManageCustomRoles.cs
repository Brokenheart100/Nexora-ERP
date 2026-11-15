using Nexora.BuildingBlocks.Application;

namespace Nexora.Organization.Application;

public sealed record SaveCustomRole(Guid WorkspaceId, long ExpectedVersion, Guid? RoleId, string? Name,
    string[]? Permissions, ActorContext Actor) : IUserGovernanceCommand;

public sealed record CreateDepartment(Guid WorkspaceId, long ExpectedVersion, string? Name, ActorContext Actor) : IUserGovernanceCommand;

public sealed record RequestCustomRole(Guid WorkspaceId, long ExpectedVersion, Guid MemberId, Guid RoleId, long RoleRevision,
    string Scope, Guid? ScopeId, DateOnly? StartsOn, DateOnly? EndsOn, ActorContext Actor) : IUserGovernanceCommand;

public sealed record DecideCustomRole(Guid WorkspaceId, long ExpectedVersion, Guid GrantId, string Action,
    ActorContext Actor) : IUserGovernanceCommand;
