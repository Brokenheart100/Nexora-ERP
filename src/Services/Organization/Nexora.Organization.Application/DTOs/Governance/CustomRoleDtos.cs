namespace Nexora.Organization.Application;

public sealed record CustomRoleView(Guid Id, string Name, long Revision, string[] Permissions);
public sealed record DepartmentView(Guid Id, string Name);
public sealed record RoleGrantView(Guid Id, Guid MemberId, Guid RoleId, long RoleRevision, string Scope, Guid? ScopeId,
    DateOnly? StartsOn, DateOnly? EndsOn, int RequiredApprovals, int ApprovalCount, string[] Permissions, string State,
    Guid RequestedBy, Guid? FirstApprovedBy, Guid? ApprovedBy, DateTimeOffset ExpiresAtUtc);
public sealed record PermissionOption(string Code, IReadOnlyList<string> Scopes);
public sealed record CustomRoleCatalog(IReadOnlyList<CustomRoleView> Roles, IReadOnlyList<PermissionOption> Permissions);
