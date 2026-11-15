using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Infrastructure;
using Nexora.Inventory.Application;
using Nexora.Inventory.Domain;

namespace Nexora.Inventory.Infrastructure;

public sealed class InventoryDbContext(DbContextOptions<InventoryDbContext> options) : DbContext(options)
{
    public DbSet<Warehouse> Warehouses => Set<Warehouse>();
    public DbSet<ReceiptExecution> Executions => Set<ReceiptExecution>();
    public DbSet<CostPool> Pools => Set<CostPool>();
    public DbSet<StockMovement> Movements => Set<StockMovement>();
    public DbSet<InventoryAudit> Audit => Set<InventoryAudit>();
    public DbSet<RecordChange> RecordChanges => Set<RecordChange>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        InventoryModelConfiguration.Configure(model);
        RecordChangeConfiguration.Configure(model);
    }
}
