using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Domain;

namespace Nexora.Organization.Application;

public interface IWorkspacePreferencesRepository
{
    Task<WorkspacePreferences?> FindAsync(ResourceScope scope, CancellationToken cancellationToken);
    Task<IReadOnlyDictionary<Guid, int>> SessionIdleMinutesAsync(IReadOnlyCollection<Guid> workspaceIds,
        CancellationToken cancellationToken);
    void Add(WorkspacePreferences preferences);
}
