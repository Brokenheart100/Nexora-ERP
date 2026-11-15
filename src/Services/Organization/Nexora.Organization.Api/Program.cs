using Nexora.ServiceDefaults.Http;
using Grpc.Core;
using ProtoBuf.Grpc.Server;
using Wolverine.Grpc;
using Nexora.BuildingBlocks.Grpc;
using Nexora.Organization.Contracts.Grpc;
using Nexora.Inventory.Contracts.Grpc;
using FluentValidation;
using JasperFx;
using JasperFx.Resources;
using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.BuildingBlocks.Infrastructure;
using Nexora.Organization.Infrastructure;
using Wolverine.Http;
using Wolverine.HealthChecks;
using Wolverine.Http.FluentValidation;
using Microsoft.AspNetCore.Authorization;
using Nexora.Organization.Domain;
using System.Security.Claims;
using System.Text.Json;
using System.Threading.RateLimiting;

namespace Nexora.Organization.Api;

public partial class Program
{
    public static async Task Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);
        builder.AddServiceDefaults();
        builder.AddNexoraBearer();
        builder.AddOrganization(typeof(Program).Assembly);
        builder.Services.AddHealthChecks()
            .AddWolverine(tags: ["ready"], timeout: TimeSpan.FromSeconds(4))
            .AddWolverineListeners(tags: ["ready"], timeout: TimeSpan.FromSeconds(4))
            .AddDependency("organization-database", async (services, cancellation) =>
            {
                if (!await services.GetRequiredService<OrganizationDbContext>().Database.CanConnectAsync(cancellation))
                    throw new InvalidOperationException("Database unavailable.");
            })
            .AddRabbitReadiness(builder.Configuration.GetConnectionString("rabbitmq")!)
            .AddHttpReadiness("identity", new Uri(builder.Configuration["Authentication:Authority"]!.TrimEnd('/') + "/.well-known/openid-configuration"));
        builder.Services.AddHttpContextAccessor();
        builder.Services.AddScoped<ICurrentActor, HttpCurrentActor>();
        builder.Services.AddSingleton<IValidator<CreateWorkspaceRequest>, CreateWorkspaceRequestValidator>();
        builder.Services.AddSingleton<IValidator<InviteMemberRequest>, InviteMemberValidator>();
        builder.Services.AddSingleton<IValidator<RedeemInvitationRequest>, RedeemInvitationValidator>();
        builder.Services.AddSingleton<IValidator<ChangeMemberRequest>, ChangeMemberValidator>();
        builder.Services.AddSingleton<IValidator<RevokeInvitationRequest>, RevokeInvitationValidator>();
        builder.Services.AddSingleton<IValidator<ReviseCompanySettingsRequest>, ReviseCompanySettingsValidator>();
        builder.Services.AddSingleton<IValidator<SetPersonalLinkRequest>, SetPersonalLinkValidator>();
        builder.Services.AddSingleton<IValidator<SelectBillingPlanRequest>, SelectBillingPlanValidator>();
        builder.Services.AddSingleton<IValidator<PayBillingInvoiceRequest>, PayBillingInvoiceValidator>();
        builder.Services.AddSingleton<IValidator<CancelBillingSubscriptionRequest>, CancelBillingSubscriptionValidator>();
        builder.Services.AddSingleton<IValidator<ReserveBillingDocumentsRequest>, ReserveBillingDocumentsValidator>();
        builder.Services.AddScoped<IAuthorizationHandler, WorkspacePermissionHandler>();
        builder.Services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = 429;
            options.AddPolicy("invitation-redemption", context => RateLimitPartition.GetFixedWindowLimiter(
                (context.User.FindFirst("iss")?.Value ?? "anonymous") + "\n" + (context.User.FindFirst("sub")?.Value ?? "anonymous"),
                _ => new FixedWindowRateLimiterOptions { PermitLimit = 20, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
        });
        builder.Services.AddAuthorization(options =>
        {
            foreach (var permission in WorkspacePermissions.All)
                options.AddPolicy(permission, policy => policy.RequireAuthenticatedUser().AddRequirements(new WorkspacePermissionRequirement(permission)));
            options.AddPolicy("cli", policy => policy.RequireAuthenticatedUser().RequireAssertion(context => IsCliToken(context.User)));
        });
        builder.Services.AddWolverineHttp();
        builder.Services.AddBusinessOpenApi();
        builder.Services.AddNexoraProblemDetails();
        if (builder.Environment.IsDevelopment()) builder.Host.UseResourceSetupOnStartup();
        builder.Services.AddJasperFxEnumerableSingletonSupport();
        builder.Services.AddCodeFirstGrpc();
builder.Services.AddWolverineGrpc(grpc =>
{
    grpc.IncludeCodeFirstContract<IOrganizationGrpc>();
    grpc.RequireAuthorizeOnAll();
    grpc.MapException<AccessDeniedException>(StatusCode.PermissionDenied);
    grpc.MapException<ResourceNotFoundException>(StatusCode.NotFound);
    grpc.MapException<BusinessConflictException>(StatusCode.FailedPrecondition);
    grpc.MapException<IdempotencyConflictException>(StatusCode.Aborted);
});
builder.Services.AddNexoraGrpcClient<IInventoryGrpc>("inventory");

var app = builder.Build();
app.UseApiStatusProblems();
        app.Use(async (context, next) => { context.Response.Headers["Cache-Control"] = "no-store"; await next(); });
        app.UseOrganizationExceptionHandling();
        app.UseAuthentication();
        app.UseRecordChanges();
        app.UseRateLimiter();
        app.UseAuthorization();
        app.UseIdempotencyHeaders();
app.MapWolverineGrpcServices();
        app.MapDefaultEndpoints();
        app.MapBusinessOpenApi();
        app.MapWolverineEndpoints(options => options.UseFluentValidationProblemDetailMiddleware());
        if (app.Environment.IsDevelopment())
        {
            await using var scope = app.Services.CreateAsyncScope();
            await scope.ServiceProvider.GetRequiredService<OrganizationDbContext>().Database.MigrateAsync();
        }
        await app.RunAsync();
    }

    private static bool IsCliToken(ClaimsPrincipal user)
    {
        if (user.FindFirst("nexora.purpose")?.Value == "cli") return true;
        var container = user.FindFirst("nexora")?.Value;
        if (string.IsNullOrEmpty(container)) return false;
        try
        {
            using var document = JsonDocument.Parse(container);
            return document.RootElement.ValueKind == JsonValueKind.Object
                && document.RootElement.TryGetProperty("purpose", out var purpose)
                && purpose.GetString() == "cli";
        }
        catch (JsonException)
        {
            return false;
        }
    }
}