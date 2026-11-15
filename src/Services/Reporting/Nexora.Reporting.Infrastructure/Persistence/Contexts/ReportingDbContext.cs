using Microsoft.EntityFrameworkCore;
using Nexora.Reporting.Application;

namespace Nexora.Reporting.Infrastructure;

public sealed class ReportingDbContext(DbContextOptions<ReportingDbContext> options) : DbContext(options)
{
    public DbSet<WorkspaceProjection> Workspaces => Set<WorkspaceProjection>();
    public DbSet<WorkspaceAuthorizationWatermark> AuthorizationVersions => Set<WorkspaceAuthorizationWatermark>();
    protected override void OnModelCreating(ModelBuilder model) => ReportingModelConfiguration.Configure(model);
}

public sealed record WorkspaceAuthorizationWatermark(Guid WorkspaceId, Guid TenantId, long Version, Guid LastEventId);
