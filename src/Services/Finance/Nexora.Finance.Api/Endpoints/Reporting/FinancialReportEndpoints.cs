using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Nexora.Finance.Application;
using Wolverine.Http;

namespace Nexora.Finance.Api;

public static class FinancialReportEndpoints
{
    private const string Root = "/api/finance/workspaces/{workspaceId:guid}/reports/{kind}";

    [Authorize, WolverineGet(Root)]
    public static Task<FinancialReport> Read(Guid workspaceId, string kind, [FromQuery] DateOnly from, [FromQuery] DateOnly through,
        [FromQuery] bool? compare, [FromQuery] long? watermark, [FromQuery] string? basis, FinancialReports reports, CancellationToken ct) =>
        reports.ReadAsync(workspaceId, kind, from, through, compare ?? false, watermark, basis, ct);

    [Authorize, WolverineGet(Root + "/pdf")]
    [ProducesResponseType(typeof(byte[]), StatusCodes.Status200OK, "application/pdf")]
    public static async Task<IResult> Pdf(Guid workspaceId, string kind, [FromQuery] DateOnly from, [FromQuery] DateOnly through,
        [FromQuery] bool? compare, [FromQuery] long? watermark, [FromQuery] string? basis, FinancialReports reports,
        IFinancialReportPdf renderer, HttpContext context, CancellationToken ct)
    {
        var report = await reports.ReadAsync(workspaceId, kind, from, through, compare ?? false, watermark, basis, ct);
        var file = await renderer.RenderAsync(report, ct);
        context.Response.Headers.XContentTypeOptions = "nosniff";
        return Results.File(file.Bytes, "application/pdf", file.FileName);
    }

    [Authorize, WolverineGet(Root + "/rows/{row}")]
    public static Task<FinancialDrill> Drill(Guid workspaceId, string kind, string row, [FromQuery] DateOnly from, [FromQuery] DateOnly through,
        [FromQuery] long? watermark, [FromQuery] int? page, [FromQuery] string? basis, FinancialReports reports, CancellationToken ct) =>
        reports.DrillAsync(workspaceId, kind, row, from, through, watermark ?? throw new ArgumentException("A report watermark is required."), page ?? 1, basis, ct);
}
