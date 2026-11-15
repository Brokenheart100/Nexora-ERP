using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Infrastructure;
using Nexora.MasterData.Application;
using Nexora.MasterData.Domain;

namespace Nexora.MasterData.Infrastructure;

public sealed class CatalogDbContext(DbContextOptions<CatalogDbContext> options) : DbContext(options)
{
    public DbSet<CatalogDefinition> Definitions => Set<CatalogDefinition>();
    public DbSet<CatalogItem> Items => Set<CatalogItem>();
    public DbSet<CatalogReceipt> Receipts => Set<CatalogReceipt>();
    public DbSet<BusinessPartner> Partners => Set<BusinessPartner>();
    public DbSet<RecordChange> RecordChanges => Set<RecordChange>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        MasterDataModelConfiguration.Configure(model);
        RecordChangeConfiguration.Configure(model);
    }
}
