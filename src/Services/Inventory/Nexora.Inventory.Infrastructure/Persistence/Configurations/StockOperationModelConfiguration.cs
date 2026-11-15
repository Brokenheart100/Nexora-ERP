using Microsoft.EntityFrameworkCore;
using Nexora.Inventory.Domain;

namespace Nexora.Inventory.Infrastructure;

internal static class StockOperationModelConfiguration
{
    internal static void Configure(ModelBuilder model)
    {
        var row = model.Entity<StockOperation>();
        row.ToTable("stock_operations");
        row.Property(x => x.Id).ValueGeneratedNever();
        row.Property(x => x.Version).IsConcurrencyToken();
        row.Property(x => x.Quantity).HasPrecision(20, 6);
        row.Property(x => x.BookQuantity).HasPrecision(20, 6);
        row.Property(x => x.TransitCost).HasPrecision(20, 6);
        row.Property(x => x.Reason).HasMaxLength(300);
        row.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.WarehouseId });
        row.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.DestinationId });
    }
}
