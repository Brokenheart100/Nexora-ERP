using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Nexora.BuildingBlocks.Application;
using Nexora.Sales.Application;
using Wolverine.Http;

namespace Nexora.Sales.Api;

public static class RecordChangeEndpoints
{
    private const string Root = "/api/sales/workspaces/{workspaceId:guid}/record-changes";

    [Authorize, WolverineGet(Root)]
    public static Task<RecordChangePage> List(Guid workspaceId, [FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? through,
        [FromQuery] string? actor, [FromQuery] string? entityName, [FromQuery] string? operation, [FromQuery] Guid? entityId,
        [FromQuery] int? page, [FromQuery] int? pageSize, RecordChangeQueries queries, CancellationToken ct) =>
        queries.ListAsync(workspaceId, new(from, through, actor, entityName, operation, entityId, page ?? 1, pageSize ?? AuditQuery.DefaultPageSize), ct);

    [Authorize, WolverineGet(Root + ".csv")]
    public static async Task<IResult> Download(Guid workspaceId, [FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? through,
        [FromQuery] string? actor, [FromQuery] string? entityName, [FromQuery] string? operation, [FromQuery] Guid? entityId,
        [FromQuery] int? page, [FromQuery] int? pageSize, RecordChangeQueries queries, CancellationToken ct)
    {
        var csv = await queries.ExportAsync(workspaceId, new(from, through, actor, entityName, operation, entityId, page ?? 1, pageSize ?? AuditQuery.DefaultPageSize), ct);
        return Results.File(System.Text.Encoding.UTF8.GetBytes(csv), "text/csv; charset=utf-8", $"record-changes-workspaceId.csv");
    }
}
