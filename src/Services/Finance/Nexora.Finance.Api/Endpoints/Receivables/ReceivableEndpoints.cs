using Nexora.ServiceDefaults.Http;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Nexora.Finance.Application;
using Wolverine;
using Wolverine.Http;

namespace Nexora.Finance.Api;

public static partial class ReceivableEndpoints
{
    private const string Root = "/api/finance/workspaces/{workspaceId:guid}/receivables";

    [Authorize, WolverineGet(Root)]
    public static Task<ReceivableHome> Home(Guid workspaceId, ReceivableUseCases service, CancellationToken ct) =>
        service.HomeAsync(workspaceId, ct);

    [Authorize, WolverineGet(Root + "/shipments")]
    public static Task<ShipmentAllowance[]> Shipments(Guid workspaceId, [FromQuery] int? page, ReceivableUseCases service, CancellationToken ct) =>
        service.ShipmentsAsync(workspaceId, page ?? 1, ct);

    [Authorize, WolverineGet(Root + "/documents")]
    public static Task<CustomerDocumentView[]> Documents(Guid workspaceId, [FromQuery] int? page, ReceivableUseCases service, CancellationToken ct) =>
        service.ListAsync(workspaceId, page ?? 1, ct);

    [IdempotentWrite]
    [Authorize, WolverinePost(Root + "/setup")]
    public static Task<TradeChange> Setup(Guid workspaceId, SetupRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<TradeChange>(new ConfigureReceivables(workspaceId, request.OperationId, request.Accounts), ct);

    [IdempotentWrite]
    [Authorize, WolverinePost(Root + "/documents")]
    public static Task<TradeChange> Submit(Guid workspaceId, SubmitRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<TradeChange>(new SubmitCustomerDocument(workspaceId, request.OperationId, request.Draft), ct);

    [IdempotentWrite("expectedVersion")]
    [Authorize, WolverinePut(Root + "/documents/{id:guid}")]
    public static Task<TradeChange> Revise(Guid workspaceId, Guid id, ReviseRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<TradeChange>(new ReviseCustomerInvoice(workspaceId, request.OperationId, id, request.ExpectedVersion, request.Draft), ct);

    [IdempotentWrite("expectedVersion")]
    [Authorize, WolverinePost(Root + "/documents/{id:guid}/decision")]
    public static Task<TradeChange> Decide(Guid workspaceId, Guid id, DecisionRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<TradeChange>(new DecideCustomerDocument(workspaceId, request.OperationId, id, request.ExpectedVersion, request.Approve), ct);
}
