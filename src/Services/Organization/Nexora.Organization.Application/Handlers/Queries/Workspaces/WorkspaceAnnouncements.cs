using Nexora.BuildingBlocks.Application;

namespace Nexora.Organization.Application;

public sealed class WorkspaceAnnouncements(WorkspaceQueries workspaces, IApplicationAuthorization authorization,
    IAnnouncementSource source, TimeProvider clock)
{
    public async Task<AnnouncementView[]> ReadAsync(Guid workspaceId, ActorContext actor, CancellationToken ct)
    {
        var workspace = await workspaces.GetAsync(workspaceId, actor, ct);
        var scope = new ResourceScope(workspace.TenantId, workspaceId);
        var now = clock.GetUtcNow();
        var visible = new List<AnnouncementView>();
        foreach (var item in source.Read().OrderByDescending(x => x.StartsAtUtc).ThenBy(x => x.Id, StringComparer.Ordinal))
        {
            if (item.StartsAtUtc > now || item.EndsAtUtc <= now
                || item.Workspaces is { } targets && !targets.Contains(workspaceId)) continue;
            if (item.RequiredPermission is { } permission && !(await authorization.CheckAsync(actor, scope, permission, ct)).Allowed)
                continue;
            visible.Add(new(item.Id, item.Title, item.Message, item.EndsAtUtc));
        }
        return visible.ToArray();
    }
}
