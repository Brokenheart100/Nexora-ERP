using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Domain;

namespace Nexora.Organization.Application;

public sealed class BillingEntitlements(IBillingRepository billing, IBillingCounters counters, IBillingPolicy policy, TimeProvider clock)
{
    public async Task<EntitlementsView> ReadAsync(Workspace workspace, CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        var subscription = await billing.FindSubscriptionAsync(Owner(workspace), cancellationToken);
        var plan = Effective(subscription, now);
        var usage = await UsageAsync(workspace, subscription, plan, cancellationToken);
        return new(workspace.Id, plan.Code, plan.Name, subscription?.Status ?? SubscriptionStatuses.Active, plan.Code,
            plan.Modules, Warnings(subscription, usage, now), usage, subscription?.PeriodEndUtc);
    }

    public async Task<BillingUsageView> UsageAsync(Workspace workspace, WorkspaceSubscription? subscription, BillingPlan plan,
        CancellationToken cancellationToken)
    {
        var month = Month(clock.GetUtcNow());
        var workspaces = await counters.CountOwnedWorkspacesAsync(Owner(workspace), cancellationToken);
        var seats = await counters.CountWorkspaceSeatsAsync(workspace.Id, cancellationToken);
        var documents = subscription is null ? 0 : await counters.CountDocumentsAsync(subscription.Id, month, cancellationToken);
        return new(workspaces, plan.Limits.Workspaces, seats, plan.Limits.Members, documents, plan.Limits.DocumentsPerMonth, month.ToString("yyyy-MM"));
    }

    public BillingPlan Effective(WorkspaceSubscription? subscription, DateTimeOffset now)
    {
        if (subscription is null) return policy.DefaultPlan;
        subscription.Refresh(now);
        return subscription.EffectivePlan();
    }

    public async Task<WorkspaceSubscription> EnsureSubscriptionAsync(Workspace workspace, CancellationToken cancellationToken)
    {
        var owner = Owner(workspace);
        var existing = await billing.FindSubscriptionAsync(owner, cancellationToken);
        if (existing is not null) return existing;
        var subscription = WorkspaceSubscription.Start(owner, policy.DefaultPlan, clock.GetUtcNow());
        billing.AddSubscription(subscription);
        return subscription;
    }

    public void EnsureWorkspaceQuota(BillingPlan plan, int ownedWorkspaces)
    {
        if (ownedWorkspaces >= plan.Limits.Workspaces)
            throw new PlanLimitExceededException("workspaces", plan.Limits.Workspaces, ownedWorkspaces);
    }

    public void EnsureMemberQuota(BillingPlan plan, int seats, int additional)
    {
        if (seats + additional > plan.Limits.Members)
            throw new PlanLimitExceededException("members", plan.Limits.Members, seats);
    }

    public void EnsureDocumentQuota(BillingPlan plan, int used, int additional)
    {
        if (used + additional > plan.Limits.DocumentsPerMonth)
            throw new PlanLimitExceededException("documents", plan.Limits.DocumentsPerMonth, used);
    }

    public static IdentityReference Owner(Workspace workspace) => new(workspace.OwnerIssuer, workspace.OwnerSubject);

    public static DateOnly Month(DateTimeOffset now) => new(now.Year, now.Month, 1);

    private static IReadOnlyList<string> Warnings(WorkspaceSubscription? subscription, BillingUsageView usage, DateTimeOffset now)
    {
        var warnings = new List<string>();
        if (subscription?.Status == SubscriptionStatuses.PastDue) warnings.Add("subscription.past_due");
        if (subscription is { Status: SubscriptionStatuses.Trial, PeriodEndUtc: { } end } && end - now <= TimeSpan.FromDays(7))
            warnings.Add("subscription.trial_ending");
        if (usage.Workspaces >= usage.WorkspacesLimit) warnings.Add("workspaces.limit_reached");
        if (usage.Members >= usage.MembersLimit) warnings.Add("members.limit_reached");
        if (usage.DocumentsThisMonth >= usage.DocumentsLimit) warnings.Add("documents.limit_reached");
        return warnings;
    }
}
