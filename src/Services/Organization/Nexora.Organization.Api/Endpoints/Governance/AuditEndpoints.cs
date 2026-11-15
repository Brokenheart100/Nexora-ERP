using Microsoft.AspNetCore.Mvc;
using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Application;
using Nexora.Organization.Domain;
using Wolverine.Http;

namespace Nexora.Organization.Api;

public static class AuditEndpoints
{
    private const string WorkspaceAudit = "/api/workspaces/{id:guid}/audit";

    [RequireWorkspacePermission(WorkspacePermissions.Audit), WolverineGet(WorkspaceAudit)]
    public static Task<AuditPage> List(Guid id, [FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? through,
        [FromQuery] string? actor, [FromQuery] string? action, [FromQuery] Guid? targetId,
        [FromQuery] int? page, [FromQuery] int? pageSize, WorkspaceAuditQueries queries, ICurrentActor currentActor,
        CancellationToken cancellationToken) =>
        queries.ListAsync(id, new(from, through, actor, action, targetId, page ?? 1, pageSize ?? AuditQuery.DefaultPageSize),
            currentActor.GetRequired(), cancellationToken);
}
