using Nexora.BuildingBlocks.Application;

namespace Nexora.Sales.Application;

public sealed class SalesAuditQueries(ISalesAuthority authority, ISalesAuditReader reader, TimeProvider clock)
{
    private const string AuditPermission = "organization.audit.read";

    public async Task<AuditPage> ListAsync(Guid workspaceId, AuditQuery query, CancellationToken cancellationToken)
    {
        var access = await authority.AccessAsync(workspaceId, cancellationToken);
        access.Demand(AuditPermission);
        return await reader.ReadAsync(access.Scope, query.Normalize(clock), cancellationToken);
    }
}
