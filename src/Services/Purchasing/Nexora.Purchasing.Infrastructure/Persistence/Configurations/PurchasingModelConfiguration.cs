using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Infrastructure;
using Nexora.Purchasing.Application;
using Nexora.Purchasing.Domain;

namespace Nexora.Purchasing.Infrastructure;

internal static class PurchasingModelConfiguration
{
    internal static void Configure(ModelBuilder model)
    {
        model.HasDefaultSchema("purchasing");
        PurchaseReceiptModelConfiguration.Configure(model);
        var order = model.Entity<PurchaseOrder>();
        order.ToTable("orders");
        order.Property(x => x.Id).ValueGeneratedNever();
        order.HasAlternateKey(x => new { x.TenantId, x.WorkspaceId, x.Id });
        order.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.Number }).IsUnique();
        order.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.MakerIssuer, x.MakerSubject, x.CreatedAtUtc });
        order.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.CreatedAtUtc });
        order.Property(x => x.Version).IsConcurrencyToken();
        order.Property(x => x.Number).HasMaxLength(60);
        order.Property(x => x.Currency).HasMaxLength(3);
        order.Property(x => x.SupplierCode).HasMaxLength(40);
        order.Property(x => x.SupplierName).HasMaxLength(160);
        order.Property(x => x.Note).HasMaxLength(300);
        order.Property(x => x.MakerIssuer).HasMaxLength(500);
        order.Property(x => x.MakerSubject).HasMaxLength(200);
        order.Property(x => x.ApproverIssuer).HasMaxLength(500);
        order.Property(x => x.ApproverSubject).HasMaxLength(200);
        order.HasMany(x => x.Lines).WithOne().HasForeignKey(x => new { x.TenantId, x.WorkspaceId, x.OrderId })
            .HasPrincipalKey(x => new { x.TenantId, x.WorkspaceId, x.Id }).OnDelete(DeleteBehavior.Cascade);
        order.Navigation(x => x.Lines).HasField("_lines").UsePropertyAccessMode(PropertyAccessMode.Field);

        var line = model.Entity<PurchaseOrderLine>();
        line.ToTable("order_lines");
        line.Property(x => x.Id).ValueGeneratedNever();
        line.Property(x => x.ItemCode).HasMaxLength(40);
        line.Property(x => x.ItemName).HasMaxLength(160);
        line.Property(x => x.UnitCode).HasMaxLength(40);
        line.Property(x => x.Quantity).HasPrecision(20, 6);
        line.Property(x => x.UnitPrice).HasPrecision(20, 6);
        line.Property(x => x.Amount).HasPrecision(20, 6);

        var audit = model.Entity<PurchaseAudit>();
        audit.ToTable("order_audit");
        audit.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.Issuer, x.Subject, x.OperationId }).IsUnique();
        audit.Property(x => x.Issuer).HasMaxLength(500);
        audit.Property(x => x.Subject).HasMaxLength(200);
        audit.Property(x => x.Action).HasMaxLength(40);
        audit.Property(x => x.Fingerprint).HasMaxLength(64);
        audit.Property(x => x.Reason).HasMaxLength(300);
        audit.HasOne<PurchaseOrder>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkspaceId, x.OrderId })
            .HasPrincipalKey(x => new { x.TenantId, x.WorkspaceId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        RecordChangeConfiguration.Configure(model);
    }
}
