using Microsoft.EntityFrameworkCore;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

internal static class DonationFiscalTicketConfiguration
{
    internal static void Configure(ModelBuilder model)
    {
        var ticket = model.Entity<DonationFiscalTicket>();
        ticket.ToTable("donation_fiscal_tickets");
        ticket.Property(x => x.Id).ValueGeneratedNever();
        ticket.Property(x => x.Code).HasMaxLength(40);
        ticket.Property(x => x.Number).HasMaxLength(40);
        ticket.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.DonationId }).IsUnique();
        ticket.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.Code, x.Number }).IsUnique();
        ticket.HasOne<TradeDocument>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkspaceId, x.DonationId })
            .HasPrincipalKey(x => new { x.TenantId, x.WorkspaceId, x.Id }).OnDelete(DeleteBehavior.Restrict);
    }
}
