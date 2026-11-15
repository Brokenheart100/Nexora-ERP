using Nexora.BuildingBlocks.Application;

namespace Nexora.MasterData.Application;

public sealed class RecordChangeQueries(ICatalogAccess catalog, IRecordChangeReader reader, TimeProvider clock)
{
    private const string AuditPermission = "organization.audit.read";

    public async Task<RecordChangePage> ListAsync(Guid workspaceId, RecordChangeQuery query, CancellationToken cancellationToken)
    {
        var access = await catalog.DemandAsync(workspaceId, AuditPermission, cancellationToken);
        return await reader.ReadAsync(access.Scope, query.Normalize(clock), cancellationToken);
    }

    public async Task<string> ExportAsync(Guid workspaceId, RecordChangeQuery query, CancellationToken cancellationToken)
    {
        var access = await catalog.DemandAsync(workspaceId, AuditPermission, cancellationToken);
        return await reader.ExportCsvAsync(access.Scope, query.Normalize(clock), cancellationToken);
    }
}
