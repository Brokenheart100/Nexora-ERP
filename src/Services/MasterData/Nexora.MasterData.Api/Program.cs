using Nexora.ServiceDefaults.Http;
using Grpc.Core;
using ProtoBuf.Grpc.Server;
using Wolverine.Grpc;
using Nexora.BuildingBlocks.Grpc;
using Nexora.BuildingBlocks.Application;
using Nexora.BuildingBlocks.Infrastructure;
using Nexora.MasterData.Contracts.Grpc;
using Nexora.Organization.Contracts.Grpc;
using FluentValidation;
using JasperFx;
using JasperFx.Resources;
using Microsoft.EntityFrameworkCore;
using Nexora.MasterData.Application;
using Nexora.MasterData.Infrastructure;
using Wolverine;
using Wolverine.EntityFrameworkCore;
using Wolverine.HealthChecks;
using Wolverine.Http;
using Wolverine.Http.FluentValidation;

namespace Nexora.MasterData.Api;

public partial class Program
{
    public static async Task Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);
        builder.AddServiceDefaults();
        builder.AddNexoraBearer();
        var connection = builder.Configuration.GetConnectionString("masterdatadb")
            ?? throw new InvalidOperationException("masterdatadb connection is required.");
        var broker = builder.Configuration.GetConnectionString("rabbitmq")
            ?? throw new InvalidOperationException("rabbitmq connection is required.");
        var recordChanges = new RecordChangeInterceptor("masterdata");
        builder.Services.AddDbContextWithWolverineIntegration<CatalogDbContext>(options => options.UseNpgsql(connection).AddInterceptors(recordChanges), "masterdata_messages");
        builder.Services.AddRecordChanges<CatalogDbContext>(builder.Configuration, recordChanges);
        builder.Services.AddHttpContextAccessor();
        builder.Services.AddScoped<ICatalogAccess, OrganizationCatalogAccess>();
        builder.Services.AddScoped<ICatalogRepository, CatalogRepository>();
        builder.Services.AddScoped<ICatalogReader, CatalogReader>();
        builder.Services.AddScoped<CatalogCommands>();
        builder.Services.AddScoped<CatalogQueries>();
        builder.Services.AddScoped<CatalogMutations>();
        builder.Services.AddScoped<IPartnerRepository, PartnerStore>();
        builder.Services.AddScoped<IPartnerReader, PartnerStore>();
        builder.Services.AddScoped<PartnerCommands>();
        builder.Services.AddScoped<PartnerQueries>();
        builder.Services.AddScoped<RecordChangeQueries>();
        builder.Services.AddSingleton(TimeProvider.System);
        builder.Services.AddSingleton<IValidator<AddDefinitionRequest>, AddDefinitionValidator>();
        builder.Services.AddSingleton<IValidator<ReviseDefinitionRequest>, ReviseDefinitionValidator>();
        builder.Services.AddSingleton<IValidator<AddItemRequest>, AddItemValidator>();
        builder.Services.AddSingleton<IValidator<ReviseItemRequest>, ReviseItemValidator>();
        builder.Services.AddSingleton<IValidator<AddPartnerRequest>, AddPartnerValidator>();
        builder.Services.AddSingleton<IValidator<RevisePartnerRequest>, RevisePartnerValidator>();
        builder.Services.AddJasperFxEnumerableSingletonSupport();
        builder.AddMasterDataMessaging(typeof(Program).Assembly, connection, broker);
        builder.Services.AddWolverineHttp();
        if (builder.Environment.IsDevelopment()) builder.Host.UseResourceSetupOnStartup();
        builder.Services.AddBusinessOpenApi();
        builder.Services.AddNexoraProblemDetails();
        builder.Services.AddHealthChecks()
            .AddWolverine(tags: ["ready"])
            .AddRabbitReadiness(broker)
            .AddDependency("masterdata-database", async (services, ct) =>
            {
                if (!await services.GetRequiredService<CatalogDbContext>().Database.CanConnectAsync(ct))
                    throw new InvalidOperationException("Database unavailable.");
            })
            .AddHttpReadiness("organization", new Uri("https+http://organization/health"));

        builder.Services.AddCodeFirstGrpc();
builder.Services.AddWolverineGrpc(grpc =>
{
    grpc.IncludeCodeFirstContract<IMasterDataGrpc>();
    grpc.RequireAuthorizeOnAll();
    grpc.MapException<AccessDeniedException>(StatusCode.PermissionDenied);
    grpc.MapException<ResourceNotFoundException>(StatusCode.NotFound);
    grpc.MapException<BusinessConflictException>(StatusCode.FailedPrecondition);
    grpc.MapException<IdempotencyConflictException>(StatusCode.Aborted);
});
builder.Services.AddNexoraGrpcClient<IOrganizationGrpc>("organization");

var app = builder.Build();
app.UseApiStatusProblems();
        app.Use(async (context, next) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            await next(context);
        });
        app.UseMasterDataExceptionHandling();
        app.UseAuthentication();
        app.UseRecordChanges();
        app.UseAuthorization();
        app.UseIdempotencyHeaders();
app.MapWolverineGrpcServices();
        app.MapDefaultEndpoints();
        app.MapBusinessOpenApi();
        app.MapWolverineEndpoints(options =>
        {
            options.RejectUnparseableQueryValues = true;
            options.UseFluentValidationProblemDetailMiddleware();
        });
        if (app.Environment.IsDevelopment())
        {
            await using var scope = app.Services.CreateAsyncScope();
            await scope.ServiceProvider.GetRequiredService<CatalogDbContext>().Database.MigrateAsync();
        }
        await app.RunAsync();
    }
}