using Nexora.BuildingBlocks.Application;
using Nexora.Inventory.Domain;

namespace Nexora.Inventory.Application;

public sealed record OpeningStockLine(Guid MovementId, Guid WarehouseId, Guid ItemId, Guid UnitId, decimal Quantity, decimal Value);

public sealed partial class InventoryUseCases
{
    public async Task<string?> ApplyOpeningAsync(ResourceScope scope, Guid batchId, DateOnly on, string currency,
        OpeningStockLine[] rows, CancellationToken ct)
    {
        if (scope.TenantId == Guid.Empty || scope.WorkspaceId == Guid.Empty || batchId == Guid.Empty || on.Year is < 1900 or > 9998
            || rows.Length is < 1 or > 100 || rows.Any(x => x.MovementId == Guid.Empty || x.ItemId == Guid.Empty || x.WarehouseId == Guid.Empty)
            || rows.Select(x => x.MovementId).Distinct().Count() != rows.Length ||
            rows.Select(x => (x.ItemId, x.WarehouseId)).Distinct().Count() != rows.Length)
            throw new ArgumentException("Invalid opening stock batch.");
        await store.LockAsync(scope, ct);
        var applied = 0;
        foreach (var row in rows)
        {
            var existing = await store.MovementAsync(scope, row.MovementId, ct);
            if (existing is null) continue;
            if (existing.PermitId != batchId || existing.On != on || existing.WarehouseId != row.WarehouseId ||
                existing.ItemId != row.ItemId || existing.Quantity != row.Quantity || existing.Cost != row.Value ||
                existing.Sequence != 1 || existing.Reason != "opening-balance")
                throw new StockRuleException("Opening stock replay differs from the saved movement.");
            applied++;
        }
        if (applied == rows.Length) return null;
        if (applied != 0) throw new StockRuleException("An opening stock batch was only partly applied.");
        if (await store.HasMovementsAsync(scope, ct)) return "工作区已有库存流水，期初库存须先于日常出入库。";

        var positions = new List<CostPool>();
        foreach (var row in rows)
        {
            if (await store.WarehouseAsync(scope, row.WarehouseId, ct) is null) return "批次包含不属于当前工作区的仓库。";
            if (await store.PoolAsync(scope, row.WarehouseId, row.ItemId, ct) is not null) return "库存位置已有成本池。";
            positions.Add(CostPool.Open(scope.TenantId, scope.WorkspaceId, row.WarehouseId, row.ItemId, row.UnitId,
                currency, row.Quantity, row.Value));
        }
        var now = clock.GetUtcNow();
        foreach (var (row, position) in rows.Zip(positions))
        {
            store.Add(position);
            store.Add(new StockMovement(row.MovementId, scope.TenantId, scope.WorkspaceId, row.WarehouseId, row.ItemId,
                batchId, 1, on, row.Quantity, row.Value, now, Reason: "opening-balance"));
        }
        return null;
    }
}
