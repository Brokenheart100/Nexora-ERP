using Nexora.ServiceDefaults.Http;
using Microsoft.AspNetCore.Authorization;
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

    [Authorize, WolverineGet(Warehouse + "/destinations")]
    public static Task<TransferDestination[]> Destinations(Guid workspaceId, Guid id, InventoryUseCases service, CancellationToken ct) =>
        service.DestinationsAsync(workspaceId, id, ct);

    [IdempotentWrite("expectedSequence")]
    [Authorize, WolverinePost(Warehouse)]
    public static Task<InventoryChange> Prepare(Guid workspaceId, Guid id, PrepareRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<InventoryChange>(new PrepareStockOperation(workspaceId, request.OperationId, id, request.ItemId,
            request.DestinationId, request.ExpectedSequence, request.On, request.Quantity, request.Reason), ct);

    [IdempotentWrite]
    [Authorize, WolverinePost(Root + "/stock-operations/{id:guid}/receive")]
    public static Task<InventoryChange> Receive(Guid workspaceId, Guid id, ReceiveRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<InventoryChange>(new ReceiveStockTransfer(workspaceId, request.OperationId, id, request.ExpectedVersion, request.On), ct);

    [IdempotentWrite]
    [Authorize, WolverinePost(Root + "/stock-operations/{id:guid}/decision")]
    public static Task<InventoryChange> Decide(Guid workspaceId, Guid id, DecideRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<InventoryChange>(new DecideStockOperation(workspaceId, request.OperationId, id, request.ExpectedVersion, request.Confirm), ct);
}
