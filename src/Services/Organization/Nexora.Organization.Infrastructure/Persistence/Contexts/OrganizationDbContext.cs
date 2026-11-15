using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Infrastructure;
using Nexora.Organization.Domain;

namespace Nexora.Organization.Infrastructure;

public sealed class OrganizationDbContext(DbContextOptions<OrganizationDbContext> options) : DbContext(options)
{
    public DbSet<Workspace> Workspaces => Set<Workspace>();
    public DbSet<WorkspaceAudit> Audits => Set<WorkspaceAudit>();
    public DbSet<UserAccount> Accounts => Set<UserAccount>();
    public DbSet<WorkspaceMember> Members => Set<WorkspaceMember>();
    public DbSet<WorkspaceInvitation> Invitations => Set<WorkspaceInvitation>();
    public DbSet<WorkspacePreferences> Preferences => Set<WorkspacePreferences>();
    public DbSet<WorkspaceNavigationLink> WorkspaceLinks => Set<WorkspaceNavigationLink>();
    public DbSet<WorkspaceSubscription> Subscriptions => Set<WorkspaceSubscription>();
    public DbSet<BillingInvoice> Invoices => Set<BillingInvoice>();
    public DbSet<BillingDocumentUsage> BillingUsage => Set<BillingDocumentUsage>();
    public DbSet<BillingUsageReservation> BillingUsageReservations => Set<BillingUsageReservation>();
    public DbSet<RecordChange> RecordChanges => Set<RecordChange>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        OrganizationModelConfiguration.Configure(model);
        RecordChangeConfiguration.Configure(model);
    }
}

public sealed record WorkspaceAudit(Guid Id, Guid TenantId, Guid WorkspaceId, string Action,
    string ActorIssuer, string ActorSubject, DateTimeOffset OccurredAtUtc, Guid? TargetId = null, long? AuthorizationVersion = null);
