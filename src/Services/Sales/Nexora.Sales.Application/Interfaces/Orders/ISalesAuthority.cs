using Nexora.BuildingBlocks.Application;
using Nexora.Sales.Domain;

namespace Nexora.Sales.Application;

public interface ISalesAuthority
{
    Task<SalesAccess> AccessAsync(Guid workspaceId, CancellationToken ct);
    Task<SalesTerms> TermsAsync(ResourceScope scope, CancellationToken ct);
    Task<CustomerReference> CustomerAsync(ResourceScope scope, Guid customerId, CancellationToken ct);
    Task<StockReference> StockAsync(ResourceScope scope, Guid itemId, CancellationToken ct);
    Task DemandWarehouseAsync(ResourceScope scope, Guid warehouseId, CancellationToken ct);
}
