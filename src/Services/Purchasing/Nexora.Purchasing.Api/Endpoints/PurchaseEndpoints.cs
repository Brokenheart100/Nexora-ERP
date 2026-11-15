using Nexora.ServiceDefaults.Http;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Nexora.BuildingBlocks.Application;
using Nexora.Purchasing.Application;
using Wolverine;
using Wolverine.Http;

namespace Nexora.Purchasing.Api;

public static partial class PurchaseEndpoints
{
    private const string Orders = "/api/purchasing/workspaces/{workspaceId:guid}/orders";
    private const string Order = Orders + "/{id:guid}";

    [Authorize, WolverineGet(Orders)]
    public static Task<PurchaseList> List(Guid workspaceId, [FromQuery] int? page, [FromQuery] int? pageSize, PurchaseQueries queries, CancellationToken ct) =>
        queries.PageAsync(workspaceId, new PageWindow(page ?? 1, pageSize ?? PageWindow.DefaultSize), ct);

    [Authorize, WolverineGet(Order)]
    public static Task<PurchaseDetail> Detail(Guid workspaceId, Guid id, PurchaseQueries queries, CancellationToken ct) =>
        queries.DetailAsync(workspaceId, id, ct);

    [IdempotentWrite]
    [Authorize, WolverinePost(Orders)]
    public static async Task<Created<PurchaseChange>> Create(Guid workspaceId, CreateRequest request, IMessageBus bus, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<PurchaseChange>(new CreatePurchase(workspaceId, request.OperationId, request.Number, request.Draft), ct);
        return TypedResults.Created($"/api/purchasing/workspaces/{workspaceId}/orders/{result.Id}", result);
    }

    [IdempotentWrite("expectedVersion")]
    [Authorize, WolverinePut(Order)]
    public static Task<PurchaseChange> Edit(Guid workspaceId, Guid id, EditRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<PurchaseChange>(new EditPurchase(workspaceId, request.OperationId, id, request.ExpectedVersion, request.Draft), ct);

    [IdempotentWrite("expectedVersion")]
    [Authorize, WolverinePost(Order + "/decision")]
    public static Task<PurchaseChange> Decide(Guid workspaceId, Guid id, DecisionRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<PurchaseChange>(new DecidePurchase(workspaceId, request.OperationId, id, request.ExpectedVersion, request.Decision, request.Reason), ct);
}
