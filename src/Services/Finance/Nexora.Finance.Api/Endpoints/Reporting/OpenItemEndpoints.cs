using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Nexora.Finance.Application;
using Wolverine.Http;

namespace Nexora.Finance.Api;

public static class OpenItemEndpoints
{
    private const string Root = "/api/finance/workspaces/{workspaceId:guid}/reporting";

    [Authorize, WolverineGet(Root + "/aging/{kind}")]
    public static Task<AgingReport> Aging(Guid workspaceId, string kind, [FromQuery] DateOnly through,
        [FromQuery] long? watermark, OpenItemReports reports, CancellationToken ct) =>
        reports.AgingAsync(workspaceId, kind, through, watermark, ct);

    [Authorize, WolverineGet(Root + "/overview")]
    public static Task<FinanceOverview> Overview(Guid workspaceId, [FromQuery] DateOnly from, [FromQuery] DateOnly through,
        [FromQuery] long? watermark, OpenItemReports reports, CancellationToken ct) =>
        reports.OverviewAsync(workspaceId, from, through, watermark, ct);
}
