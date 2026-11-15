using Microsoft.EntityFrameworkCore;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

internal static class FiscalYearModelConfiguration
{
    internal static void Configure(ModelBuilder model)
    {
        var row = model.Entity<FiscalYearClose>();
        row.ToTable("fiscal_year_closings");
        row.Property(x => x.Id).ValueGeneratedNever();
        row.Property(x => x.Version).IsConcurrencyToken();
        row.Property(x => x.MakerIssuer).HasMaxLength(500);
        row.Property(x => x.MakerSubject).HasMaxLength(200);
        row.Property(x => x.ReopenReason).HasMaxLength(300);
        row.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.First }).IsUnique().HasFilter("\"State\" = 2");
    }
}
