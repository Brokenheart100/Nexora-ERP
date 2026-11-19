using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Nexora.Finance.Application;
using Nexora.ServiceDefaults.Http;
using Wolverine;
using Wolverine.Http;

namespace Nexora.Finance.Api;

public static class OpeningSubledgerEndpoints
{
    private const string Root = "/api/finance/workspaces/{workspaceId:guid}/ledger/opening-subledgers";

    [Authorize, WolverineGet(Root)]
    public static async Task<OpeningSubledgerView[]> Latest(Guid workspaceId, OpeningSubledgers service, CancellationToken ct) =>
        await service.LatestAsync(workspaceId, ct) is { } batch ? [batch] : [];

    [Authorize, RevisionTagged, WolverineGet(Root + "/{id:guid}")]
    public static async Task<OpeningSubledgerView> Detail(Guid workspaceId, Guid id, HttpResponse response,
        OpeningSubledgers service, CancellationToken ct)
    {
        var result = await service.DetailAsync(workspaceId, id, ct);
        ApiIdempotency.SetRevision(response, result.Version);
        return result;
    }

    [Authorize, WolverinePost(Root + "/preview")]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest, "application/problem+json")]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict, "application/problem+json")]
    public static Task<OpeningSubledgerPreview> Preview(Guid workspaceId, OpeningSubledgerPreviewRequest request,
        OpeningSubledgers service, CancellationToken ct) =>
        service.PreviewAsync(workspaceId, request.EquityAccountId, request.File, ct);

    [Authorize, ApiWrite, WolverinePost(Root)]
    public static async Task<Created<OpeningSubledgerView>> Submit(Guid workspaceId, OpeningSubledgerSubmitRequest request,
        IMessageBus bus, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<OpeningSubledgerView>(new SubmitOpeningSubledger(workspaceId, request.OperationId,
            request.EquityAccountId, request.File, request.FileHash, request.ChartRevision), ct);
        return TypedResults.Created($"/api/finance/workspaces/{workspaceId}/ledger/opening-subledgers/{result.Id}", result);
    }

    [Authorize, ApiWrite("expectedVersion"), WolverinePost(Root + "/{id:guid}/decision")]
    public static Task<OpeningSubledgerView> Decide(Guid workspaceId, Guid id, OpeningSubledgerDecisionRequest request,
        IMessageBus bus, CancellationToken ct) => bus.InvokeAsync<OpeningSubledgerView>(
            new DecideOpeningSubledger(workspaceId, id, request.OperationId, request.ExpectedVersion, request.Decision), ct);
}
