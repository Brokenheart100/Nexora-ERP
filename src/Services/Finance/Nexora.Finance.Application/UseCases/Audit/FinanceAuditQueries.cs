using Nexora.BuildingBlocks.Application;

namespace Nexora.Finance.Application;

public sealed class FinanceAuditQueries(IBookAccess books, IFinanceAuditReader reader, TimeProvider clock)
{
    private const string AuditPermission = "organization.audit.read";

    public async Task<AuditPage> ListAsync(Guid workspaceId, AuditQuery query, CancellationToken cancellationToken)
    {
        var access = await books.DemandAsync(workspaceId, false, cancellationToken);
        access.Demand(AuditPermission);
        return await reader.ReadAsync(access.Scope, query.Normalize(clock), cancellationToken);
    }
}
