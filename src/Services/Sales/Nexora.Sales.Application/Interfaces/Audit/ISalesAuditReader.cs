using Nexora.BuildingBlocks.Application;

namespace Nexora.Sales.Application;

public interface ISalesAuditReader
{
    Task<AuditPage> ReadAsync(ResourceScope scope, AuditQuery query, CancellationToken cancellationToken);
}
