using Microsoft.AspNetCore.Authorization;
using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Application;
using Wolverine.Http;

namespace Nexora.Organization.Api;

public static class WorkspaceAnnouncementEndpoints
{
    [Authorize, WolverineGet("/api/workspaces/{id:guid}/announcements")]
    public static Task<AnnouncementView[]> List(Guid id, WorkspaceAnnouncements service, ICurrentActor actor, CancellationToken ct) =>
        service.ReadAsync(id, actor.GetRequired(), ct);
}
