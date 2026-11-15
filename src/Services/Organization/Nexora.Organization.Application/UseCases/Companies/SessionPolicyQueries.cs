using Nexora.BuildingBlocks.Application;

namespace Nexora.Organization.Application;

public sealed class SessionPolicyQueries(WorkspaceQueries workspaces,
    IWorkspacePreferencesRepository preferences, TimeProvider clock)
{
    public async Task<SessionPolicyView> GetAsync(ActorContext actor, CancellationToken ct)
    {
        var accessible = await workspaces.ListAsync(actor, ct);
        var ids = accessible.Select(workspace => workspace.Id).ToArray();
        var idleMinutes = ids.Length == 0
            ? new Dictionary<Guid, int>()
            : await preferences.SessionIdleMinutesAsync(ids, ct);
        var (minimum, sources) = SessionPolicySelection.Select(accessible, idleMinutes);
        return new(minimum, sources, accessible.Count, clock.GetUtcNow());
    }
}
