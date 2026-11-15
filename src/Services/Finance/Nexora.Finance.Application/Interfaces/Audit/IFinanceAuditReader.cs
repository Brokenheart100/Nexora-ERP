using Nexora.BuildingBlocks.Application;

namespace Nexora.Finance.Application;

public interface IFinanceAuditReader
{
    Task<AuditPage> ReadAsync(ResourceScope scope, AuditQuery query, CancellationToken cancellationToken);
}
