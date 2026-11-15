using Nexora.ServiceDefaults.Http;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Nexora.Purchasing.Application;
using Wolverine;
using Wolverine.Http;

using Nexora.BuildingBlocks.Application;

namespace Nexora.Purchasing.Api;

public static partial class PurchaseReceiptEndpoints
{
    private const string Root = "/api/purchasing/workspaces/{workspaceId:guid}/orders/{id:guid}/receipts";

    [Authorize, WolverineGet(Root)]
    public static Task<ReceiptAllowances> List(Guid workspaceId, Guid id, [FromQuery] int? page, [FromQuery] int? pageSize, PurchaseReceiptUseCases service, CancellationToken ct) =>
        service.ListAsync(workspaceId, id, ct, PageWindow.Optional(page, pageSize));
    [IdempotentWrite("expectedVersion")]
    [Authorize, WolverinePost(Root)]
    public static Task<PermitChange> Issue(Guid workspaceId, Guid id, IssueRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<PermitChange>(new IssueReceiptPermit(workspaceId, request.OperationId, id, request.ExpectedVersion, request.LineId,
            request.WarehouseId, request.Quantity), ct);
    [IdempotentWrite("expectedVersion")]
    [Authorize, WolverinePost(Root + "/{permitId:guid}/cancel")]
    public static Task<PermitChange> Fence(Guid workspaceId, Guid id, Guid permitId, FenceRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<PermitChange>(new FenceReceiptPermit(workspaceId, request.OperationId, id, request.ExpectedVersion, permitId, request.Reason), ct);
    [IdempotentWrite("expectedVersion")]
    [Authorize, WolverinePost(Root + "/close")]
    public static Task<PurchaseChange> Close(Guid workspaceId, Guid id, FenceRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<PurchaseChange>(new CloseReceiving(workspaceId, request.OperationId, id, request.ExpectedVersion, request.Reason), ct);
}
