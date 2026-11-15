using Nexora.BuildingBlocks.Application;

namespace Nexora.Purchasing.Application;

public interface IPurchaseAuditReader
{
    Task<AuditPage> ReadAsync(ResourceScope scope, AuditQuery query, CancellationToken cancellationToken);
}
