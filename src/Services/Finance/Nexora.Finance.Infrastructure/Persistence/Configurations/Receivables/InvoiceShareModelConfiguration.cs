using Microsoft.EntityFrameworkCore;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

internal static class InvoiceShareModelConfiguration
{
    internal static void Configure(ModelBuilder model)
    {
        var shares = model.Entity<InvoiceShare>();
        shares.ToTable("invoice_shares");
        shares.Property(x => x.Id).ValueGeneratedNever();
        shares.Property(x => x.TokenHash).HasMaxLength(64);
        shares.HasIndex(x => x.TokenHash).IsUnique();
        shares.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.InvoiceId });
    }
}
