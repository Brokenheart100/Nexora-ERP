using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Application;
using Wolverine.Http;

namespace Nexora.Finance.Api;

public static class OpenItemEndpoints
{
    private const string Root = "/api/finance/workspaces/{workspaceId:guid}/reporting";

    [Authorize, WolverineGet(Root + "/aging/{kind}")]
    public static async Task<AgingReport> Aging(Guid workspaceId, string kind, [FromQuery] DateOnly through, [FromQuery] long? watermark,
        [FromQuery] int? page, [FromQuery] int? pageSize, OpenItemReports reports, CancellationToken ct)
    {
        var window = PageWindow.Optional(page, pageSize);
        var report = await reports.AgingAsync(workspaceId, kind, through, watermark, ct);
        return window is { } slice ? report with { Items = report.Items.Skip(slice.Offset).Take(slice.Size).ToArray() } : report;
    }

    [Authorize, WolverineGet(Root + "/overview")]
    public static Task<FinanceOverview> Overview(Guid workspaceId, [FromQuery] DateOnly from, [FromQuery] DateOnly through,
        [FromQuery] long? watermark, OpenItemReports reports, CancellationToken ct) =>
        reports.OverviewAsync(workspaceId, from, through, watermark, ct);

    [Authorize, WolverineGet(Root + "/partner-ledgers/{kind}/{partnerId:guid}")]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest, "application/problem+json")]
    public static Task<PartnerLedger> PartnerLedger(Guid workspaceId, string kind, Guid partnerId, [FromQuery] DateOnly from,
        [FromQuery] DateOnly through, [FromQuery] long? watermark, [FromQuery] int? page, [FromQuery] int? pageSize,
        PartnerLedgers reports, CancellationToken ct) =>
        reports.ReadAsync(workspaceId, kind, partnerId, from, through, watermark,
            new PageWindow(page ?? 1, pageSize ?? PageWindow.DefaultSize), ct);
}
