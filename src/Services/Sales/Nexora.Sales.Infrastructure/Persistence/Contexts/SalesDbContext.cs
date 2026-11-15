using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Infrastructure;
using Nexora.Sales.Application;
using Nexora.Sales.Domain;

namespace Nexora.Sales.Infrastructure;

public sealed class SalesDbContext(DbContextOptions<SalesDbContext> options) : DbContext(options)
{
    public DbSet<SalesOrder> Orders => Set<SalesOrder>();
    public DbSet<SalesAudit> Audit => Set<SalesAudit>();
    public DbSet<RecordChange> RecordChanges => Set<RecordChange>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        SalesModelConfiguration.Configure(model);
        RecordChangeConfiguration.Configure(model);
    }
}
