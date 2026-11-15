using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Infrastructure;
using Nexora.Purchasing.Application;
using Nexora.Purchasing.Domain;

namespace Nexora.Purchasing.Infrastructure;

public sealed class PurchasingDbContext(DbContextOptions<PurchasingDbContext> options) : DbContext(options)
{
    public DbSet<PurchaseOrder> Orders => Set<PurchaseOrder>();
    public DbSet<PurchaseAudit> Audit => Set<PurchaseAudit>();
    public DbSet<RecordChange> RecordChanges => Set<RecordChange>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        PurchasingModelConfiguration.Configure(model);
        RecordChangeConfiguration.Configure(model);
    }
}
