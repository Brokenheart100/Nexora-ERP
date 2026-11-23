using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Nexora.BuildingBlocks.Application;
using Microsoft.Net.Http.Headers;
using Nexora.Sales.Application;
using Wolverine;
using Wolverine.Http;

namespace Nexora.Sales.Api;

public static partial class SalesEndpoints
{
    private const string Orders = "/api/sales/workspaces/{workspaceId:guid}/orders";
    private const string Order = Orders + "/{id:guid}";

    [Authorize, WolverineGet(Orders)]
    public static Task<SalesList> List(Guid workspaceId, [FromQuery] int? page, [FromQuery] int? pageSize, [FromQuery] bool? isQuote,
        SalesQueries queries, CancellationToken ct) =>
        queries.PageAsync(workspaceId, new PageWindow(page ?? 1, pageSize ?? PageWindow.DefaultSize), ct, isQuote);

    [Authorize, WolverineGet(Order)]
    [ProducesResponseType<SalesDetail>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status304NotModified)]
    public static async Task<IResult> Detail(Guid workspaceId, Guid id, HttpContext http, SalesQueries queries, CancellationToken ct)
    {
        var detail = await queries.DetailAsync(workspaceId, id, ct);
        var tag = SalesOrderHeaders.ETag(detail);
        http.Response.GetTypedHeaders().ETag = tag;
        return http.Request.GetTypedHeaders().IfNoneMatch.Any(candidate =>
            candidate.Equals(EntityTagHeaderValue.Any) || tag.Compare(candidate, useStrongComparison: false))
            ? Results.StatusCode(StatusCodes.Status304NotModified) : Results.Ok(detail);
    }

    [Authorize, WolverinePost(Orders)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict, "application/problem+json")]
    public static async Task<Created<SalesChange>> Create(Guid workspaceId, CreateRequest request, HttpRequest http, IMessageBus bus, CancellationToken ct)
    {
        var operation = SalesOrderHeaders.OperationId(http, request.OperationId);
        var change = await bus.InvokeAsync<SalesChange>(new CreateSales(workspaceId, operation, request.Number, request.Draft, request.IsQuote), ct);
        return CreatedOrder(workspaceId, change);
    }

    [Authorize, WolverinePost(Order + "/convert")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status412PreconditionFailed, "application/problem+json")]
    public static async Task<Created<SalesChange>> Convert(Guid workspaceId, Guid id, ConvertRequest request, HttpRequest http, IMessageBus bus, CancellationToken ct)
    {
        var operation = SalesOrderHeaders.OperationId(http, request.OperationId);
        var (version, condition) = SalesOrderHeaders.Version(http, id, request.ExpectedVersion);
        var change = await bus.InvokeAsync<SalesChange>(new ConvertQuote(workspaceId, operation, id, version, request.OrderNumber, condition), ct);
        return CreatedOrder(workspaceId, change);
    }

    [Authorize, WolverinePut(Order)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status412PreconditionFailed, "application/problem+json")]
    public static Task<SalesChange> Edit(Guid workspaceId, Guid id, EditRequest request, HttpRequest http, IMessageBus bus, CancellationToken ct)
    {
        var operation = SalesOrderHeaders.OperationId(http, request.OperationId);
        var (version, condition) = SalesOrderHeaders.Version(http, id, request.ExpectedVersion);
        return bus.InvokeAsync<SalesChange>(new EditSales(workspaceId, operation, id, version, request.Draft, condition), ct);
    }

    [Authorize, WolverinePost(Order + "/decision")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status412PreconditionFailed, "application/problem+json")]
    public static Task<SalesChange> Decide(Guid workspaceId, Guid id, DecisionRequest request, HttpRequest http, IMessageBus bus, CancellationToken ct)
    {
        var operation = SalesOrderHeaders.OperationId(http, request.OperationId);
        var (version, condition) = SalesOrderHeaders.Version(http, id, request.ExpectedVersion);
        return bus.InvokeAsync<SalesChange>(new DecideSales(workspaceId, operation, id, version, request.Decision, request.Reason, condition), ct);
    }

    private static Created<SalesChange> CreatedOrder(Guid workspaceId, SalesChange change) =>
        TypedResults.Created($"/api/sales/workspaces/{workspaceId}/orders/{change.Id}", change);
}
