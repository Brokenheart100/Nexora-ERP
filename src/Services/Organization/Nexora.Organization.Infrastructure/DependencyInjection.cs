using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Nexora.Organization.Application;
using Nexora.Organization.Infrastructure.Messaging;
using Wolverine.EntityFrameworkCore;
using FluentValidation;
using Nexora.BuildingBlocks.Application;
using Nexora.BuildingBlocks.Infrastructure;

namespace Nexora.Organization.Infrastructure;

public static class DependencyInjection
{
    public static void AddOrganization(this IHostApplicationBuilder builder, System.Reflection.Assembly applicationAssembly)
    {
        var database = builder.Configuration.GetConnectionString("organizationdb")
            ?? throw new InvalidOperationException("organizationdb connection is required.");
        var broker = builder.Configuration.GetConnectionString("rabbitmq")
            ?? throw new InvalidOperationException("rabbitmq connection is required.");
        builder.Services.AddScoped<IWorkspaceRepository, WorkspaceRepository>();
        builder.Services.AddScoped<OpenWorkspaceUseCase>();
        builder.Services.AddScoped<WorkspaceQueries>();
        builder.Services.AddSingleton<IAnnouncementSource, ConfiguredAnnouncements>();
        builder.Services.AddScoped<WorkspaceAnnouncements>();
        builder.Services.AddScoped<IAccountDeletionImpactReader, AccountDeletionImpactReader>();
        builder.Services.AddScoped<AccountDeletionPreflight>();
        builder.Services.AddScoped<IUserAccountRepository, UserAccountRepository>();
        builder.Services.AddScoped<AccountMapping>();
        builder.Services.AddScoped<IApplicationAuthorization, WorkspaceAuthorization>();
        builder.Services.AddScoped<GovernanceUseCases>();
        builder.Services.AddScoped<IWorkspaceAuditReader, WorkspaceAuditReader>();
        builder.Services.AddScoped<WorkspaceAuditQueries>();
        builder.Services.AddScoped<RecordChangeQueries>();
        builder.Services.AddScoped<IBillingRepository, BillingRepository>();
        builder.Services.AddScoped<IBillingCounters, BillingCounters>();
        builder.Services.Configure<BillingOptions>(builder.Configuration.GetSection("Billing"));
        builder.Services.AddSingleton<IBillingPolicy, BillingPolicy>();
        builder.Services.AddScoped<BillingEntitlements>();
        builder.Services.AddScoped<BillingUseCases>();
        builder.Services.AddScoped<BillingQueries>();
        builder.Services.AddScoped<CustomRoleUseCases>();
        builder.Services.AddScoped<IWarehouseScopeDirectory, WarehouseScopeDirectory>();
        builder.Services.AddScoped<IWorkspacePreferencesRepository, WorkspacePreferencesRepository>();
        builder.Services.AddScoped<CompanySettingsUseCases>();
        builder.Services.AddScoped<SessionPolicyQueries>();
        builder.Services.AddScoped<IWorkspaceLinkRepository, WorkspaceLinkRepository>();
        builder.Services.AddScoped<WorkspaceLinkUseCases>();
        builder.Services.AddSingleton<IInvitationTokens, InvitationTokens>();
        builder.Services.AddSingleton<IWorkspaceInvitationMail, SmtpWorkspaceInvitationMail>();
        builder.Services.AddSingleton<IValidator<OpenWorkspace>, OpenWorkspaceValidator>();
        builder.Services.AddSingleton(TimeProvider.System);
        var recordChanges = new RecordChangeInterceptor("organization");
        builder.Services.AddDbContextWithWolverineIntegration<OrganizationDbContext>(options => options.UseNpgsql(database).AddInterceptors(recordChanges), "organization_messages");
        builder.Services.AddRecordChanges<OrganizationDbContext>(builder.Configuration, recordChanges);
        builder.AddOrganizationMessaging(applicationAssembly, database, broker);
    }
}
