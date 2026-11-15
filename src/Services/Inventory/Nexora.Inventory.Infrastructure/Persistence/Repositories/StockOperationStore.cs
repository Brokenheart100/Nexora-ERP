using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Inventory.Application;
using Nexora.Inventory.Domain;

namespace Nexora.Inventory.Infrastructure;

public sealed class StockOperationStore(InventoryDbContext db) : IStockOperations
{
    private IQueryable<StockOperation> Scoped(ResourceScope scope) => db.Set<StockOperation>()
        .Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId);

    public Task<StockOperation?> FindAsync(ResourceScope scope, Guid id, CancellationToken ct) =>
        Scoped(scope).SingleOrDefaultAsync(x => x.Id == id, ct);

    public Task<StockOperation[]> ListAsync(ResourceScope scope, Guid warehouseId, CancellationToken ct) =>
        Scoped(scope).AsNoTracking().Where(x => x.WarehouseId == warehouseId || x.DestinationId == warehouseId)
            .OrderByDescending(x => !x.Cancelled && (x.ReviewerId == null || x.DestinationId != null && x.DestinationMovementId == null))
            .ThenByDescending(x => x.Id).Take(100).ToArrayAsync(ct);

    public Task<DateOnly?> LatestMovementAsync(ResourceScope scope, Guid warehouseId, Guid itemId, CancellationToken ct) =>
        db.Movements.Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId
            && x.WarehouseId == warehouseId && x.ItemId == itemId).MaxAsync(x => (DateOnly?)x.On, ct);

    public void Add(StockOperation operation) => db.Add(operation);
}
