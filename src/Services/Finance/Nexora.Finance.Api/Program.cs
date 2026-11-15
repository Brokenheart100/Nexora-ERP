using Nexora.ServiceDefaults.Http;
using Grpc.Core;
using ProtoBuf.Grpc.Server;
using Wolverine.Grpc;
using Nexora.BuildingBlocks.Grpc;
using Nexora.BuildingBlocks.Application;
using Nexora.BuildingBlocks.Infrastructure;
using Nexora.Finance.Contracts.Grpc;
using Nexora.Organization.Contracts.Grpc;
using Nexora.MasterData.Contracts.Grpc;
using FluentValidation;
using JasperFx;
using JasperFx.Resources;
using Microsoft.EntityFrameworkCore;
using Nexora.Finance.Application;
using Nexora.Finance.Infrastructure;
using Wolverine;
using Wolverine.EntityFrameworkCore;
using Wolverine.HealthChecks;
using Wolverine.Http;
using Wolverine.Http.FluentValidation;

namespace Nexora.Finance.Api;

public partial class Program
{
    public static async Task Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);
        builder.AddServiceDefaults();
        builder.AddNexoraBearer();
        var connection = builder.Configuration.GetConnectionString("financedb")
            ?? throw new InvalidOperationException("financedb connection is required.");
        var broker = builder.Configuration.GetConnectionString("rabbitmq") ?? throw new InvalidOperationException("rabbitmq is required.");
        var recordChanges = new RecordChangeInterceptor("finance");
        builder.Services.AddDbContextWithWolverineIntegration<FinanceDbContext>(options => options.UseNpgsql(connection).AddInterceptors(recordChanges), "finance_messages");
        builder.Services.AddRecordChanges<FinanceDbContext>(builder.Configuration, recordChanges);
        builder.Services.AddHttpContextAccessor();
        builder.Services.AddScoped<IBookAccess, OrganizationBookAccess>();
        builder.Services.AddScoped<IBookStore, BookStore>();
        builder.Services.AddScoped<BookUseCases>();
        builder.Services.AddScoped<IChartStore, ChartStore>();
        builder.Services.AddScoped<ChartUseCases>();
        builder.Services.AddScoped<FinanceMutation>();
        builder.Services.AddScoped<ITaxStore, TaxStore>();
        builder.Services.AddScoped<ITaxReferenceAuthority, MasterDataTaxReference>();
        builder.Services.AddScoped<TaxUseCases>();
        builder.Services.AddScoped<ILedgerStore, LedgerStore>();
        builder.Services.AddScoped<LedgerUseCases>();
        builder.Services.AddScoped<IFiscalYearStore, FiscalYearStore>();
        builder.Services.AddScoped<FiscalYearCloses>();
        builder.Services.AddScoped<IFinancialReportReader, FinancialReportReader>();
        builder.Services.AddScoped<FinancialReports>();
        builder.Services.AddScoped<IReportExportStore, ReportExportStore>();
        builder.Services.AddScoped<ReportExports>();
        builder.Services.AddScoped<OpenItemReports>();
        builder.Services.AddScoped<IFinanceAuditReader, FinanceAuditReader>();
        builder.Services.AddScoped<FinanceAuditQueries>();
        builder.Services.AddScoped<RecordChangeQueries>();
        builder.Services.AddScoped<IFinanceHistoryReader, Nexora.Finance.Infrastructure.FinanceHistoryReader>();
        builder.Services.AddScoped<ITradeStore, TradeStore>();
        builder.Services.AddScoped<IStatementStore, TradeStore>();
        builder.Services.AddScoped<IReconciliationStore, ReconciliationStore>();
        builder.Services.AddScoped<BankCutoff>();
        builder.Services.AddScoped<BankReconciliations>();
        builder.Services.AddScoped<ITradePartnerAuthority, TradePartnerAuthority>();
        builder.Services.AddScoped<TradeAccess>();
        builder.Services.AddScoped<TradePosting>();
        builder.Services.AddScoped<TradeUseCases>();
        builder.Services.AddScoped<IReadinessStore, ReadinessStore>();
        builder.Services.AddScoped<ReadinessUseCases>();
        builder.Services.AddScoped<DonationReceipts>();
        builder.Services.AddScoped<IReceivableStore, ReceivableStore>();
        builder.Services.AddScoped<IInvoiceReference, InvoiceReference>();
        builder.Services.AddScoped<ReceivableUseCases>();
        builder.Services.AddScoped<IRecurringInvoices, RecurringStore>();
        builder.Services.AddScoped<IInvoiceShares, InvoiceShareStore>();
        builder.Services.AddScoped<IInvoiceDispatches, InvoiceDispatchStore>();
        builder.Services.AddSingleton<IInvoiceMail, SmtpInvoiceMail>();
        builder.Services.AddSingleton<ChromiumInvoiceRenderer>();
        builder.Services.AddSingleton<IInvoiceRenderer>(services => services.GetRequiredService<ChromiumInvoiceRenderer>());
        builder.Services.AddSingleton<IDonationReceiptRenderer>(services => services.GetRequiredService<ChromiumInvoiceRenderer>());
        builder.Services.AddSingleton<IReconciliationRenderer>(services => services.GetRequiredService<ChromiumInvoiceRenderer>());
        builder.Services.AddScoped<BankImportUseCases>();
        builder.Services.AddScoped<StatementAllocation>();
        builder.Services.AddSingleton(TimeProvider.System);
        builder.Services.AddSingleton<IValidator<InitializeBookRequest>, InitializeBookValidator>();
        builder.Services.AddSingleton<IValidator<SaveChartAccountRequest>, SaveChartAccountValidator>();
        builder.Services.AddSingleton<IValidator<BackfillRequest>, BackfillReadinessValidator>();
        builder.Services.AddSingleton<IValidator<PreviewChartImportRequest>, PreviewChartImportValidator>();
        builder.Services.AddSingleton<IValidator<CommitChartImportRequest>, CommitChartImportValidator>();
        builder.Services.AddJasperFxEnumerableSingletonSupport();
        builder.AddFinanceMessaging(typeof(Program).Assembly, connection, broker);
        if (builder.Environment.IsDevelopment()) builder.Host.UseResourceSetupOnStartup();
        builder.Services.AddWolverineHttp();
        builder.Services.ConfigureSystemTextJsonForWolverineOrMinimalApi(options =>
            options.SerializerOptions.Converters.Add(new DecimalStringConverter()));
        builder.Services.AddBusinessOpenApi();
        builder.Services.AddNexoraProblemDetails();
        builder.Services.AddHealthChecks().AddWolverine(tags: ["ready"]).AddRabbitReadiness(broker)
            .AddDependency("finance-database", async (services, ct) =>
            {
                if (!await services.GetRequiredService<FinanceDbContext>().Database.CanConnectAsync(ct))
                    throw new InvalidOperationException("Database unavailable.");
            }).AddHttpReadiness("organization", new Uri("https+http://organization/health"));

        builder.Services.AddCodeFirstGrpc();
builder.Services.AddWolverineGrpc(grpc =>
{
    grpc.IncludeCodeFirstContract<IFinanceGrpc>();
    grpc.RequireAuthorizeOnAll();
    grpc.MapException<AccessDeniedException>(StatusCode.PermissionDenied);
    grpc.MapException<ResourceNotFoundException>(StatusCode.NotFound);
    grpc.MapException<BusinessConflictException>(StatusCode.FailedPrecondition);
    grpc.MapException<IdempotencyConflictException>(StatusCode.Aborted);
});
builder.Services.AddNexoraGrpcClient<IOrganizationGrpc>("organization");
builder.Services.AddNexoraGrpcClient<IMasterDataGrpc>("masterdata");

var app = builder.Build();
app.UseApiStatusProblems();
        app.Use(async (context, next) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            await next(context);
        });
        app.UseFinanceExceptionHandling();
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
            await scope.ServiceProvider.GetRequiredService<FinanceDbContext>().Database.MigrateAsync();
        }
        await app.RunAsync();
    }
}