using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Inventory.Application;
using Nexora.Inventory.Domain;

namespace Nexora.Inventory.Infrastructure;

public sealed class StockStore(InventoryDbContext db) : IStockStore
{
    public async Task LockAsync(ResourceScope scope, CancellationToken ct)
    {
        if (db.Database.CurrentTransaction is null) throw new InvalidOperationException("Stock mutations require a transaction.");
        var key = $"inventory:{scope.TenantId}:{scope.WorkspaceId}";
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({key}, 0))", ct);
    }

    public Task<Warehouse?> WarehouseAsync(ResourceScope scope, Guid id, CancellationToken ct) =>
        db.Warehouses.SingleOrDefaultAsync(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId && x.Id == id, ct);
    public Task<Warehouse[]> WarehousesAsync(ResourceScope scope, Guid? receiver, CancellationToken ct, Guid[]? readableWarehouses = null)
    {
        var warehouses = db.Warehouses.AsNoTracking().Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId);
        if (receiver is { } id)
        {
            var permitted = readableWarehouses ?? [];
            warehouses = warehouses.Where(x => x.ReceiverId == id || permitted.Contains(x.Id));
        }
        return warehouses.OrderBy(x => x.Code).ToArrayAsync(ct);
    }
    public Task<ReceiptExecution?> ExecutionAsync(ResourceScope scope, Guid id, CancellationToken ct) =>
        db.Executions.SingleOrDefaultAsync(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId && x.Id == id, ct);
    public Task<ReceiptExecution[]> ExecutionsAsync(ResourceScope scope, Guid warehouseId, CancellationToken ct) =>
        db.Executions.FromSqlInterpolated($"""
            SELECT * FROM inventory.receipt_executions WHERE "TenantId" = {scope.TenantId} AND "WorkspaceId" = {scope.WorkspaceId}
              AND "Terms"->>'WarehouseId' = {warehouseId.ToString()}
            """).AsNoTracking().OrderByDescending(x => x.Id).Take(100).ToArrayAsync(ct);
    public Task<CostPool?> PoolAsync(ResourceScope scope, Guid warehouseId, Guid itemId, CancellationToken ct) =>
        db.Pools.SingleOrDefaultAsync(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId && x.WarehouseId == warehouseId && x.ItemId == itemId, ct);
    public Task<CostPool[]> PoolsAsync(ResourceScope scope, Guid warehouseId, CancellationToken ct, PageWindow? page = null)
    {
        IQueryable<CostPool> pools = db.Pools.AsNoTracking().Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId && x.WarehouseId == warehouseId).OrderBy(x => x.ItemId);
        if (page is { } window) pools = pools.Skip(window.Offset).Take(window.Size);
        return pools.ToArrayAsync(ct);
    }
    public Task<StockMovement[]> MovementsAsync(ResourceScope scope, Guid warehouseId, Guid? itemId, PageWindow page, bool salesOnly, CancellationToken ct)
    {
        var movements = db.Movements.AsNoTracking().Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId
            && x.WarehouseId == warehouseId && (itemId == null || x.ItemId == itemId));
        if (salesOnly)
            movements = movements.Where(x => db.Set<SalesReservation>().Any(s => s.TenantId == scope.TenantId
                && s.WorkspaceId == scope.WorkspaceId && s.Id == x.PermitId));
        return movements.OrderByDescending(x => x.OccurredAtUtc).ThenByDescending(x => x.Id)
            .Skip(page.Offset).Take(page.Size).ToArrayAsync(ct);
    }
    public Task<InventoryAudit?> AuditAsync(InventoryAccess access, Guid operation, CancellationToken ct) =>
        db.Audit.SingleOrDefaultAsync(x => x.TenantId == access.Scope.TenantId && x.WorkspaceId == access.Scope.WorkspaceId
            && x.Issuer == access.Actor.Issuer && x.Subject == access.Actor.Subject && x.OperationId == operation, ct);

    public Task<StockMovement?> MovementAsync(ResourceScope scope, Guid id, CancellationToken ct) =>
        db.Movements.SingleOrDefaultAsync(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId && x.Id == id, ct);

    public Task<decimal> ReturnedAsync(ResourceScope scope, Guid originalId, CancellationToken ct) =>
        db.Movements.Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId && x.ReversesId == originalId)
            .SumAsync(x => -x.Quantity, ct);
    public Task<decimal> PendingReturnsAsync(ResourceScope scope, Guid originalId, CancellationToken ct) =>
        db.Set<StockReturn>().Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId && x.OriginalId == originalId
            && x.MovementId == null && !x.Cancelled).SumAsync(x => x.Quantity, ct);
    public Task<StockReturn?> ReturnAsync(ResourceScope scope, Guid id, CancellationToken ct) =>
        db.Set<StockReturn>().SingleOrDefaultAsync(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId && x.Id == id, ct);
    public Task<StockReturn[]> ReturnsAsync(ResourceScope scope, Guid warehouseId, CancellationToken ct, bool sales = false) =>
        db.Set<StockReturn>().AsNoTracking().Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId
            && x.WarehouseId == warehouseId && x.IsSales == sales).OrderByDescending(x => x.Id).Take(100).ToArrayAsync(ct);

    public void Add(Warehouse warehouse) => db.Warehouses.Add(warehouse);
    public void Add(ReceiptExecution execution) => db.Executions.Add(execution);
    public void Add(CostPool pool) => db.Pools.Add(pool);
    public void Add(StockMovement movement) => db.Movements.Add(movement);
    public void Add(InventoryAudit audit) => db.Audit.Add(audit);
    public void Add(StockReturn pending) => db.Add(pending);
}
