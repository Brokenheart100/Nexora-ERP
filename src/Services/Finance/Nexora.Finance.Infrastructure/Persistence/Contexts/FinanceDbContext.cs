using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Infrastructure;
using Nexora.Finance.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

public sealed class FinanceDbContext(DbContextOptions<FinanceDbContext> options) : DbContext(options)
{
    public DbSet<AccountingBook> Books => Set<AccountingBook>();
    public DbSet<ChartAccount> Accounts => Set<ChartAccount>();
    public DbSet<ChartImportPreview> ImportPreviews => Set<ChartImportPreview>();
    public DbSet<FinanceAudit> Audit => Set<FinanceAudit>();
    public DbSet<RecordChange> RecordChanges => Set<RecordChange>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        FinanceModelConfiguration.Configure(model);
        RecordChangeConfiguration.Configure(model);
    }
}
