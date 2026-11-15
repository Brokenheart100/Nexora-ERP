using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Domain;

namespace Nexora.Organization.Application;

public sealed class CustomRoleUseCases(IWorkspaceRepository workspaces, IApplicationAuthorization authorization,
    IWarehouseScopeDirectory warehouseDirectory, IWorkspacePreferencesRepository preferences, TimeProvider clock)
{
    public async Task<CustomRoleCatalog> CatalogAsync(Guid workspaceId, ActorContext actor, CancellationToken ct)
    {
        var workspace = await LoadAsync(workspaceId, actor, WorkspacePermissions.Assign, ct);
        return new(workspace.CustomRoles.OrderBy(role => role.Name).Select(Role).ToArray(),
            WorkspacePermissions.All.Select(code => new PermissionOption(code, CustomRolePolicy.Scopes(code)))
                .Where(option => option.Scopes.Count > 0).ToArray());
    }

    public async Task<DepartmentView[]> DepartmentsAsync(Guid workspaceId, ActorContext actor, CancellationToken ct)
    {
        var workspace = await LoadAsync(workspaceId, actor, WorkspacePermissions.Read, ct);
        return workspace.Departments.OrderBy(department => department.Name).Select(Department).ToArray();
    }

    public async Task<RoleGrantView[]> GrantsAsync(Guid workspaceId, ActorContext actor, CancellationToken ct)
    {
        var workspace = await LoadAsync(workspaceId, actor, WorkspacePermissions.Assign, ct);
        var now = clock.GetUtcNow();
        return workspace.RoleGrants.Where(grant => grant.State != "Revoked").Select(grant => Grant(grant, now)).ToArray();
    }

    public async Task<GovernanceOutcome<CustomRoleView>> SaveAsync(SaveCustomRole command, CancellationToken ct)
    {
        var workspace = await ForMutationAsync(command.WorkspaceId, command.Actor, command.ExpectedVersion, ct);
        var previous = workspace.Version;
        var role = workspace.SaveCustomRole(Identity(command.Actor), command.RoleId, command.Name, command.Permissions);
        return Result(workspace, Role(role), "custom-role.saved", role.Id, previous != workspace.Version);
    }

    public async Task<GovernanceOutcome<DepartmentView>> AddAsync(CreateDepartment command, CancellationToken ct)
    {
        var workspace = await ForMutationAsync(command.WorkspaceId, command.Actor, command.ExpectedVersion, ct);
        var department = workspace.AddDepartment(Identity(command.Actor), command.Name);
        return Result(workspace, Department(department), "department.created", department.Id);
    }

    public async Task<GovernanceOutcome<RoleGrantView>> RequestAsync(RequestCustomRole command, CancellationToken ct)
    {
        var workspace = await ForMutationAsync(command.WorkspaceId, command.Actor, command.ExpectedVersion, ct);
        var now = clock.GetUtcNow();
        if (command.Scope == CustomRolePolicy.Warehouse && command.ScopeId is { } id && id != Guid.Empty)
            await warehouseDirectory.DemandWarehouseAsync(new(workspace.TenantId, workspace.Id), id, ct);
        var settings = await preferences.FindAsync(new(workspace.TenantId, workspace.Id), ct);
        var approvals = settings?.RoleGrantApprovals ?? WorkspacePreferences.DefaultRoleGrantApprovals;
        var grant = workspace.RequestCustomRole(Identity(command.Actor), command.MemberId, command.RoleId,
            command.RoleRevision, command.Scope, command.ScopeId, command.StartsOn, command.EndsOn, approvals, now);
        return Result(workspace, Grant(grant, now), "custom-role.requested", grant.Id);
    }

    public async Task<GovernanceOutcome<RoleGrantView>> DecideAsync(DecideCustomRole command, CancellationToken ct)
    {
        var workspace = await ForMutationAsync(command.WorkspaceId, command.Actor, command.ExpectedVersion, ct);
        var grant = workspace.RoleGrants.SingleOrDefault(x => x.Id == command.GrantId) ?? throw new ResourceNotFoundException();
        var now = clock.GetUtcNow();
        switch (command.Action)
        {
            case "approve":
                var proposer = workspace.Members.Single(x => x.Id == grant.RequestedBy);
                await authorization.DemandAsync(new(proposer.Issuer, proposer.Subject), new(workspace.TenantId, workspace.Id),
                    WorkspacePermissions.BusinessRolesManage, ct);
                if (grant.Scope == CustomRolePolicy.Warehouse && grant.ScopeId is { } warehouseId)
                    await warehouseDirectory.DemandWarehouseAsync(new(workspace.TenantId, workspace.Id), warehouseId, ct);
                workspace.ApproveCustomRole(Identity(command.Actor), grant, now);
                break;
            case "revoke":
                workspace.RevokeCustomRole(Identity(command.Actor), grant);
                break;
            default:
                throw new ArgumentException("Unknown grant action.");
        }
        return Result(workspace, Grant(grant, now), "custom-role." + grant.State.ToLowerInvariant(), grant.Id);
    }

    private async Task<Workspace> ForMutationAsync(Guid id, ActorContext actor, long expectedVersion, CancellationToken ct)
    {
        var workspace = await LoadAsync(id, actor, WorkspacePermissions.BusinessRolesManage, ct);
        if (workspace.Version != expectedVersion) throw new BusinessConflictException("Authorization version changed; reload the workspace.");
        return workspace;
    }

    private async Task<Workspace> LoadAsync(Guid id, ActorContext actor, string permission, CancellationToken ct)
    {
        var workspace = await workspaces.FindAsync(id, ct) ?? throw new ResourceNotFoundException();
        await authorization.DemandAsync(actor, new(workspace.TenantId, id), permission, ct);
        if (workspace.IsPersonal) throw new ResourceNotFoundException();
        return workspace;
    }

    private static IdentityReference Identity(ActorContext actor) => new(actor.Issuer, actor.Subject);
    private static CustomRoleView Role(WorkspaceCustomRole role) => new(role.Id, role.Name, role.Revision, role.Permissions);
    private static DepartmentView Department(WorkspaceDepartment department) => new(department.Id, department.Name);
    private static RoleGrantView Grant(WorkspaceRoleGrant grant, DateTimeOffset now) => new(grant.Id, grant.MemberId, grant.RoleId,
        grant.RoleRevision, grant.Scope, grant.ScopeId, grant.StartsOn, grant.EndsOn, grant.RequiredApprovals,
        grant.ApprovalCount, grant.Permissions,
        grant.State == "Pending" && grant.ExpiresAtUtc <= now ? "Expired" : grant.State,
        grant.RequestedBy, grant.FirstApprovedBy, grant.ApprovedBy, grant.ExpiresAtUtc);
    private static GovernanceOutcome<T> Result<T>(Workspace workspace, T result, string action, Guid id, bool changed = true) =>
        new(result, workspace.TenantId, workspace.Id, workspace.Version, action, id, changed);
}
