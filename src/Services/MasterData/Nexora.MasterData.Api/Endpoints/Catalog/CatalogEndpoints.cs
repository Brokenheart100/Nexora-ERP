using Nexora.ServiceDefaults.Http;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Nexora.BuildingBlocks.Application;
using Nexora.MasterData.Application;
using Nexora.MasterData.Domain;
using Wolverine;
using Wolverine.Http;

namespace Nexora.MasterData.Api;

public static class CatalogEndpoints
{
    [RevisionTagged]
    [Authorize, WolverineGet("/api/masterdata/workspaces/{workspaceId:guid}/definitions/{definitionId:guid}")]
    public static async Task<DefinitionView> GetDefinition(Guid workspaceId, Guid definitionId, HttpResponse response, CatalogQueries queries, CancellationToken ct)
    {
        var result = await queries.GetDefinitionAsync(workspaceId, definitionId, ct);
        ApiIdempotency.SetRevision(response, result.Version);
        return result;
    }

    [Authorize, WolverineGet("/api/masterdata/workspaces/{workspaceId:guid}/catalog")]
    public static Task<CatalogView> List(Guid workspaceId, [FromQuery] int? page, [FromQuery] int? pageSize, CatalogQueries queries, CancellationToken ct) =>
        queries.ListAsync(workspaceId, new PageWindow(page ?? 1, pageSize ?? PageWindow.DefaultSize), ct);

    [RevisionTagged]
    [Authorize, WolverineGet("/api/masterdata/workspaces/{workspaceId:guid}/items/{itemId:guid}")]
    public static async Task<ItemView> Get(Guid workspaceId, Guid itemId, HttpResponse response, CatalogQueries queries, CancellationToken ct)
    {
        var result = await queries.GetAsync(workspaceId, itemId, ct);
        ApiIdempotency.SetRevision(response, result.Version);
        return result;
    }

    [Authorize, WolverineGet("/api/masterdata/workspaces/{workspaceId:guid}/items/{itemId:guid}/reference")]
    public static Task<ItemReference> Reference(Guid workspaceId, Guid itemId, [FromQuery] bool? inventory,
        CatalogQueries queries, CancellationToken ct) => queries.ReferenceAsync(workspaceId, itemId, inventory == true, ct);

    [ApiWrite]
    [Authorize, WolverinePost("/api/masterdata/workspaces/{workspaceId:guid}/definitions")]
    public static async Task<Created<CatalogMutation>> CreateDefinition(Guid workspaceId, AddDefinitionRequest request, IMessageBus bus, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<CatalogMutation>(new AddDefinition(workspaceId, request.OperationId,
            request.Kind == "category" ? DefinitionKind.Category : DefinitionKind.Unit, request.Code, request.Name), ct);
        return TypedResults.Created($"/api/masterdata/workspaces/{workspaceId}/definitions/{result.Id}", result);
    }

    [ApiWrite("expectedVersion")]
    [Authorize, WolverinePut("/api/masterdata/workspaces/{workspaceId:guid}/definitions/{definitionId:guid}")]
    public static Task<CatalogMutation> UpdateDefinition(Guid workspaceId, Guid definitionId, ReviseDefinitionRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<CatalogMutation>(new ReviseDefinition(workspaceId, request.OperationId, definitionId, request.ExpectedVersion,
            request.Name, request.IsActive!.Value), ct);

    [ApiWrite]
    [Authorize, WolverinePost("/api/masterdata/workspaces/{workspaceId:guid}/items")]
    public static async Task<Created<CatalogMutation>> CreateItem(Guid workspaceId, AddItemRequest request, IMessageBus bus, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<CatalogMutation>(new AddItem(workspaceId, request.OperationId, request.Code, request.Name,
            request.Kind == "product" ? ItemKind.Product : ItemKind.Service, request.TracksInventory!.Value, request.CategoryId, request.UnitId), ct);
        return TypedResults.Created($"/api/masterdata/workspaces/{workspaceId}/items/{result.Id}", result);
    }

    [ApiWrite("expectedVersion")]
    [Authorize, WolverinePut("/api/masterdata/workspaces/{workspaceId:guid}/items/{itemId:guid}")]
    public static Task<CatalogMutation> UpdateItem(Guid workspaceId, Guid itemId, ReviseItemRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<CatalogMutation>(new ReviseItem(workspaceId, request.OperationId, itemId, request.ExpectedVersion,
            request.Name, request.CategoryId, request.IsActive!.Value), ct);
}
