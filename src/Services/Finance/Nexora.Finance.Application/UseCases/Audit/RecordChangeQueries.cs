using Nexora.BuildingBlocks.Application;

namespace Nexora.Finance.Application;

public sealed class RecordChangeQueries(IBookAccess books, IRecordChangeReader reader, TimeProvider clock)
{
    private const string AuditPermission = "organization.audit.read";

    public async Task<RecordChangePage> ListAsync(Guid workspaceId, RecordChangeQuery query, CancellationToken cancellationToken)
    {
        var access = await books.DemandAsync(workspaceId, false, cancellationToken);
        access.Demand(AuditPermission);
        return await reader.ReadAsync(access.Scope, query.Normalize(clock), cancellationToken);
    }

    public async Task<string> ExportAsync(Guid workspaceId, RecordChangeQuery query, CancellationToken cancellationToken)
    {
        var access = await books.DemandAsync(workspaceId, false, cancellationToken);
        access.Demand(AuditPermission);
        return await reader.ExportCsvAsync(access.Scope, query.Normalize(clock), cancellationToken);
    }
}
