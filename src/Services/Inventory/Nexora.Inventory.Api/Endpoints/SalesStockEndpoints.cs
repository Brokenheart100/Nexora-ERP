using Nexora.ServiceDefaults.Http;
using Microsoft.AspNetCore.Authorization;
using Nexora.Inventory.Application;
using Wolverine;
using Wolverine.Http;
using static Nexora.Inventory.Api.InventoryEndpoints;

namespace Nexora.Inventory.Api;

public static class SalesStockEndpoints
{
    private const string Root = "/api/inventory/workspaces/{workspaceId:guid}";
    private const string Warehouse = Root + "/warehouses/{id:guid}";

    [Authorize, WolverineGet(Warehouse + "/shipments")]
    public static Task<ShipmentView[]> Shipments(Guid workspaceId, Guid id, InventoryUseCases service, ISalesStock sales, CancellationToken ct) =>
        service.ShipmentsAsync(workspaceId, id, sales, ct);

    [ApiWrite("expectedRevision")]
    [Authorize, WolverinePost(Root + "/shipments/{id:guid}/ship")]
    public static Task<InventoryChange> Ship(Guid workspaceId, Guid id, ReceiveRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<InventoryChange>(new ShipStock(workspaceId, request.OperationId, id, request.ExpectedRevision, request.On, request.Quantity), ct);

    [Authorize, WolverineGet(Warehouse + "/sales-returns")]
    public static Task<StockReturnView[]> Returns(Guid workspaceId, Guid id, InventoryUseCases service, CancellationToken ct) =>
        service.ReturnsAsync(workspaceId, id, ct, sales: true);

    [ApiWrite]
    [Authorize, WolverinePost(Root + "/shipments/{id:guid}/returns")]
    public static Task<InventoryChange> Return(Guid workspaceId, Guid id, ReturnRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<InventoryChange>(new AuthorizeSalesReturn(workspaceId, request.OperationId, id, request.On, request.Quantity, request.Reason), ct);

    [ApiWrite]
    [Authorize, WolverinePost(Root + "/sales-returns/{id:guid}/decision")]
    public static Task<InventoryChange> DecideReturn(Guid workspaceId, Guid id, ReturnDecisionRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<InventoryChange>(new DecideSalesReturn(workspaceId, request.OperationId, id, request.Confirm), ct);
}
