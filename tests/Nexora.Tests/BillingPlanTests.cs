using Nexora.Organization.Application;
using Nexora.Organization.Domain;

namespace Nexora.Tests;

public sealed class BillingPlanTests
{
    private static readonly IdentityReference Owner = new("https://id.example/realms/erp", "billing-owner");
    private static readonly BillingEntitlements Entitlements = new(null!, null!, new TestPolicy(), TimeProvider.System);

    [Fact]
    public void Plan_matrix_exposes_limits_prices_and_modules()
    {
        Assert.Equal(0, BillingPlans.FreePlan.MonthlyPriceCents);
        Assert.Equal(9900, BillingPlans.StandardPlan.MonthlyPriceCents);
        Assert.Equal(29900, BillingPlans.ProPlan.MonthlyPriceCents);
        Assert.Equal((1, 3, 500), (BillingPlans.FreePlan.Limits.Workspaces, BillingPlans.FreePlan.Limits.Members,
            BillingPlans.FreePlan.Limits.DocumentsPerMonth));
        Assert.False(BillingPlans.FreePlan.Includes(BillingModules.Sales));
        Assert.True(BillingPlans.StandardPlan.Includes(BillingModules.Sales));
        Assert.False(BillingPlans.StandardPlan.Includes(BillingModules.Assistant));
        Assert.True(BillingPlans.ProPlan.Includes(BillingModules.Assistant));
        Assert.True(BillingPlans.ProPlan.Includes(BillingModules.Company));
        Assert.True(BillingPlans.StandardPlan.Limits.Workspaces > BillingPlans.FreePlan.Limits.Workspaces);
        Assert.True(BillingPlans.ProPlan.Limits.DocumentsPerMonth > BillingPlans.StandardPlan.Limits.DocumentsPerMonth);
        Assert.Same(BillingPlans.ProPlan, BillingPlans.Find("PRO"));
        Assert.Null(BillingPlans.Find("unknown"));
    }

    [Fact]
    public void Quota_checks_enforce_the_plan_matrix()
    {
        Entitlements.EnsureWorkspaceQuota(BillingPlans.FreePlan, 0);
        Assert.Throws<PlanLimitExceededException>(() => Entitlements.EnsureWorkspaceQuota(BillingPlans.FreePlan, 1));
        Assert.Throws<PlanLimitExceededException>(() => Entitlements.EnsureWorkspaceQuota(BillingPlans.StandardPlan,
            BillingPlans.StandardPlan.Limits.Workspaces));
        Entitlements.EnsureMemberQuota(BillingPlans.FreePlan, 2, 1);
        Assert.Throws<PlanLimitExceededException>(() => Entitlements.EnsureMemberQuota(BillingPlans.FreePlan, 3, 1));
        Entitlements.EnsureDocumentQuota(BillingPlans.FreePlan, 499, 1);
        Assert.Throws<PlanLimitExceededException>(() => Entitlements.EnsureDocumentQuota(BillingPlans.FreePlan, 500, 1));
        Assert.Throws<PlanLimitExceededException>(() => Entitlements.EnsureDocumentQuota(BillingPlans.FreePlan, 450, 100));
    }

    [Fact]
    public void Subscription_lifecycle_trial_activation_and_cancel_downgrade()
    {
        var now = new DateTimeOffset(2026, 11, 13, 0, 0, 0, TimeSpan.Zero);
        var subscription = WorkspaceSubscription.Start(Owner, BillingPlans.FreePlan, now);
        Assert.Equal(SubscriptionStatuses.Active, subscription.Status);
        Assert.Same(BillingPlans.FreePlan, subscription.EffectivePlan());
        subscription.Select(BillingPlans.ProPlan, true, Guid.NewGuid(), now);
        Assert.Equal(SubscriptionStatuses.Trial, subscription.Status);
        Assert.Equal("pro", subscription.EffectivePlan().Code);
        Assert.Equal(now.AddDays(WorkspaceSubscription.TrialDays), subscription.PeriodEndUtc!.Value);
        subscription.Select(BillingPlans.ProPlan, false, Guid.NewGuid(), now);
        Assert.Equal(SubscriptionStatuses.Active, subscription.Status);
        Assert.Equal(now.AddDays(WorkspaceSubscription.PaidPeriodDays), subscription.PeriodEndUtc!.Value);
        subscription.Refresh(now.AddDays(31));
        Assert.Equal(SubscriptionStatuses.PastDue, subscription.Status);
        subscription.Cancel(Guid.NewGuid(), now);
        Assert.Equal(SubscriptionStatuses.Canceled, subscription.Status);
        Assert.Same(BillingPlans.FreePlan, subscription.EffectivePlan());
    }

    private sealed class TestPolicy : IBillingPolicy
    {
        public BillingPlan DefaultPlan => BillingPlans.ProPlan;
    }
}
