using Microsoft.EntityFrameworkCore;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

internal static class InvoiceDispatchModelConfiguration
{
    internal static void Configure(ModelBuilder model)
    {
        var dispatch = model.Entity<InvoiceDispatch>();
        dispatch.ToTable("invoice_dispatches");
        dispatch.Property(x => x.Id).ValueGeneratedNever();
        dispatch.Property(x => x.Version).IsConcurrencyToken();
        dispatch.Property(x => x.Recipient).HasMaxLength(254);
        dispatch.Property(x => x.Detail).HasMaxLength(300);
        dispatch.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.InvoiceId });
    }
}
