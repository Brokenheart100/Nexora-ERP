using Nexora.ServiceDefaults.Http;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.HttpResults;
using Nexora.Inventory.Application;
using Wolverine;
using Wolverine.Http;

namespace Nexora.Inventory.Api;

public static partial class StockOperationEndpoints
{
    private const string Root = "/api/inventory/workspaces/{workspaceId:guid}";
    private const string Warehouse = Root + "/warehouses/{id:guid}/stock-operations";

    [Authorize, WolverineGet(Warehouse)]
    public static Task<StockOperationView[]> List(Guid workspaceId, Guid id, InventoryUseCases service,
        IStockOperations operations, CancellationToken ct) => service.OperationsAsync(workspaceId, id, operations, ct);

    [Authorize, WolverineGet(Warehouse + "/{operationId:guid}")]
    public static Task<StockOperationView> Detail(Guid workspaceId, Guid id, Guid operationId, InventoryUseCases service,
        IStockOperations operations, CancellationToken ct) => service.OperationAsync(workspaceId, id, operationId, operations, ct);

    [Authorize, WolverineGet(Warehouse + "/destinations")]
    public static Task<TransferDestination[]> Destinations(Guid workspaceId, Guid id, InventoryUseCases service, CancellationToken ct) =>
        service.DestinationsAsync(workspaceId, id, ct);

    [ApiWrite("expectedSequence")]
    [Authorize, WolverinePost(Warehouse)]
    public static async Task<Created<InventoryChange>> Prepare(Guid workspaceId, Guid id, PrepareRequest request, IMessageBus bus, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<InventoryChange>(new PrepareStockOperation(workspaceId, request.OperationId, id, request.ItemId,
            request.DestinationId, request.ExpectedSequence, request.On, request.Quantity, request.Reason), ct);
        return TypedResults.Created($"/api/inventory/workspaces/{workspaceId}/warehouses/{id}/stock-operations/{result.Id}", result);
    }

    [ApiWrite("expectedVersion")]
    [Authorize, WolverinePost(Root + "/stock-operations/{id:guid}/receive")]
    public static Task<InventoryChange> Receive(Guid workspaceId, Guid id, ReceiveRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<InventoryChange>(new ReceiveStockTransfer(workspaceId, request.OperationId, id, request.ExpectedVersion, request.On), ct);

    [ApiWrite("expectedVersion")]
    [Authorize, WolverinePost(Root + "/stock-operations/{id:guid}/decision")]
    public static Task<InventoryChange> Decide(Guid workspaceId, Guid id, DecideRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<InventoryChange>(new DecideStockOperation(workspaceId, request.OperationId, id, request.ExpectedVersion, request.Confirm), ct);
}
