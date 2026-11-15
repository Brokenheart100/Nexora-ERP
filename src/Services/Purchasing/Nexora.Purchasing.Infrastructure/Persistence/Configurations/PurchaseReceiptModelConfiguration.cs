using Microsoft.EntityFrameworkCore;
using Nexora.Purchasing.Domain;

namespace Nexora.Purchasing.Infrastructure;

internal static class PurchaseReceiptModelConfiguration
{
    internal static void Configure(ModelBuilder model)
    {
        var permit = model.Entity<ReceiptPermit>();
        permit.ToTable("receipt_permits");
        permit.Property(x => x.Id).ValueGeneratedNever();
        permit.Property(x => x.Quantity).HasPrecision(20, 6);
        permit.Property(x => x.Executed).HasPrecision(20, 6);
        permit.HasOne<PurchaseOrder>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkspaceId, x.OrderId })
            .HasPrincipalKey(x => new { x.TenantId, x.WorkspaceId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        var saga = model.Entity<ReceiptProcess>();
        saga.ToTable("receipt_processes");
        saga.Property(x => x.Id).ValueGeneratedNever();
    }
}
