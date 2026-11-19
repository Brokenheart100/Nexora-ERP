using Nexora.BuildingBlocks.Application;
using Nexora.Inventory.Domain;

namespace Nexora.Inventory.Application;

public interface IStockStore
{
    Task LockAsync(ResourceScope scope, CancellationToken ct);
    Task<Warehouse?> WarehouseAsync(ResourceScope scope, Guid id, CancellationToken ct);
    Task<Warehouse[]> WarehousesAsync(ResourceScope scope, Guid? receiver, CancellationToken ct, Guid[]? readableWarehouses = null);
    Task<ReceiptExecution?> ExecutionAsync(ResourceScope scope, Guid id, CancellationToken ct);
    Task<ReceiptExecution[]> ExecutionsAsync(ResourceScope scope, Guid warehouseId, CancellationToken ct);
    Task<CostPool?> PoolAsync(ResourceScope scope, Guid warehouseId, Guid itemId, CancellationToken ct);
    Task<CostPool[]> PoolsAsync(ResourceScope scope, Guid warehouseId, CancellationToken ct, PageWindow? page = null);
    Task<StockMovement[]> MovementsAsync(ResourceScope scope, Guid warehouseId, Guid? itemId, PageWindow page, bool salesOnly, CancellationToken ct);
    Task<StockMovement?> MovementAsync(ResourceScope scope, Guid id, CancellationToken ct);
    Task<bool> HasMovementsAsync(ResourceScope scope, CancellationToken ct);
    Task<decimal> ReturnedAsync(ResourceScope scope, Guid originalId, CancellationToken ct);
    Task<decimal> PendingReturnsAsync(ResourceScope scope, Guid originalId, CancellationToken ct);
    Task<StockReturn?> ReturnAsync(ResourceScope scope, Guid id, CancellationToken ct);
    Task<StockReturn[]> ReturnsAsync(ResourceScope scope, Guid warehouseId, CancellationToken ct, bool sales = false);
    Task<InventoryAudit?> AuditAsync(InventoryAccess access, Guid operation, CancellationToken ct);
    void Add(Warehouse warehouse);
    void Add(ReceiptExecution execution);
    void Add(CostPool pool);
    void Add(StockMovement movement);
    void Add(InventoryAudit audit);
    void Add(StockReturn pending);
}
