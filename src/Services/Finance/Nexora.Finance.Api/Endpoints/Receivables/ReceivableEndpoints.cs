using Nexora.ServiceDefaults.Http;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Nexora.Finance.Application;
using Wolverine;
using Wolverine.Http;

namespace Nexora.Finance.Api;

public static partial class ReceivableEndpoints
{
    private const string Root = "/api/finance/workspaces/{workspaceId:guid}/receivables";
    private const string Numbering = Root + "/invoice-numbering";

    [Authorize, WolverineGet(Numbering)]
    public static Task<InvoiceNumberingView> GetNumbering(Guid workspaceId, ReceivableUseCases service, CancellationToken ct) =>
        service.NumberingAsync(workspaceId, ct);

    [Authorize, ApiWrite("expectedVersion"), WolverinePut(Numbering)]
    public static Task<InvoiceNumberingView> PutNumbering(Guid workspaceId, InvoiceNumberingRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<InvoiceNumberingView>(
            new ConfigureInvoiceNumbering(workspaceId, request.OperationId, request.ExpectedVersion, request.Pattern, request.StartingNumber), ct);

    [Authorize, WolverineGet(Numbering + "/preview")]
    public static Task<InvoiceNumberPreview> PreviewNumber(Guid workspaceId, [FromQuery] DateOnly on, ReceivableUseCases service, CancellationToken ct) =>
        service.PreviewNumberAsync(workspaceId, on, ct);

    [Authorize, WolverineGet(Root)]
    public static Task<ReceivableHome> Home(Guid workspaceId, ReceivableUseCases service, CancellationToken ct) =>
        service.HomeAsync(workspaceId, ct);

    [Authorize, WolverineGet(Root + "/shipments")]
    public static Task<ShipmentAllowance[]> Shipments(Guid workspaceId, [FromQuery] int? page, ReceivableUseCases service, CancellationToken ct) =>
        service.ShipmentsAsync(workspaceId, page ?? 1, ct);

    [Authorize, WolverineGet(Root + "/documents")]
    public static Task<CustomerDocumentView[]> Documents(Guid workspaceId, [FromQuery] int? page, ReceivableUseCases service, CancellationToken ct) =>
        service.ListAsync(workspaceId, page ?? 1, ct);
    [Authorize, WolverineGet(Root + "/invoices")]
    public static Task<CustomerDocumentView[]> PostedInvoices(Guid workspaceId, [FromQuery] int? page, ReceivableUseCases service, CancellationToken ct) =>
        service.ListAsync(workspaceId, page ?? 1, ct, postedInvoicesOnly: true);

    [Authorize, WolverineGet(Root + "/documents/{id:guid}")]
    public static Task<CustomerDocumentView> Detail(Guid workspaceId, Guid id, ReceivableUseCases service, CancellationToken ct) =>
        service.DetailAsync(workspaceId, id, ct);

    [ApiWrite]
    [Authorize, WolverinePost(Root + "/setup")]
    public static Task<TradeChange> Setup(Guid workspaceId, SetupRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<TradeChange>(new ConfigureReceivables(workspaceId, request.OperationId, request.Accounts), ct);

    [ApiWrite]
    [Authorize, WolverinePost(Root + "/documents")]
    public static async Task<Created<TradeChange>> Submit(Guid workspaceId, SubmitRequest request, IMessageBus bus, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<TradeChange>(new SubmitCustomerDocument(workspaceId, request.OperationId, request.Draft), ct);
        return TypedResults.Created($"/api/finance/workspaces/{workspaceId}/receivables/documents/{result.Id}", result);
    }

    [ApiWrite("expectedVersion")]
    [Authorize, WolverinePut(Root + "/documents/{id:guid}")]
    public static Task<TradeChange> Revise(Guid workspaceId, Guid id, ReviseRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<TradeChange>(new ReviseCustomerInvoice(workspaceId, request.OperationId, id, request.ExpectedVersion, request.Draft), ct);

    [ApiWrite("expectedVersion")]
    [Authorize, WolverinePost(Root + "/documents/{id:guid}/decision")]
    public static Task<TradeChange> Decide(Guid workspaceId, Guid id, DecisionRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<TradeChange>(new DecideCustomerDocument(workspaceId, request.OperationId, id, request.ExpectedVersion, request.Approve,
            request.ExpectedNumber), ct);
}
