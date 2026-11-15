using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Nexora.Inventory.Domain;

namespace Nexora.Inventory.Infrastructure;

internal static class SalesStockModelConfiguration
{
    internal static void Configure(ModelBuilder model)
    {
        var entity = model.Entity<SalesReservation>();
        entity.ToTable("sales_reservations");
        entity.Property(x => x.Id).ValueGeneratedNever();
        entity.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.WarehouseId });
        entity.Property(x => x.Executed).HasPrecision(20, 6);
        entity.Property(x => x.Terms).HasConversion(x => JsonSerializer.Serialize(x, (JsonSerializerOptions?)null),
            x => JsonSerializer.Deserialize<ShipmentTerms>(x, (JsonSerializerOptions?)null)!).HasColumnType("jsonb");
    }
}
