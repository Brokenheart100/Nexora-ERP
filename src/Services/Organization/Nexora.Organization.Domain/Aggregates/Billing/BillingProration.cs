namespace Nexora.Organization.Domain;

public sealed record BillingQuote(int ChargeCents, int CreditCents, int AmountDueCents, int RemainingDays,
    DateTimeOffset PeriodEndUtc, bool Prorated);

public static class BillingProration
{
    public static BillingQuote Quote(WorkspaceSubscription? subscription, BillingPlan plan, DateTimeOffset now)
    {
        var current = subscription?.EffectivePlan();
        var end = subscription?.PeriodEndUtc;
        var prorated = subscription is { Status: SubscriptionStatuses.Active }
            && current is { MonthlyPriceCents: > 0 }
            && end is { } candidate
            && candidate > now
            && plan.MonthlyPriceCents > 0;
        if (!prorated)
        {
            var effective = now.ToUniversalTime().AddDays(WorkspaceSubscription.PaidPeriodDays);
            return new(plan.MonthlyPriceCents, 0, plan.MonthlyPriceCents, WorkspaceSubscription.PaidPeriodDays,
                effective, false);
        }

        var period = TimeSpan.FromDays(WorkspaceSubscription.PaidPeriodDays);
        var remaining = end!.Value - now;
        if (remaining > period) remaining = period;
        var ratio = (decimal)remaining.Ticks / period.Ticks;
        var charge = Money(plan.MonthlyPriceCents * ratio);
        var credit = Money(current!.MonthlyPriceCents * ratio);
        var due = Math.Max(0, charge - credit);
        var days = Math.Max(1, (int)Math.Ceiling(remaining.TotalDays));
        return new(charge, credit, due, days, end.Value, true);
    }

    private static int Money(decimal value) => (int)Math.Round(Math.Max(0, value), 0, MidpointRounding.AwayFromZero);
}
