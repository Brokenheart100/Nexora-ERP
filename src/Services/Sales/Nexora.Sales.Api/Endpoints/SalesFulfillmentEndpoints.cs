using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Nexora.Sales.Application;
using Wolverine;
using Wolverine.Http;

using Nexora.BuildingBlocks.Application;

namespace Nexora.Sales.Api;

public static partial class SalesFulfillmentEndpoints
{
    private const string Root = "/api/sales/workspaces/{workspaceId:guid}/orders/{id:guid}/fulfillments";

    [Authorize, WolverineGet(Root)]
    public static Task<FulfillmentAllowances> List(Guid workspaceId, Guid id, [FromQuery] int? page, [FromQuery] int? pageSize, SalesFulfillmentUseCases service, CancellationToken ct) =>
        service.ListAsync(workspaceId, id, ct, PageWindow.Optional(page, pageSize));
    [Authorize, WolverinePost(Root)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status412PreconditionFailed, "application/problem+json")]
    public static Task<FulfillmentBatchChange> Issue(Guid workspaceId, Guid id, IssueRequest request, HttpRequest http, IMessageBus bus, CancellationToken ct)
    {
        var operation = SalesOrderHeaders.OperationId(http, request.OperationId);
        var (version, condition) = SalesOrderHeaders.Version(http, id, request.ExpectedVersion);
        return bus.InvokeAsync<FulfillmentBatchChange>(new IssueFulfillmentPermit(workspaceId, operation, id, version,
            request.WarehouseId, request.Lines, request.HoldSeconds, condition), ct);
    }
    [Authorize, WolverinePost(Root + "/{permitId:guid}/cancel")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status412PreconditionFailed, "application/problem+json")]
    public static Task<PermitChange> Fence(Guid workspaceId, Guid id, Guid permitId, FenceRequest request, HttpRequest http, IMessageBus bus, CancellationToken ct)
    {
        var operation = SalesOrderHeaders.OperationId(http, request.OperationId);
        var (version, condition) = SalesOrderHeaders.Version(http, id, request.ExpectedVersion);
        return bus.InvokeAsync<PermitChange>(new FenceFulfillmentPermit(workspaceId, operation, id, version, permitId, request.Reason, condition), ct);
    }
    [Authorize, WolverinePost(Root + "/close")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status412PreconditionFailed, "application/problem+json")]
    public static Task<SalesChange> Close(Guid workspaceId, Guid id, FenceRequest request, HttpRequest http, IMessageBus bus, CancellationToken ct)
    {
        var operation = SalesOrderHeaders.OperationId(http, request.OperationId);
        var (version, condition) = SalesOrderHeaders.Version(http, id, request.ExpectedVersion);
        return bus.InvokeAsync<SalesChange>(new CloseFulfilling(workspaceId, operation, id, version, request.Reason, condition), ct);
    }
}
