using Microsoft.AspNetCore.Mvc;
using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Application;
using Nexora.Organization.Domain;
using Wolverine.Http;

namespace Nexora.Organization.Api;

public static class RecordChangeEndpoints
{
    private const string Root = "/api/workspaces/{id:guid}/record-changes";

    [RequireWorkspacePermission(WorkspacePermissions.Audit), WolverineGet(Root)]
    public static Task<RecordChangePage> List(Guid id, [FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? through,
        [FromQuery] string? actor, [FromQuery] string? entityName, [FromQuery] string? operation, [FromQuery] Guid? entityId,
        [FromQuery] int? page, [FromQuery] int? pageSize, RecordChangeQueries queries, ICurrentActor currentActor, CancellationToken ct) =>
        queries.ListAsync(id, new(from, through, actor, entityName, operation, entityId, page ?? 1, pageSize ?? AuditQuery.DefaultPageSize), currentActor.GetRequired(), ct);

    [RequireWorkspacePermission(WorkspacePermissions.Audit), WolverineGet(Root + ".csv")]
    public static async Task<IResult> Download(Guid id, [FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? through,
        [FromQuery] string? actor, [FromQuery] string? entityName, [FromQuery] string? operation, [FromQuery] Guid? entityId,
        [FromQuery] int? page, [FromQuery] int? pageSize, RecordChangeQueries queries, ICurrentActor currentActor, CancellationToken ct)
    {
        var csv = await queries.ExportAsync(id, new(from, through, actor, entityName, operation, entityId, page ?? 1, pageSize ?? AuditQuery.DefaultPageSize), currentActor.GetRequired(), ct);
        return Results.File(System.Text.Encoding.UTF8.GetBytes(csv), "text/csv; charset=utf-8", $"record-changes-id.csv");
    }
}
