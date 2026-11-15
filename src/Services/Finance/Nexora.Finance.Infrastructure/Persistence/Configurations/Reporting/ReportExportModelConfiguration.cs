using Microsoft.EntityFrameworkCore;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

internal static class ReportExportModelConfiguration
{
    internal static void Configure(ModelBuilder model)
    {
        var job = model.Entity<ReportExport>();
        job.ToTable("report_exports");
        job.Property(x => x.Id).ValueGeneratedNever();
        job.Property(x => x.Issuer).HasMaxLength(500);
        job.Property(x => x.Subject).HasMaxLength(200);
        job.Property(x => x.Kind).HasMaxLength(20);
        job.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.Issuer, x.Subject, x.RequestedAtUtc });
    }
}
