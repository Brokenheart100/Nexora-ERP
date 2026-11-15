using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Nexora.Inventory.Infrastructure;

public sealed class InventoryDesignTimeFactory : IDesignTimeDbContextFactory<InventoryDbContext>
{
    public InventoryDbContext CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<InventoryDbContext>()
        .UseNpgsql("Host=localhost;Database=nexora_design_only;Username=nexora_design_only").Options);
}
