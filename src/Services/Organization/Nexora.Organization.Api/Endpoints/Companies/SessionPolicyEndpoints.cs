using Microsoft.AspNetCore.Authorization;
using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Application;
using Wolverine.Http;

namespace Nexora.Organization.Api;

public static class SessionPolicyEndpoints
{
    [Authorize, WolverineGet("/api/session-policy")]
    public static Task<SessionPolicyView> Get(SessionPolicyQueries queries, ICurrentActor actor, CancellationToken ct) =>
        queries.GetAsync(actor.GetRequired(), ct);
}
