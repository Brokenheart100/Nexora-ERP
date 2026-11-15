using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
namespace Nexora.Reporting.Infrastructure;
public sealed class DesignTimeContextFactory : IDesignTimeDbContextFactory<ReportingDbContext>
{
    public ReportingDbContext CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<ReportingDbContext>()
        .UseNpgsql(Environment.GetEnvironmentVariable("NEXORA_DESIGN_DATABASE") ?? "Host=localhost;Database=nexora_design_only;Username=nexora_design_only").Options);
}
