using Microsoft.EntityFrameworkCore;
using Nexora.Sales.Domain;

namespace Nexora.Sales.Infrastructure;

internal static class SalesFulfillmentModelConfiguration
{
    internal static void Configure(ModelBuilder model)
    {
        var permit = model.Entity<FulfillmentPermit>();
        permit.ToTable("fulfillment_permits");
        permit.Property(x => x.Id).ValueGeneratedNever();
        permit.Property(x => x.Quantity).HasPrecision(20, 6);
        permit.Property(x => x.Executed).HasPrecision(20, 6);
        permit.HasOne<SalesOrder>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkspaceId, x.OrderId })
            .HasPrincipalKey(x => new { x.TenantId, x.WorkspaceId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        var saga = model.Entity<FulfillmentProcess>();
        saga.ToTable("fulfillment_processes");
        saga.Property(x => x.Id).ValueGeneratedNever();
    }
}
