using Nexora.Organization.Domain;

namespace Nexora.Tests;

public sealed class BillingProrationTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 14, 8, 0, 0, TimeSpan.Zero);
    private static readonly IdentityReference Owner = new("https://id.example/realms/erp", "billing-owner");

    private static WorkspaceSubscription Subscription(BillingPlan plan, bool trial = false)
    {
        var subscription = WorkspaceSubscription.Start(Owner, BillingPlans.FreePlan, Now);
        subscription.Select(plan, trial, Guid.CreateVersion7(), Now);
        return subscription;
    }

    [Fact]
    public void Quote_without_an_active_paid_period_charges_the_full_monthly_price()
    {
        var quote = BillingProration.Quote(null, BillingPlans.ProPlan, Now);

        Assert.False(quote.Prorated);
        Assert.Equal(29900, quote.ChargeCents);
        Assert.Equal(0, quote.CreditCents);
        Assert.Equal(29900, quote.AmountDueCents);
        Assert.Equal(30, quote.RemainingDays);
        Assert.Equal(Now.AddDays(30), quote.PeriodEndUtc);
    }

    [Fact]
    public void Quote_prorates_an_active_upgrade_by_the_remaining_share_of_the_paid_period()
    {
        var subscription = Subscription(BillingPlans.StandardPlan);
        var quote = BillingProration.Quote(subscription, BillingPlans.ProPlan, Now.AddDays(10));

        Assert.True(quote.Prorated);
        Assert.Equal(19933, quote.ChargeCents);
        Assert.Equal(6600, quote.CreditCents);
        Assert.Equal(13333, quote.AmountDueCents);
        Assert.Equal(20, quote.RemainingDays);
        Assert.Equal(subscription.PeriodEndUtc, quote.PeriodEndUtc);
    }

    [Fact]
    public void Quote_never_charges_for_a_downgrade_and_keeps_the_paid_period_end()
    {
        var subscription = Subscription(BillingPlans.ProPlan);
        var quote = BillingProration.Quote(subscription, BillingPlans.StandardPlan, Now.AddDays(15));

        Assert.True(quote.Prorated);
        Assert.Equal(4950, quote.ChargeCents);
        Assert.Equal(14950, quote.CreditCents);
        Assert.Equal(0, quote.AmountDueCents);
        Assert.Equal(subscription.PeriodEndUtc, quote.PeriodEndUtc);
    }

    [Fact]
    public void Quote_does_not_credit_a_trial_or_an_expired_period()
    {
        var trial = BillingProration.Quote(Subscription(BillingPlans.ProPlan, trial: true), BillingPlans.StandardPlan,
            Now.AddDays(1));
        Assert.False(trial.Prorated);
        Assert.Equal(0, trial.CreditCents);
        Assert.Equal(9900, trial.AmountDueCents);

        var expired = BillingProration.Quote(Subscription(BillingPlans.ProPlan), BillingPlans.StandardPlan, Now.AddDays(31));
        Assert.False(expired.Prorated);
        Assert.Equal(0, expired.CreditCents);
        Assert.Equal(9900, expired.AmountDueCents);
        Assert.Equal(Now.AddDays(31 + 30), expired.PeriodEndUtc);
    }
}
