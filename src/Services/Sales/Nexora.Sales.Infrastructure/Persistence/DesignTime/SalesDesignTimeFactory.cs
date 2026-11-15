using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Nexora.Sales.Infrastructure;

public sealed class SalesDesignTimeFactory : IDesignTimeDbContextFactory<SalesDbContext>
{
    public SalesDbContext CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<SalesDbContext>()
        .UseNpgsql("Host=localhost;Database=nexora_design_only;Username=nexora_design_only").Options);
}
