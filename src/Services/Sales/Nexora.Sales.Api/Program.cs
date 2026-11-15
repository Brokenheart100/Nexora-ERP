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
using Nexora.Sales.Api;
using Nexora.Sales.Application;
using Nexora.Sales.Infrastructure;
using Wolverine;
using Wolverine.EntityFrameworkCore;
using Wolverine.HealthChecks;
using Wolverine.Http;

var builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();
builder.AddNexoraBearer();
var connection = builder.Configuration.GetConnectionString("salesdb")
    ?? throw new InvalidOperationException("salesdb connection is required.");
var broker = builder.Configuration.GetConnectionString("rabbitmq") ?? throw new InvalidOperationException("rabbitmq is required.");
var recordChanges = new RecordChangeInterceptor("sales");
builder.Services.AddDbContextWithWolverineIntegration<SalesDbContext>(options => options.UseNpgsql(connection).AddInterceptors(recordChanges), "sales_messages");
builder.Services.AddRecordChanges<SalesDbContext>(builder.Configuration, recordChanges);
builder.Services.AddHttpContextAccessor();
var readiness = builder.Services.AddHealthChecks().AddWolverine(tags: ["ready"]).AddRabbitReadiness(broker)
    .AddDependency("sales-database", async (services, ct) =>
    {
        if (!await services.GetRequiredService<SalesDbContext>().Database.CanConnectAsync(ct))
            throw new InvalidOperationException("Database unavailable.");
    });
foreach (var upstream in new[] { "organization", "masterdata", "finance", "inventory" })
{
    readiness.AddHttpReadiness(upstream, new Uri(new Uri($"https+http://{upstream}"), "/health"));
}
builder.Services.AddScoped<ISalesAuthority, SalesAuthority>();
builder.Services.AddScoped<ISalesOrders, SalesOrderStore>();
builder.Services.AddScoped<SalesQueries>();
builder.Services.AddScoped<SalesCommands>();
builder.Services.AddScoped<ISalesAuditReader, SalesAuditReader>();
builder.Services.AddScoped<SalesAuditQueries>();
builder.Services.AddScoped<RecordChangeQueries>();
builder.Services.AddScoped<ISalesFulfillments, SalesFulfillmentStore>();
builder.Services.AddScoped<SalesFulfillmentUseCases>();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddJasperFxEnumerableSingletonSupport();
builder.AddSalesMessaging(typeof(Program).Assembly, connection, broker);
if (builder.Environment.IsDevelopment()) builder.Host.UseResourceSetupOnStartup();
builder.Services.AddWolverineHttp();
builder.Services.AddBusinessOpenApi(options => options.AddDocumentTransformer<SalesOrderOpenApi>());
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
app.UseSalesExceptionHandling();
app.UseAuthentication();
app.UseRecordChanges();
app.UseAuthorization();
app.MapDefaultEndpoints();
app.MapBusinessOpenApi();
app.MapWolverineEndpoints(options => options.RejectUnparseableQueryValues = true);
if (app.Environment.IsDevelopment())
{
    await using var scope = app.Services.CreateAsyncScope();
    await scope.ServiceProvider.GetRequiredService<SalesDbContext>().Database.MigrateAsync();
}
await app.RunAsync();

public partial class Program;
