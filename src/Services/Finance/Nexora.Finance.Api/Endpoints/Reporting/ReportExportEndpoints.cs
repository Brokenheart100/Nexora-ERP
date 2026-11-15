using Nexora.ServiceDefaults.Http;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Nexora.Finance.Application;
using Wolverine;
using Wolverine.Http;

namespace Nexora.Finance.Api;

public static partial class ReportExportEndpoints
{
    private const string Root = "/api/finance/workspaces/{workspaceId:guid}/report-exports";

    [Authorize, WolverineGet(Root)]
    public static Task<ReportExportView[]> List(Guid workspaceId, ReportExports exports, CancellationToken ct) => exports.ListAsync(workspaceId, ct);

    [Authorize, WolverineGet(Root + "/{id:guid}")]
    public static Task<ReportExportView> Detail(Guid workspaceId, Guid id, ReportExports exports, CancellationToken ct) => exports.DetailAsync(workspaceId, id, ct);

    [IdempotentWrite]
    [Authorize, WolverinePost(Root)]
    public static async Task<Created<ReportExportView>> Queue(Guid workspaceId, ExportRequest request, IMessageBus bus, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<ReportExportView>(new QueueReportExport(workspaceId, request.OperationId, request.Kind, request.From,
            request.Through, request.Compare, request.Watermark, request.Basis), ct);
        return CreatedJob(workspaceId, result);
    }

    [IdempotentWrite]
    [Authorize, WolverinePost(Root + "/{id:guid}/rebuild")]
    public static async Task<Created<ReportExportView>> Rebuild(Guid workspaceId, Guid id, RebuildRequest request, IMessageBus bus, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<ReportExportView>(new RebuildReportExport(workspaceId, request.OperationId, id), ct);
        return CreatedJob(workspaceId, result);
    }

    [Authorize, WolverineGet(Root + "/{id:guid}/file")]
    [ProducesResponseType(typeof(byte[]), StatusCodes.Status200OK, "text/csv")]
    public static async Task<IResult> Download(Guid workspaceId, Guid id, ReportExports exports, HttpContext context, CancellationToken ct)
    {
        var file = await exports.FileAsync(workspaceId, id, ct);
        context.Response.Headers.XContentTypeOptions = "nosniff";
        return Results.File(file.Bytes, "text/csv; charset=utf-8", file.Name);
    }

    private static Created<ReportExportView> CreatedJob(Guid workspaceId, ReportExportView result) =>
        TypedResults.Created($"/api/finance/workspaces/{workspaceId}/report-exports/{result.Id}", result);
}
