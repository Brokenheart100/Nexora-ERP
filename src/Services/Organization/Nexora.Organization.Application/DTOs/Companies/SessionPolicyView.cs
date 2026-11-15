using Nexora.Organization.Domain;

namespace Nexora.Organization.Application;

public sealed record SessionPolicyView(int IdleTimeoutMinutes, IReadOnlyList<SessionPolicySource> Sources,
    int WorkspaceCount, DateTimeOffset CheckedAt);

public sealed record SessionPolicySource(Guid WorkspaceId, string WorkspaceName, int IdleTimeoutMinutes);

public static class SessionPolicySelection
{
    public static (int IdleTimeoutMinutes, SessionPolicySource[] Sources) Select(
        IReadOnlyList<WorkspaceView> workspaces, IReadOnlyDictionary<Guid, int> idleMinutes)
    {
        if (workspaces.Count == 0) return (WorkspacePreferences.DefaultSessionIdleMinutes, []);
        var candidates = workspaces.Select(workspace => new
        {
            Workspace = workspace,
            Minutes = idleMinutes.TryGetValue(workspace.Id, out var minutes)
                ? minutes
                : WorkspacePreferences.DefaultSessionIdleMinutes,
        }).ToArray();
        var minimum = candidates.Min(candidate => candidate.Minutes);
        var sources = candidates
            .Where(candidate => candidate.Minutes == minimum)
            .OrderBy(candidate => candidate.Workspace.Name, StringComparer.Ordinal)
            .ThenBy(candidate => candidate.Workspace.Id)
            .Select(candidate => new SessionPolicySource(candidate.Workspace.Id, candidate.Workspace.Name, candidate.Minutes))
            .ToArray();
        return (minimum, sources);
    }
}
