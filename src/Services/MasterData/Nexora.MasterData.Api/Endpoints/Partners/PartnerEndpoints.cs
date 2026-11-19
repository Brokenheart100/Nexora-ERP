using Nexora.ServiceDefaults.Http;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Nexora.BuildingBlocks.Application;
using Nexora.MasterData.Application;
using Wolverine;
using Wolverine.Http;

namespace Nexora.MasterData.Api;

public static class PartnerEndpoints
{
    [Authorize, WolverineGet("/api/masterdata/workspaces/{workspaceId:guid}/partners")]
    public static Task<PartnerList> List(Guid workspaceId, [FromQuery] int? page, [FromQuery] int? pageSize,
        [FromQuery] string? role, PartnerQueries queries, CancellationToken ct) =>
        queries.ListAsync(workspaceId, new PageWindow(page ?? 1, pageSize ?? PageWindow.DefaultSize), ct, role);

    [RevisionTagged]
    [Authorize, WolverineGet("/api/masterdata/workspaces/{workspaceId:guid}/partners/{partnerId:guid}")]
    public static async Task<PartnerDetail> Get(Guid workspaceId, Guid partnerId, HttpResponse response, PartnerQueries queries, CancellationToken ct)
    {
        var result = await queries.DetailAsync(workspaceId, partnerId, ct);
        ApiIdempotency.SetRevision(response, result.Version);
        return result;
    }

    [Authorize, WolverineGet("/api/masterdata/workspaces/{workspaceId:guid}/partners/{partnerId:guid}/reference")]
    public static Task<PartnerReference> Reference(Guid workspaceId, Guid partnerId, [FromQuery] string? role,
        PartnerQueries queries, CancellationToken ct) => queries.ReferenceAsync(workspaceId, partnerId, role, ct);

    [ApiWrite]
    [Authorize, WolverinePost("/api/masterdata/workspaces/{workspaceId:guid}/partners")]
    public static async Task<Created<CatalogMutation>> Create(Guid workspaceId, AddPartnerRequest request, IMessageBus bus, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<CatalogMutation>(new AddPartner(workspaceId, request.OperationId, request.Code, request.Profile.ToProfile()), ct);
        return TypedResults.Created($"/api/masterdata/workspaces/{workspaceId}/partners/{result.Id}", result);
    }

    [ApiWrite("expectedVersion")]
    [Authorize, WolverinePut("/api/masterdata/workspaces/{workspaceId:guid}/partners/{partnerId:guid}")]
    public static Task<CatalogMutation> Update(Guid workspaceId, Guid partnerId, RevisePartnerRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<CatalogMutation>(new RevisePartner(workspaceId, request.OperationId, partnerId, request.ExpectedVersion,
            request.Profile.ToProfile(), request.IsActive!.Value), ct);
}
