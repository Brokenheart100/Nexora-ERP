using Microsoft.AspNetCore.Authorization;
using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Application;

namespace Nexora.Organization.Api;

public sealed record WorkspacePermissionRequirement(string Permission) : IAuthorizationRequirement;
public sealed class RequireWorkspacePermissionAttribute(string permission) : AuthorizeAttribute(permission);

public sealed class WorkspacePermissionHandler(IWorkspaceRepository workspaces, IApplicationAuthorization authorization, ICurrentActor actor)
    : AuthorizationHandler<WorkspacePermissionRequirement>
{
    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context, WorkspacePermissionRequirement requirement)
    {
        if (context.User.Identity?.IsAuthenticated != true || context.Resource is not HttpContext http
            || !Guid.TryParse(http.Request.RouteValues["id"]?.ToString(), out var id)) return;
        var workspace = await workspaces.FindAsync(id, http.RequestAborted);
        if (workspace is not null && (await authorization.CheckAsync(actor.GetRequired(), new(workspace.TenantId, id), requirement.Permission, http.RequestAborted)).Allowed)
            context.Succeed(requirement);
    }
}
