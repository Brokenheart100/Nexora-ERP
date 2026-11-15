using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Nexora.MasterData.Infrastructure;

public sealed class DesignTimeContextFactory : IDesignTimeDbContextFactory<CatalogDbContext>
{
    public CatalogDbContext CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<CatalogDbContext>()
        .UseNpgsql("Host=localhost;Database=nexora_design_only;Username=nexora_design_only").Options);
}
