using Nexora.ServiceDefaults.Http;
using Grpc.Core;
using ProtoBuf.Grpc.Server;
using Wolverine.Grpc;
using Nexora.BuildingBlocks.Grpc;
using Nexora.BuildingBlocks.Application;
using Nexora.BuildingBlocks.Infrastructure;
using Nexora.Inventory.Contracts.Grpc;
using Nexora.Organization.Contracts.Grpc;
using JasperFx;
using JasperFx.Resources;
using Microsoft.EntityFrameworkCore;
using Nexora.Inventory.Api;
using Nexora.Inventory.Application;
using Nexora.Inventory.Infrastructure;
using Wolverine;
using Wolverine.EntityFrameworkCore;
using Wolverine.HealthChecks;
using Wolverine.Http;

var builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();
builder.AddNexoraBearer();
var connection = builder.Configuration.GetConnectionString("inventorydb") ?? throw new InvalidOperationException("inventorydb is required.");
var broker = builder.Configuration.GetConnectionString("rabbitmq") ?? throw new InvalidOperationException("rabbitmq is required.");
var recordChanges = new RecordChangeInterceptor("inventory");
builder.Services.AddDbContextWithWolverineIntegration<InventoryDbContext>(options => options.UseNpgsql(connection).AddInterceptors(recordChanges), "inventory_messages");
builder.Services.AddRecordChanges<InventoryDbContext>(builder.Configuration, recordChanges);
builder.Services.AddHttpContextAccessor();
builder.Services.AddHealthChecks().AddWolverine(tags: ["ready"]).AddRabbitReadiness(broker)
    .AddDependency("inventory-database", async (services, ct) =>
    {
        if (!await services.GetRequiredService<InventoryDbContext>().Database.CanConnectAsync(ct))
            throw new InvalidOperationException("Database unavailable.");
    }).AddHttpReadiness("organization", new Uri("https+http://organization/health"));
builder.Services.AddScoped<IInventoryAuthority, InventoryAuthority>();
builder.Services.AddScoped<IStockStore, StockStore>();
builder.Services.AddScoped<ISalesStock, SalesStockStore>();
builder.Services.AddScoped<IStockOperations, StockOperationStore>();
builder.Services.AddScoped<InventoryUseCases>();
builder.Services.AddScoped<RecordChangeQueries>();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddJasperFxEnumerableSingletonSupport();
builder.AddInventoryMessaging(typeof(Program).Assembly, connection, broker);
if (builder.Environment.IsDevelopment()) builder.Host.UseResourceSetupOnStartup();
builder.Services.AddWolverineHttp();
builder.Services.AddBusinessOpenApi();
builder.Services.AddNexoraProblemDetails();

builder.Services.AddCodeFirstGrpc();
builder.Services.AddWolverineGrpc(grpc =>
{
    grpc.IncludeCodeFirstContract<IInventoryGrpc>();
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
app.UseInventoryExceptionHandling();
app.UseAuthentication();
app.UseRecordChanges();
app.UseAuthorization();
app.UseIdempotencyHeaders();
app.MapWolverineGrpcServices();
app.MapDefaultEndpoints();
app.MapBusinessOpenApi();
app.MapWolverineEndpoints(options => options.RejectUnparseableQueryValues = true);
if (app.Environment.IsDevelopment())
{
    await using var scope = app.Services.CreateAsyncScope();
    await scope.ServiceProvider.GetRequiredService<InventoryDbContext>().Database.MigrateAsync();
}
await app.RunAsync();

public partial class Program;