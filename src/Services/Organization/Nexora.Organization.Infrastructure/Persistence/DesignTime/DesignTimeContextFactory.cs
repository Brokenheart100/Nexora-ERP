using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
namespace Nexora.Organization.Infrastructure;

public sealed class DesignTimeContextFactory : IDesignTimeDbContextFactory<OrganizationDbContext>
{
    public OrganizationDbContext CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<OrganizationDbContext>()
        .UseNpgsql(Environment.GetEnvironmentVariable("NEXORA_DESIGN_DATABASE") ?? "Host=localhost;Database=nexora_design_only;Username=nexora_design_only").Options);
}
