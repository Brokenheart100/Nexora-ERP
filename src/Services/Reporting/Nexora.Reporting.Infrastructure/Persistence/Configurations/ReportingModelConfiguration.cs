using Microsoft.EntityFrameworkCore;
using Nexora.Reporting.Application;

namespace Nexora.Reporting.Infrastructure;

internal static class ReportingModelConfiguration
{
    internal static void Configure(ModelBuilder model)
    {
        model.HasDefaultSchema("reporting");
        var workspace = model.Entity<WorkspaceProjection>();
        workspace.ToTable("workspace_projection");
        workspace.HasKey(x => x.WorkspaceId);
        workspace.Property(x => x.Name).HasMaxLength(160);
        workspace.Property(x => x.CountryCode).HasMaxLength(2);
        workspace.Property(x => x.BaseCurrency).HasMaxLength(3);
        workspace.HasIndex(x => x.LastEventId).IsUnique();
        var authorization = model.Entity<WorkspaceAuthorizationWatermark>();
        authorization.ToTable("workspace_authorization_watermarks");
        authorization.HasKey(x => x.WorkspaceId);
        authorization.Property(x => x.WorkspaceId).ValueGeneratedNever();
        authorization.Property(x => x.Version).IsConcurrencyToken();
    }
}
