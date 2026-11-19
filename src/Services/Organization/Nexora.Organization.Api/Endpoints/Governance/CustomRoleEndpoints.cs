using Nexora.ServiceDefaults.Http;
using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Application;
using Nexora.Organization.Domain;
using Wolverine;
using Wolverine.Http;

namespace Nexora.Organization.Api;

public static class CustomRoleEndpoints
{
    private const string Root = "/api/workspaces/{id:guid}";

    [RequireWorkspacePermission(WorkspacePermissions.Assign), WolverineGet(Root + "/custom-roles")]
    public static Task<CustomRoleCatalog> Catalog(Guid id, CustomRoleUseCases useCases, ICurrentActor actor, CancellationToken ct) =>
        useCases.CatalogAsync(id, actor.GetRequired(), ct);

    [RequireWorkspacePermission(WorkspacePermissions.Read), WolverineGet(Root + "/departments")]
    public static Task<DepartmentView[]> Departments(Guid id, CustomRoleUseCases useCases, ICurrentActor actor, CancellationToken ct) =>
        useCases.DepartmentsAsync(id, actor.GetRequired(), ct);

    [RequireWorkspacePermission(WorkspacePermissions.Assign), WolverineGet(Root + "/role-grants")]
    public static Task<RoleGrantView[]> Grants(Guid id, CustomRoleUseCases useCases, ICurrentActor actor, CancellationToken ct) =>
        useCases.GrantsAsync(id, actor.GetRequired(), ct);

    [ApiWrite("expectedVersion", idempotent: false)]
    [RequireWorkspacePermission(WorkspacePermissions.BusinessRolesManage), WolverinePost(Root + "/custom-roles")]
    public static Task<CustomRoleView> Save(Guid id, SaveCustomRoleRequest request, ICurrentActor actor, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<CustomRoleView>(new SaveCustomRole(id, request.ExpectedVersion, request.RoleId, request.Name,
            request.Permissions, actor.GetRequired()), ct);

    [ApiWrite("expectedVersion", idempotent: false)]
    [RequireWorkspacePermission(WorkspacePermissions.BusinessRolesManage), WolverinePost(Root + "/departments")]
    public static Task<DepartmentView> AddDepartment(Guid id, CreateDepartmentRequest request, ICurrentActor actor, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<DepartmentView>(new CreateDepartment(id, request.ExpectedVersion, request.Name, actor.GetRequired()), ct);

    [ApiWrite("expectedVersion", idempotent: false)]
    [RequireWorkspacePermission(WorkspacePermissions.BusinessRolesManage), WolverinePost(Root + "/role-grants")]
    public static Task<RoleGrantView> Request(Guid id, RequestCustomRoleRequest request, ICurrentActor actor, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<RoleGrantView>(new RequestCustomRole(id, request.ExpectedVersion, request.MemberId, request.RoleId,
            request.RoleRevision, request.Scope, request.ScopeId, request.StartsOn, request.EndsOn, actor.GetRequired()), ct);

    [ApiWrite("expectedVersion", idempotent: false)]
    [RequireWorkspacePermission(WorkspacePermissions.BusinessRolesManage), WolverinePost(Root + "/role-grants/{grantId:guid}")]
    public static Task<RoleGrantView> Decide(Guid id, Guid grantId, DecideCustomRoleRequest request, ICurrentActor actor, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<RoleGrantView>(new DecideCustomRole(id, request.ExpectedVersion, grantId, request.Action, actor.GetRequired()), ct);
}
