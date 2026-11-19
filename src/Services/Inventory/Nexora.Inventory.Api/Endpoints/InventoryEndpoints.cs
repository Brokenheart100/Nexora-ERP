using Nexora.ServiceDefaults.Http;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Nexora.BuildingBlocks.Application;
using Nexora.Inventory.Application;
using Wolverine;
using Wolverine.Http;

namespace Nexora.Inventory.Api;

public static partial class InventoryEndpoints
{
    private const string Root = "/api/inventory/workspaces/{workspaceId:guid}";
    private const string Warehouse = Root + "/warehouses/{id:guid}";

    [Authorize, WolverineGet(Root + "/warehouses")]
    public static Task<WarehousesView> Warehouses(Guid workspaceId, InventoryUseCases service, CancellationToken ct) =>
        service.WarehousesAsync(workspaceId, ct);

    [Authorize, WolverineGet(Warehouse + "/reference")]
    public static Task<WarehouseView> Reference(Guid workspaceId, Guid id, InventoryUseCases service, CancellationToken ct) =>
        service.ReferenceAsync(workspaceId, id, ct);

    [Authorize, WolverineGet(Warehouse)]
    public static Task<WarehouseView> Detail(Guid workspaceId, Guid id, InventoryUseCases service, CancellationToken ct) =>
        service.ReferenceAsync(workspaceId, id, ct);

    [ApiWrite]
    [Authorize, WolverinePost(Root + "/warehouses")]
    public static async Task<Created<InventoryChange>> Add(Guid workspaceId, AddRequest request, IMessageBus bus, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<InventoryChange>(new AddWarehouse(workspaceId, request.OperationId, request.Code, request.Name), ct);
        return TypedResults.Created($"/api/inventory/workspaces/{workspaceId}/warehouses/{result.Id}", result);
    }

    [ApiWrite("expectedVersion")]
    [Authorize, WolverinePut(Warehouse + "/receiver")]
    public static Task<InventoryChange> Assign(Guid workspaceId, Guid id, AssignRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<InventoryChange>(new AssignWarehouse(workspaceId, request.OperationId, id, request.ExpectedVersion, request.MemberId), ct);

    [Authorize, WolverineGet(Warehouse + "/receipts")]
    public static Task<ReceiptView[]> Receipts(Guid workspaceId, Guid id, InventoryUseCases service, CancellationToken ct) =>
        service.ReceiptsAsync(workspaceId, id, ct);

    [Authorize, WolverineGet(Warehouse + "/positions")]
    public static Task<PoolView[]> Pools(Guid workspaceId, Guid id, [FromQuery] int? page, [FromQuery] int? pageSize, InventoryUseCases service, CancellationToken ct) =>
        service.PoolsAsync(workspaceId, id, ct, PageWindow.Optional(page, pageSize));

    [Authorize, WolverineGet(Warehouse + "/movements")]
    public static Task<MovementView[]> Movements(Guid workspaceId, Guid id, [FromQuery] Guid? itemId, [FromQuery] int? page, [FromQuery] int? pageSize,
        InventoryUseCases service, CancellationToken ct) => service.MovementsAsync(workspaceId, id, itemId, new PageWindow(page ?? 1, pageSize ?? PageWindow.DefaultSize), ct);

    [ApiWrite("expectedRevision")]
    [Authorize, WolverinePost(Root + "/receipts/{id:guid}/receive")]
    public static Task<InventoryChange> Receive(Guid workspaceId, Guid id, ReceiveRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<InventoryChange>(new ReceiveStock(workspaceId, request.OperationId, id, request.ExpectedRevision, request.On, request.Quantity), ct);

    [Authorize, WolverineGet(Warehouse + "/returns")]
    public static Task<StockReturnView[]> Returns(Guid workspaceId, Guid id, InventoryUseCases service, CancellationToken ct) =>
        service.ReturnsAsync(workspaceId, id, ct);

    [ApiWrite]
    [Authorize, WolverinePost(Root + "/movements/{id:guid}/returns")]
    public static Task<InventoryChange> Return(Guid workspaceId, Guid id, ReturnRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<InventoryChange>(new AuthorizeStockReturn(workspaceId, request.OperationId, id, request.On, request.Quantity, request.Reason), ct);

    [ApiWrite]
    [Authorize, WolverinePost(Root + "/returns/{id:guid}/decision")]
    public static Task<InventoryChange> DecideReturn(Guid workspaceId, Guid id, ReturnDecisionRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<InventoryChange>(new DecideStockReturn(workspaceId, request.OperationId, id, request.Confirm), ct);
}
