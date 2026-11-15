using Nexora.ServiceDefaults.Http;
using Grpc.Core;
using JasperFx.Resources;
using JasperFx;
using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Grpc;
using Nexora.Organization.Contracts.Grpc;
using Nexora.Reporting.Infrastructure;
using Wolverine.Http;
using Wolverine.HealthChecks;

namespace Nexora.Reporting.Api;

public partial class Program
{
    public static async Task Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);
        builder.AddServiceDefaults();
        builder.AddNexoraBearer();
        builder.AddReporting(typeof(Program).Assembly);
        builder.Services.AddHealthChecks()
            .AddWolverine(tags: ["ready"], timeout: TimeSpan.FromSeconds(4))
            .AddWolverineListeners(filter: listener => listener.Uri.Scheme == "rabbitmq",
                tags: ["ready"], timeout: TimeSpan.FromSeconds(4))
            .AddDependency("reporting-database", async (services, cancellation) =>
            {
                if (!await services.GetRequiredService<ReportingDbContext>().Database.CanConnectAsync(cancellation))
                    throw new InvalidOperationException("Database unavailable.");
            })
            .AddRabbitReadiness(builder.Configuration.GetConnectionString("rabbitmq")!)
            .AddHttpReadiness("identity", new Uri(builder.Configuration["Authentication:Authority"]!.TrimEnd('/') + "/.well-known/openid-configuration"))
            .AddHttpReadiness("organization", new Uri("https+http://organization/health"));
        builder.Services.AddNexoraGrpcClient<IOrganizationGrpc>("organization");
        builder.Services.AddWolverineHttp();
        builder.Services.AddBusinessOpenApi();
        builder.Services.AddNexoraProblemDetails();
        if (builder.Environment.IsDevelopment()) builder.Host.UseResourceSetupOnStartup();
        builder.Services.AddJasperFxEnumerableSingletonSupport();
        var app = builder.Build();
        app.UseApiStatusProblems();
        app.UseExceptionHandler();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapDefaultEndpoints();
        app.MapBusinessOpenApi();
        app.MapWolverineEndpoints();
        if (app.Environment.IsDevelopment())
        {
            await using var scope = app.Services.CreateAsyncScope();
            await scope.ServiceProvider.GetRequiredService<ReportingDbContext>().Database.MigrateAsync();
        }
        await app.RunAsync();
    }
}
