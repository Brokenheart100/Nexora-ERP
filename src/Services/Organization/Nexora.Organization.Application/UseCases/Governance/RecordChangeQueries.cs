using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Domain;

namespace Nexora.Organization.Application;

public sealed class RecordChangeQueries(IWorkspaceRepository workspaces, IApplicationAuthorization authorization, IRecordChangeReader reader, TimeProvider clock)
{
    private const string AuditPermission = "organization.audit.read";

    public async Task<RecordChangePage> ListAsync(Guid workspaceId, RecordChangeQuery query, ActorContext actor, CancellationToken cancellationToken)
    {
        var workspace = await workspaces.FindAsync(workspaceId, cancellationToken) ?? throw new ResourceNotFoundException();
        await authorization.DemandAsync(actor, new(workspace.TenantId, workspaceId), WorkspacePermissions.Audit, cancellationToken);
        return await reader.ReadAsync(new(workspace.TenantId, workspaceId), query.Normalize(clock), cancellationToken);
    }

    public async Task<string> ExportAsync(Guid workspaceId, RecordChangeQuery query, ActorContext actor, CancellationToken cancellationToken)
    {
        var workspace = await workspaces.FindAsync(workspaceId, cancellationToken) ?? throw new ResourceNotFoundException();
        await authorization.DemandAsync(actor, new(workspace.TenantId, workspaceId), WorkspacePermissions.Audit, cancellationToken);
        return await reader.ExportCsvAsync(new(workspace.TenantId, workspaceId), query.Normalize(clock), cancellationToken);
    }
}
