using Nexora.BuildingBlocks.Application;
using Nexora.Inventory.Domain;

namespace Nexora.Inventory.Application;

public interface IStockOperations
{
    Task<StockOperation?> FindAsync(ResourceScope scope, Guid id, CancellationToken ct);
    Task<StockOperation[]> ListAsync(ResourceScope scope, Guid warehouseId, CancellationToken ct);
    Task<DateOnly?> LatestMovementAsync(ResourceScope scope, Guid warehouseId, Guid itemId, CancellationToken ct);
    void Add(StockOperation operation);
}
