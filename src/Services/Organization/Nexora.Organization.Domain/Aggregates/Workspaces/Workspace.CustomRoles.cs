namespace Nexora.Organization.Domain;

public sealed partial class Workspace
{
    private readonly List<WorkspaceCustomRole> _customRoles = [];
    private readonly List<WorkspaceRoleGrant> _roleGrants = [];
    private readonly List<WorkspaceDepartment> _departments = [];

    public IReadOnlyCollection<WorkspaceCustomRole> CustomRoles => _customRoles.AsReadOnly();
    public IReadOnlyCollection<WorkspaceRoleGrant> RoleGrants => _roleGrants.AsReadOnly();
    public IReadOnlyCollection<WorkspaceDepartment> Departments => _departments.AsReadOnly();

    public WorkspaceCustomRole SaveCustomRole(IdentityReference actor, Guid? roleId, string? name, IReadOnlyList<string>? permissions)
    {
        RequireBusinessRoleOwner(actor);
        var title = NameOf(name);
        var selected = CustomRolePolicy.SelectPermissions(permissions);
        if (_customRoles.Any(role => role.Id != roleId && string.Equals(role.Name, title, StringComparison.OrdinalIgnoreCase)))
            throw new GovernanceRuleException("A role with this name already exists.");

        var role = roleId is { } id ? FindCustomRole(id) : new WorkspaceCustomRole(Id, title, selected);
        if (roleId is null) _customRoles.Add(role);
        else if (role.Name == title && role.Permissions.SequenceEqual(selected)) return role;
        else role.Revise(title, selected);
        Version++;
        return role;
    }

    public WorkspaceDepartment AddDepartment(IdentityReference actor, string? name)
    {
        RequireBusinessRoleOwner(actor);
        var title = NameOf(name);
        if (_departments.Any(x => string.Equals(x.Name, title, StringComparison.OrdinalIgnoreCase)))
            throw new GovernanceRuleException("A department with this name already exists.");
        var department = new WorkspaceDepartment(Id, title);
        _departments.Add(department);
        Version++;
        return department;
    }

    public WorkspaceRoleGrant RequestCustomRole(IdentityReference actor, Guid memberId, Guid roleId,
        long roleRevision, string scope, Guid? scopeId, DateOnly? startsOn, DateOnly? endsOn, int requiredApprovals,
        DateTimeOffset now)
    {
        var owner = RequireBusinessRoleOwner(actor);
        if (!Members.Any(x => x.Id == memberId && x.IsActive))
            throw new GovernanceRuleException("An active member is required.");
        var role = FindCustomRole(roleId);
        if (role.Revision != roleRevision) throw new GovernanceRuleException("The role definition changed.");
        CustomRolePolicy.ValidateScope(scope, scopeId, role, startsOn, endsOn);
        if (scope == CustomRolePolicy.Department && !_departments.Any(x => x.Id == scopeId))
            throw new GovernanceRuleException("The department does not belong to this workspace.");
        if (_roleGrants.Any(x => x.MemberId == memberId && x.RoleId == roleId && x.RoleRevision == role.Revision &&
            x.Scope == scope && x.ScopeId == scopeId && x.StartsOn == startsOn && x.EndsOn == endsOn &&
            (x.State == "Active" || x.State == "Pending" && x.ExpiresAtUtc > now)))
            throw new GovernanceRuleException("An equivalent grant already exists.");

        var grant = new WorkspaceRoleGrant(Id, memberId, role, scope, scopeId, startsOn, endsOn,
            requiredApprovals, owner.Id, now);
        _roleGrants.Add(grant);
        Version++;
        return grant;
    }

    public void ApproveCustomRole(IdentityReference actor, WorkspaceRoleGrant grant, DateTimeOffset now)
    {
        var owner = RequireBusinessRoleOwner(actor);
        if (owner.Id == grant.MemberId || owner.Id == grant.RequestedBy) throw new GovernanceAccessException();
        if (!_roleGrants.Contains(grant) || grant.State != "Pending" || grant.ExpiresAtUtc <= now ||
            !Members.Any(x => x.Id == grant.RequestedBy && x.IsActive && x.Role == GovernanceRoles.Owner) ||
            !Members.Any(x => x.Id == grant.MemberId && x.IsActive) || FindCustomRole(grant.RoleId).Revision != grant.RoleRevision)
            throw new GovernanceRuleException("The role request is no longer current.");

        if (grant.Approve(owner.Id))
        {
            foreach (var previous in _roleGrants.Where(x => x.State == "Active" && x.MemberId == grant.MemberId &&
                x.RoleId == grant.RoleId && x.Scope == grant.Scope && x.ScopeId == grant.ScopeId &&
                x.StartsOn == grant.StartsOn && x.EndsOn == grant.EndsOn && !ReferenceEquals(x, grant)))
                previous.Revoke();
        }
        Version++;
    }

    public void RevokeCustomRole(IdentityReference actor, WorkspaceRoleGrant grant)
    {
        RequireBusinessRoleOwner(actor);
        if (!_roleGrants.Contains(grant) || grant.State == "Revoked")
            throw new GovernanceRuleException("The role grant is no longer current.");
        grant.Revoke();
        Version++;
    }

    public IEnumerable<WorkspaceRoleGrant> ActiveRoleGrants(WorkspaceMember member) =>
        _roleGrants.Where(grant => grant.MemberId == member.Id && member.IsActive && grant.State == "Active");

    private WorkspaceCustomRole FindCustomRole(Guid id) => _customRoles.SingleOrDefault(x => x.Id == id)
        ?? throw new GovernanceRuleException("The role does not belong to this workspace.");

    private static string NameOf(string? name) => name?.Trim() is { Length: > 0 and <= 80 } title
        ? title : throw new ArgumentException("Provide a name of up to 80 characters.");
}
