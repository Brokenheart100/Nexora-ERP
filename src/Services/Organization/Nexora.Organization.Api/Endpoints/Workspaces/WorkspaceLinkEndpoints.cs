using Microsoft.AspNetCore.Authorization;
using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Application;
using Wolverine;
using Wolverine.Http;

namespace Nexora.Organization.Api;

public static class WorkspaceLinkEndpoints
{
    [Authorize, WolverineGet("/api/workspaces/{id:guid}/personal-links")]
    public static Task<IReadOnlyList<PersonalLinkView>> List(Guid id, WorkspaceLinkUseCases useCases, ICurrentActor actor, CancellationToken ct) =>
        useCases.ListAsync(id, actor.GetRequired(), ct);

    [Authorize, WolverinePut("/api/workspaces/{id:guid}/personal-links/{personalId:guid}")]
    public static Task<PersonalLinkView> Set(Guid id, Guid personalId, SetPersonalLinkRequest request,
        ICurrentActor actor, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<PersonalLinkView>(new SetPersonalLink(id, personalId, request.IsLinked!.Value, actor.GetRequired()), ct);
}
