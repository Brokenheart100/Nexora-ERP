using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Application;
using Wolverine.Http;

namespace Nexora.Finance.Api;

public static class FinanceAuditEndpoints
{
    private const string Root = "/api/finance/workspaces/{workspaceId:guid}/audit";

    [Authorize, WolverineGet(Root)]
    public static Task<AuditPage> List(Guid workspaceId, [FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? through,
        [FromQuery] string? actor, [FromQuery] string? action, [FromQuery] Guid? targetId,
        [FromQuery] int? page, [FromQuery] int? pageSize, FinanceAuditQueries queries, CancellationToken ct) =>
        queries.ListAsync(workspaceId, new(from, through, actor, action, targetId, page ?? 1, pageSize ?? AuditQuery.DefaultPageSize), ct);
}
