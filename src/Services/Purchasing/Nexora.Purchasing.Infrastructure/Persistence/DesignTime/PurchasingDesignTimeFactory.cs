using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Nexora.Purchasing.Infrastructure;

public sealed class PurchasingDesignTimeFactory : IDesignTimeDbContextFactory<PurchasingDbContext>
{
    public PurchasingDbContext CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<PurchasingDbContext>()
        .UseNpgsql("Host=localhost;Database=nexora_design_only;Username=nexora_design_only").Options);
}
