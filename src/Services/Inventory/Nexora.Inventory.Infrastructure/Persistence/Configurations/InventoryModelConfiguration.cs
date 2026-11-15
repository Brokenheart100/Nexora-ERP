using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Infrastructure;
using Nexora.Inventory.Application;
using Nexora.Inventory.Domain;

namespace Nexora.Inventory.Infrastructure;

internal static class InventoryModelConfiguration
{
    internal static void Configure(ModelBuilder model)
    {
        model.HasDefaultSchema("inventory");
        SalesStockModelConfiguration.Configure(model);
        StockOperationModelConfiguration.Configure(model);
        var warehouse = model.Entity<Warehouse>();
        warehouse.ToTable("warehouses");
        warehouse.Property(x => x.Id).ValueGeneratedNever();
        warehouse.Property(x => x.Code).HasMaxLength(40);
        warehouse.Property(x => x.Name).HasMaxLength(160);
        warehouse.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.Code }).IsUnique();

        var execution = model.Entity<ReceiptExecution>();
        execution.ToTable("receipt_executions");
        execution.Property(x => x.Id).ValueGeneratedNever();
        execution.Property(x => x.Executed).HasPrecision(20, 6);
        execution.Property(x => x.Cost).HasPrecision(28, 6);
        execution.Property(x => x.Terms).HasConversion(x => JsonSerializer.Serialize(x, (JsonSerializerOptions?)null),
            x => JsonSerializer.Deserialize<ReceiptTerms>(x, (JsonSerializerOptions?)null)!).HasColumnType("jsonb");
        execution.HasIndex(x => new { x.TenantId, x.WorkspaceId });

        var pool = model.Entity<CostPool>();
        pool.ToTable("cost_pools");
        pool.HasKey(x => new { x.TenantId, x.WorkspaceId, x.WarehouseId, x.ItemId });
        pool.Property(x => x.Quantity).HasPrecision(20, 6);
        pool.Property(x => x.Reserved).HasPrecision(20, 6);
        pool.Property(x => x.Value).HasPrecision(28, 6);
        pool.Property(x => x.Currency).HasMaxLength(3);
        var movement = model.Entity<StockMovement>();
        movement.ToTable("stock_movements");
        movement.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.WarehouseId, x.ItemId, x.Sequence }).IsUnique();
        movement.Property(x => x.Quantity).HasPrecision(20, 6);
        movement.Property(x => x.Cost).HasPrecision(28, 6);
        movement.Property(x => x.Reason).HasMaxLength(300);
        var returns = model.Entity<StockReturn>();
        returns.ToTable("stock_returns");
        returns.Property(x => x.Id).ValueGeneratedNever();
        returns.Property(x => x.Quantity).HasPrecision(20, 6);
        returns.Property(x => x.Reason).HasMaxLength(300);
        returns.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.WarehouseId });
        returns.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.OriginalId });

        var audit = model.Entity<InventoryAudit>();
        audit.ToTable("operation_audit");
        audit.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.Issuer, x.Subject, x.OperationId }).IsUnique();
        audit.Property(x => x.Issuer).HasMaxLength(500);
        audit.Property(x => x.Subject).HasMaxLength(200);
        audit.Property(x => x.Fingerprint).HasMaxLength(64);
        RecordChangeConfiguration.Configure(model);
    }
}
