using Nexora.ServiceDefaults.Http;
using Nexora.BuildingBlocks.Grpc;
using Nexora.BuildingBlocks.Infrastructure;
using Nexora.Organization.Contracts.Grpc;
using Nexora.MasterData.Contracts.Grpc;
using Nexora.Finance.Contracts.Grpc;
using Nexora.Inventory.Contracts.Grpc;
using JasperFx;
using JasperFx.Resources;
using Microsoft.EntityFrameworkCore;
using Nexora.Purchasing.Api;
using Nexora.Purchasing.Application;
using Nexora.Purchasing.Infrastructure;
using Wolverine;
using Wolverine.EntityFrameworkCore;
using Wolverine.HealthChecks;
using Wolverine.Http;

var builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();
builder.AddNexoraBearer();
var connection = builder.Configuration.GetConnectionString("purchasingdb")
    ?? throw new InvalidOperationException("purchasingdb connection is required.");
var broker = builder.Configuration.GetConnectionString("rabbitmq") ?? throw new InvalidOperationException("rabbitmq is required.");
var recordChanges = new RecordChangeInterceptor("purchasing");
builder.Services.AddDbContextWithWolverineIntegration<PurchasingDbContext>(options => options.UseNpgsql(connection).AddInterceptors(recordChanges), "purchasing_messages");
builder.Services.AddRecordChanges<PurchasingDbContext>(builder.Configuration, recordChanges);
builder.Services.AddHttpContextAccessor();
var readiness = builder.Services.AddHealthChecks().AddWolverine(tags: ["ready"]).AddRabbitReadiness(broker)
    .AddDependency("purchasing-database", async (services, ct) =>
    {
        if (!await services.GetRequiredService<PurchasingDbContext>().Database.CanConnectAsync(ct))
            throw new InvalidOperationException("Database unavailable.");
    });
foreach (var upstream in new[] { "organization", "masterdata", "finance", "inventory" })
{
    readiness.AddHttpReadiness(upstream, new Uri(new Uri($"https+http://{upstream}"), "/health"));
}
builder.Services.AddScoped<IPurchaseAuthority, PurchaseAuthority>();
builder.Services.AddScoped<IPurchaseOrders, PurchaseOrderStore>();
builder.Services.AddScoped<PurchaseQueries>();
builder.Services.AddScoped<PurchaseCommands>();
builder.Services.AddScoped<IPurchaseAuditReader, PurchaseAuditReader>();
builder.Services.AddScoped<PurchaseAuditQueries>();
builder.Services.AddScoped<RecordChangeQueries>();
builder.Services.AddScoped<IPurchaseReceipts, PurchaseReceiptStore>();
builder.Services.AddScoped<PurchaseReceiptUseCases>();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddJasperFxEnumerableSingletonSupport();
builder.AddPurchasingMessaging(typeof(Program).Assembly, connection, broker);
if (builder.Environment.IsDevelopment()) builder.Host.UseResourceSetupOnStartup();
builder.Services.AddWolverineHttp();
builder.Services.AddBusinessOpenApi();
builder.Services.AddNexoraProblemDetails();

builder.Services.AddNexoraGrpcClient<IOrganizationGrpc>("organization");
builder.Services.AddNexoraGrpcClient<IMasterDataGrpc>("masterdata");
builder.Services.AddNexoraGrpcClient<IFinanceGrpc>("finance");
builder.Services.AddNexoraGrpcClient<IInventoryGrpc>("inventory");

var app = builder.Build();
app.UseApiStatusProblems();
app.Use(async (context, next) =>
{
    context.Response.Headers.CacheControl = "no-store";
    await next(context);
});
app.UsePurchasingExceptionHandling();
app.UseAuthentication();
app.UseRecordChanges();
app.UseAuthorization();
app.UseIdempotencyHeaders();
app.MapDefaultEndpoints();
app.MapBusinessOpenApi();
app.MapWolverineEndpoints(options => options.RejectUnparseableQueryValues = true);
if (app.Environment.IsDevelopment())
{
    await using var scope = app.Services.CreateAsyncScope();
    await scope.ServiceProvider.GetRequiredService<PurchasingDbContext>().Database.MigrateAsync();
}
await app.RunAsync();

public partial class Program;