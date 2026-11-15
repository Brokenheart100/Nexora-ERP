using Nexora.BuildingBlocks.Application;

namespace Nexora.Inventory.Application;

public sealed record InventoryAccess(ResourceScope Scope, ActorContext Actor, Guid MemberId, bool Manage, bool ApprovePurchases,
    bool ApproveSales = false, bool ReadCompanyStock = false, Guid[]? StockWarehouses = null, bool CanReadAudit = false)
{
    public bool CanReadStock(Guid warehouseId) => ReadCompanyStock || StockWarehouses?.Contains(warehouseId) == true;
}
