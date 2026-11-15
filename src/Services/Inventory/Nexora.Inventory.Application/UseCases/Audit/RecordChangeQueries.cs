using Nexora.BuildingBlocks.Application;

namespace Nexora.Inventory.Application;

public sealed class RecordChangeQueries(IInventoryAuthority authority, IRecordChangeReader reader, TimeProvider clock)
{
    private const string AuditPermission = "organization.audit.read";

    public async Task<RecordChangePage> ListAsync(Guid workspaceId, RecordChangeQuery query, CancellationToken cancellationToken)
    {
        var access = await authority.AccessAsync(workspaceId, cancellationToken);
        if (!access.CanReadAudit) throw new AccessDeniedException();
        return await reader.ReadAsync(access.Scope, query.Normalize(clock), cancellationToken);
    }

    public async Task<string> ExportAsync(Guid workspaceId, RecordChangeQuery query, CancellationToken cancellationToken)
    {
        var access = await authority.AccessAsync(workspaceId, cancellationToken);
        if (!access.CanReadAudit) throw new AccessDeniedException();
        return await reader.ExportCsvAsync(access.Scope, query.Normalize(clock), cancellationToken);
    }
}
