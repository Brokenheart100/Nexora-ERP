using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Configuration;
using Nexora.Reporting.Application;
using Wolverine.EntityFrameworkCore;

namespace Nexora.Reporting.Infrastructure;

public static class DependencyInjection
{
    public static void AddReporting(this IHostApplicationBuilder builder, System.Reflection.Assembly applicationAssembly)
    {
        var database = builder.Configuration.GetConnectionString("reportingdb") ?? throw new InvalidOperationException("reportingdb is required.");
        var broker = builder.Configuration.GetConnectionString("rabbitmq") ?? throw new InvalidOperationException("rabbitmq is required.");
        builder.Services.AddDbContextWithWolverineIntegration<ReportingDbContext>(options => options.UseNpgsql(database), "reporting_messages");
        builder.Services.AddScoped<IWorkspaceProjectionReader, WorkspaceProjectionReader>();
        builder.AddReportingMessaging(applicationAssembly, database, broker);
    }
}
