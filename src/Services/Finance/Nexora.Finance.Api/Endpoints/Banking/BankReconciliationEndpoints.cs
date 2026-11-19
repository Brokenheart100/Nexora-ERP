using Microsoft.AspNetCore.Mvc;
using Nexora.ServiceDefaults.Http;
using Microsoft.AspNetCore.Authorization;
using Nexora.Finance.Application;
using Nexora.Finance.Domain;
using Wolverine;
using Wolverine.Http;

namespace Nexora.Finance.Api;

public static partial class BankReconciliationEndpoints
{
    private const string Root = "/api/finance/workspaces/{workspaceId:guid}/trade";
    private const string Bank = Root + "/banks/{bankId:guid}/reconciliations";

    [Authorize, WolverineGet(Bank)]
    public static Task<ReconciliationView[]> List(Guid workspaceId, Guid bankId, BankReconciliations service, CancellationToken ct) =>
        service.ListAsync(workspaceId, bankId, ct);

    [Authorize, WolverinePost(Bank + "/preview")]
    public static Task<BankReconciliationSnapshot> Preview(Guid workspaceId, Guid bankId, PreviewRequest request,
        BankReconciliations service, CancellationToken ct) => service.PreviewAsync(workspaceId, bankId, request.Through, request.StatementBalance, ct);

    [ApiWrite]
    [Authorize, WolverinePost(Bank)]
    public static Task<ReconciliationView> Prepare(Guid workspaceId, Guid bankId, PrepareRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<ReconciliationView>(new PrepareReconciliation(workspaceId, request.OperationId, bankId, request.Through, request.StatementBalance), ct);

    [Authorize, WolverineGet(Root + "/reconciliations/{id:guid}/pdf")]
    [ProducesResponseType(typeof(byte[]), StatusCodes.Status200OK, "application/pdf")]
    public static async Task<IResult> Pdf(Guid workspaceId, Guid id, BankReconciliations service, IReconciliationRenderer renderer,
        HttpContext context, CancellationToken ct)
    {
        var file = await service.PdfAsync(workspaceId, id, renderer, ct);
        context.Response.Headers.XContentTypeOptions = "nosniff";
        return Results.File(file.Bytes, "application/pdf", file.FileName);
    }

    [ApiWrite("expectedVersion")]
    [Authorize, WolverinePost(Root + "/reconciliations/{id:guid}/decision")]
    public static Task<ReconciliationView> Decide(Guid workspaceId, Guid id, DecisionRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<ReconciliationView>(new DecideReconciliation(workspaceId, request.OperationId, id, request.ExpectedVersion,
            request.Decision, request.Reason), ct);
}
