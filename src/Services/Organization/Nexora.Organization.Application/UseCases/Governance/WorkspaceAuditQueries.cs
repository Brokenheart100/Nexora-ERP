using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Domain;

namespace Nexora.Organization.Application;

public sealed class WorkspaceAuditQueries(IWorkspaceRepository workspaces, IApplicationAuthorization authorization,
    IWorkspaceAuditReader reader, TimeProvider clock)
{
    public async Task<AuditPage> ListAsync(Guid workspaceId, AuditQuery query, ActorContext actor, CancellationToken cancellationToken)
    {
        var workspace = await workspaces.FindAsync(workspaceId, cancellationToken) ?? throw new ResourceNotFoundException();
        await authorization.DemandAsync(actor, new(workspace.TenantId, workspaceId), WorkspacePermissions.Audit, cancellationToken);
        return await reader.ReadAsync(new(workspace.TenantId, workspaceId), query.Normalize(clock), cancellationToken);
    }
}
