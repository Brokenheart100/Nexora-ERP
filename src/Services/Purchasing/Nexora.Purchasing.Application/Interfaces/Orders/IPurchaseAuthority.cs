using Nexora.BuildingBlocks.Application;
using Nexora.Purchasing.Domain;

namespace Nexora.Purchasing.Application;

public interface IPurchaseAuthority
{
    Task<PurchaseAccess> AccessAsync(Guid workspaceId, CancellationToken ct);
    Task<PurchaseTerms> TermsAsync(ResourceScope scope, CancellationToken ct);
    Task<SupplierReference> SupplierAsync(ResourceScope scope, Guid supplierId, CancellationToken ct);
    Task<StockReference> StockAsync(ResourceScope scope, Guid itemId, CancellationToken ct);
    Task DemandWarehouseAsync(ResourceScope scope, Guid warehouseId, CancellationToken ct);
}
