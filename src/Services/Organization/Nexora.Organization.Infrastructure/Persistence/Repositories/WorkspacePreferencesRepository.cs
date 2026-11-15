using Microsoft.EntityFrameworkCore;
using Nexora.Organization.Application;
using Nexora.Organization.Domain;

namespace Nexora.Organization.Infrastructure;

public sealed class WorkspacePreferencesRepository(OrganizationDbContext db) : IWorkspacePreferencesRepository
{
    public Task<WorkspacePreferences?> FindAsync(Nexora.BuildingBlocks.Application.ResourceScope scope, CancellationToken ct) =>
        db.Preferences.SingleOrDefaultAsync(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId, ct);

    public async Task<IReadOnlyDictionary<Guid, int>> SessionIdleMinutesAsync(IReadOnlyCollection<Guid> workspaceIds,
        CancellationToken cancellationToken) =>
        await db.Preferences.AsNoTracking().Where(x => workspaceIds.Contains(x.WorkspaceId))
            .Select(x => new { x.WorkspaceId, x.SessionIdleMinutes })
            .ToDictionaryAsync(x => x.WorkspaceId, x => x.SessionIdleMinutes, cancellationToken);

    public void Add(WorkspacePreferences preferences) => db.Preferences.Add(preferences);
}
