using Nexora.ServiceDefaults.Http;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.HttpResults;
using Nexora.Finance.Application;
using Wolverine;
using Wolverine.Http;

namespace Nexora.Finance.Api;

public static class ChartEndpoints
{
    private const string Root = "/api/finance/workspaces/{workspaceId:guid}/chart";

    [Authorize, WolverineGet(Root)]
    public static Task<ChartView> Read(Guid workspaceId, ChartUseCases useCases, CancellationToken ct) =>
        useCases.ReadAsync(workspaceId, ct);

    [Authorize, WolverineGet(Root + "/exports/{kind}")]
    public static async Task<IResult> Export(Guid workspaceId, string kind, ChartUseCases useCases, CancellationToken ct) =>
        Results.Json(await useCases.ExportAsync(workspaceId, kind, ct));

    [ApiWrite("expectedRevision")]
    [Authorize, WolverinePost(Root + "/accounts")]
    public static Task<ChartRevisionResult> Save(Guid workspaceId, SaveChartAccountRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<ChartRevisionResult>(new SaveChartAccount(workspaceId, request.OperationId, request.ExpectedRevision,
            request.ExpectedVersion, request.Account), ct);

    [Authorize, WolverinePost(Root + "/imports/preview")]
    public static async Task<Results<Created<ChartPreviewView>, Ok<ChartPreviewView>>> Preview(Guid workspaceId,
        PreviewChartImportRequest request, IMessageBus bus, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<ChartPreviewView>(new PreviewChartImport(workspaceId, request.Mode, request.Format, request.File), ct);
        return result.PreviewId is { } id ? TypedResults.Created($"/api/finance/workspaces/{workspaceId}/chart/imports/{id}", result)
            : TypedResults.Ok(result);
    }

    [Authorize, WolverineGet(Root + "/imports/{id:guid}")]
    public static Task<ChartImportStatus> ImportStatus(Guid workspaceId, Guid id, ChartUseCases service, CancellationToken ct) =>
        service.ImportStatusAsync(workspaceId, id, ct);

    [ApiWrite]
    [Authorize, WolverinePost(Root + "/imports/{previewId:guid}/commit")]
    public static Task<ChartRevisionResult> Commit(Guid workspaceId, Guid previewId, CommitChartImportRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<ChartRevisionResult>(new CommitChartImport(workspaceId, previewId, request.OperationId), ct);
}
