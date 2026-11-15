using Nexora.ServiceDefaults.Http;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.HttpResults;
using Nexora.Finance.Application;
using Wolverine;
using Wolverine.Http;

namespace Nexora.Finance.Api;

public static partial class InvoiceMailEndpoints
{
    private const string Root = "/api/finance/workspaces/{workspaceId:guid}/receivables";

    [Authorize, WolverineGet(Root + "/documents/{id:guid}/dispatches")]
    public static Task<DispatchView[]> List(Guid workspaceId, Guid id, ReceivableUseCases service, IInvoiceDispatches dispatches, CancellationToken ct) =>
        service.DispatchesAsync(workspaceId, id, dispatches, ct);

    [Authorize, WolverineGet(Root + "/documents/{id:guid}/dispatches/{dispatchId:guid}")]
    public static Task<DispatchView> Detail(Guid workspaceId, Guid id, Guid dispatchId, ReceivableUseCases service,
        IInvoiceDispatches dispatches, CancellationToken ct) => service.DispatchDetailAsync(workspaceId, id, dispatchId, dispatches, ct);

    [IdempotentWrite]
    [Authorize, WolverinePost(Root + "/documents/{id:guid}/dispatches")]
    public static async Task<Created<DispatchView>> Queue(Guid workspaceId, Guid id, MailRequest request, IMessageBus bus, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<DispatchView>(new QueueInvoiceMail(workspaceId, request.OperationId, id, request.Recipient), ct);
        return TypedResults.Created($"/api/finance/workspaces/{workspaceId}/receivables/documents/{id}/dispatches/{result.Id}", result);
    }

    [IdempotentWrite("expectedVersion")]
    [Authorize, WolverinePost(Root + "/dispatches/{id:guid}/decision")]
    public static Task<DispatchView> Decide(Guid workspaceId, Guid id, MailDecision request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<DispatchView>(new DecideInvoiceMail(workspaceId, request.OperationId, id, request.ExpectedVersion, request.Decision), ct);
}
