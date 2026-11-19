using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Application;
using Nexora.Organization.Contracts;
using Nexora.Organization.Domain;

namespace Nexora.Tests;

public sealed class DomainTests
{
    private static readonly IdentityReference Owner = new("https://id.example/realms/erp", "subject-1");
    private static Workspace Open(string name = " 华新商贸 ") => Workspace.Open(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), name, Owner, DateTimeOffset.Now);

    [Fact]
    public void Opening_requires_valid_identity_and_name_and_sets_CNY_baseline()
    {
        Assert.Throws<ArgumentException>(() => new IdentityReference(" ", "subject"));
        Assert.Throws<ArgumentException>(() => Open(new string('名', 161)));
        Assert.Throws<ArgumentException>(() => Open(" "));
        var workspace = Open();
        Assert.Equal("华新商贸", workspace.Name);
        Assert.Equal("CN", workspace.CountryCode);
        Assert.Equal("CNY", workspace.BaseCurrency);
        Assert.Equal(TimeSpan.Zero, workspace.CreatedAtUtc.Offset);
    }

    [Fact]
    public void Identity_includes_issuer_and_owner_does_not_gain_finance_permissions()
    {
        var workspace = Open();
        Assert.True(workspace.AllowsGovernanceOperation(Owner, "organization.workspace.read"));
        Assert.False(workspace.AllowsGovernanceOperation(new("https://other.example", Owner.Subject), "organization.workspace.read"));
        Assert.False(workspace.AllowsGovernanceOperation(new(Owner.Issuer, "someone-else"), "organization.workspace.read"));
        Assert.False(workspace.AllowsGovernanceOperation(Owner, "finance.journal.post"));
    }

    [Fact]
    public async Task Repeating_the_same_intent_returns_the_original_result_without_another_fact()
    {
        var repository = new MemoryRepository();
        var accounts = new TestAccounts();
        var authorization = new WorkspaceAuthorization(repository, accounts);
        var billing = new TestBilling();
        var entitlements = new BillingEntitlements(billing, billing, new ProBillingPolicy(), TimeProvider.System);
        var useCase = new OpenWorkspaceUseCase(repository, TimeProvider.System, new(accounts), authorization, billing, billing, entitlements);
        var command = new OpenWorkspace(Guid.NewGuid(), "华新商贸", new(Owner.Issuer, Owner.Subject));
        var first = await useCase.ExecuteAsync(command, default);
        var second = await useCase.ExecuteAsync(command, default);
        Assert.True(first.Result.Created);
        Assert.False(second.Result.Created);
        Assert.Equal(first.Result.Workspace.Id, second.Result.Workspace.Id);
        Assert.Null(second.Event);
        await Assert.ThrowsAsync<IdempotencyConflictException>(() => useCase.ExecuteAsync(command with { Name = "另一企业" }, default));
        await Assert.ThrowsAsync<ResourceNotFoundException>(() => new WorkspaceQueries(repository, new WorkspaceAuthorization(repository, accounts), accounts)
            .GetAsync(first.Result.Workspace.Id, new(Owner.Issuer, "outsider"), default));
        var aggregate = (await repository.FindAsync(first.Result.Workspace.Id, default))!;
        var successor = new IdentityReference(Owner.Issuer, "successor");
        var hash = new string('a', 64);
        var invitation = aggregate.Invite(Owner, Guid.NewGuid(), new("successor@example.com"), GovernanceRoles.Owner, hash, DateTimeOffset.UtcNow);
        aggregate.AcceptInvitation(invitation.Id, hash, successor, new("successor@example.com"), DateTimeOffset.UtcNow);
        aggregate.ChangeMember(Owner, aggregate.Members.Single(m => m.Matches(Owner)).Id, GovernanceRoles.Owner, false);
        await Assert.ThrowsAsync<ResourceNotFoundException>(() => useCase.ExecuteAsync(command, default));
    }

    [Fact]
    public void Inner_layers_remain_framework_free_and_reporting_only_imports_public_contracts()
    {
        foreach (var assembly in new[] { typeof(Workspace).Assembly, typeof(OpenWorkspace).Assembly, typeof(WorkspaceCreatedV1).Assembly })
            Assert.DoesNotContain(assembly.GetReferencedAssemblies(), name => name.Name is { } n &&
                (n.StartsWith("Wolverine", StringComparison.Ordinal) || n.StartsWith("Microsoft.EntityFrameworkCore", StringComparison.Ordinal)
                 || n.StartsWith("Microsoft.AspNetCore", StringComparison.Ordinal)));
        Assert.DoesNotContain(typeof(Reporting.Infrastructure.ReportingDbContext).Assembly.GetReferencedAssemblies(),
            name => name.Name is { } n && n.StartsWith("Nexora.Organization", StringComparison.Ordinal) && n != "Nexora.Organization.Contracts");
    }

    private sealed class MemoryRepository : IWorkspaceRepository
    {
        private readonly List<Workspace> values = [];
        public void Add(Workspace workspace) => values.Add(workspace);
        public Task<Workspace?> FindInvitationAsync(Guid id, CancellationToken cancellationToken) => Task.FromResult(values.SingleOrDefault(x => x.Invitations.Any(i => i.Id == id)));
        public Task<IReadOnlyList<MemberView>> ListMembersAsync(Guid id, CancellationToken cancellationToken, PageWindow? page = null) => Task.FromResult<IReadOnlyList<MemberView>>([]);
        public Task<Workspace?> FindAsync(Guid id, CancellationToken cancellationToken) => Task.FromResult(values.SingleOrDefault(x => x.Id == id));
        public Task<Workspace?> FindOperationAsync(IdentityReference actor, Guid id, CancellationToken cancellationToken) =>
            Task.FromResult(values.SingleOrDefault(x => x.OperationId == id && x.OwnerIssuer == actor.Issuer && x.OwnerSubject == actor.Subject));
        public Task<IReadOnlyList<WorkspaceView>> ListAccessibleAsync(IdentityReference actor, CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<WorkspaceView>>(values.Where(x => x.AllowsGovernanceOperation(actor, WorkspacePermissions.Read)).Select(OpenWorkspaceUseCase.ToView).ToList());
    }

    private sealed class ProBillingPolicy : IBillingPolicy
    {
        public BillingPlan DefaultPlan => BillingPlans.ProPlan;
    }

    private sealed class TestBilling : IBillingRepository, IBillingCounters
    {
        public Task LockLocalCheckoutAsync(IdentityReference owner, CancellationToken ct) => Task.CompletedTask;
        public Task<WorkspaceSubscription?> FindSubscriptionAsync(IdentityReference owner, CancellationToken cancellationToken) => Task.FromResult<WorkspaceSubscription?>(null);
        public void AddSubscription(WorkspaceSubscription subscription) { }
        public Task<BillingInvoice?> FindInvoiceAsync(Guid invoiceId, CancellationToken cancellationToken) => Task.FromResult<BillingInvoice?>(null);
        public void AddInvoice(BillingInvoice invoice) { }
        public Task<IReadOnlyList<BillingInvoice>> ListInvoicesAsync(Guid billingAccountId, CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<BillingInvoice>>([]);
        public Task<BillingUsageReservation?> FindReservationAsync(Guid operationId, CancellationToken cancellationToken) => Task.FromResult<BillingUsageReservation?>(null);
        public Task<BillingUsageReservation?> TryReserveAsync(BillingUsageReservation reservation, CancellationToken cancellationToken) => Task.FromResult<BillingUsageReservation?>(null);
        public Task<bool> TryIncrementUsageAsync(Guid billingAccountId, DateOnly periodMonth, int count, int limit, CancellationToken cancellationToken) => Task.FromResult(true);
        public Task<int> CountOwnedWorkspacesAsync(IdentityReference owner, CancellationToken cancellationToken) => Task.FromResult(0);
        public Task<int> CountWorkspaceSeatsAsync(Guid workspaceId, CancellationToken cancellationToken) => Task.FromResult(0);
        public Task<int> CountDocumentsAsync(Guid billingAccountId, DateOnly periodMonth, CancellationToken cancellationToken) => Task.FromResult(0);
    }
}
