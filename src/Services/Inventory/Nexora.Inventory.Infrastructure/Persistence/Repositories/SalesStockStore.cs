using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Inventory.Application;
using Nexora.Inventory.Domain;

namespace Nexora.Inventory.Infrastructure;

public sealed class SalesStockStore(InventoryDbContext db) : ISalesStock
{
    private IQueryable<SalesReservation> Scoped(ResourceScope scope) =>
        db.Set<SalesReservation>().Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId);

    public Task<SalesReservation?> FindAsync(ResourceScope scope, Guid permitId, CancellationToken ct) =>
        Scoped(scope).SingleOrDefaultAsync(x => x.Id == permitId, ct);

    public Task<SalesReservation[]> ListAsync(ResourceScope scope, Guid warehouseId, CancellationToken ct) =>
        Scoped(scope).AsNoTracking().Where(x => x.WarehouseId == warehouseId).OrderByDescending(x => x.Id).Take(100).ToArrayAsync(ct);

    public async Task<(decimal Quantity, decimal Cost)> ReturnedAsync(ResourceScope scope, Guid originalId, CancellationToken ct)
    {
        var totals = await db.Movements.Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId && x.ReversesId == originalId)
            .GroupBy(x => x.ReversesId).Select(x => new { Quantity = x.Sum(row => row.Quantity), Cost = x.Sum(row => row.Cost) })
            .SingleOrDefaultAsync(ct);
        return totals is null ? (0, 0) : (totals.Quantity, totals.Cost);
    }

    public void Add(SalesReservation reservation) => db.Add(reservation);
}
