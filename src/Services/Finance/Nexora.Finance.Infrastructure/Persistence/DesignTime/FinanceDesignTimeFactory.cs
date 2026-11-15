using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Nexora.Finance.Infrastructure;

public sealed class FinanceDesignTimeFactory : IDesignTimeDbContextFactory<FinanceDbContext>
{
    public FinanceDbContext CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<FinanceDbContext>()
        .UseNpgsql("Host=localhost;Database=nexora_design_only;Username=nexora_design_only").Options);
}
