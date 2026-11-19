namespace Nexora.Organization.Domain;

public static class SubscriptionStatuses
{
    public const string Active = "active";
    public const string Trial = "trial";
    public const string PastDue = "past_due";
    public const string Canceled = "canceled";
}

public sealed class WorkspaceSubscription
{
    public const int TrialDays = 14;
    public const int PaidPeriodDays = 30;

    private WorkspaceSubscription() { }

    public Guid Id { get; private set; }
    public string Issuer { get; private set; } = "";
    public string Subject { get; private set; } = "";
    public string PlanCode { get; private set; } = BillingPlans.Free;
    public string Status { get; private set; } = SubscriptionStatuses.Active;
    public Guid OperationId { get; private set; }
    public DateTimeOffset? PeriodStartUtc { get; private set; }
    public DateTimeOffset? PeriodEndUtc { get; private set; }
    public DateTimeOffset UpdatedAtUtc { get; private set; }
    public long Version { get; private set; }
    public bool HasSavedTestCard { get; private set; }

    public void SaveLocalTestCard() => HasSavedTestCard = true;

    public static WorkspaceSubscription Start(IdentityReference owner, BillingPlan plan, DateTimeOffset now) => new()
    {
        Id = Guid.CreateVersion7(), Issuer = owner.Issuer, Subject = owner.Subject, PlanCode = plan.Code,
        Status = SubscriptionStatuses.Active, UpdatedAtUtc = now.ToUniversalTime(), Version = 1
    };

    public void Select(BillingPlan plan, bool trial, Guid operationId, DateTimeOffset now,
        DateTimeOffset? periodEndUtc = null)
    {
        PlanCode = plan.Code;
        Status = trial ? SubscriptionStatuses.Trial : SubscriptionStatuses.Active;
        PeriodStartUtc = now.ToUniversalTime();
        PeriodEndUtc = !trial && periodEndUtc is { } end && end > now
            ? end.ToUniversalTime()
            : PeriodStartUtc.Value.AddDays(trial ? TrialDays : PaidPeriodDays);
        OperationId = operationId;
        UpdatedAtUtc = now.ToUniversalTime();
        Version++;
    }

    public void Cancel(Guid operationId, DateTimeOffset now)
    {
        PlanCode = BillingPlans.Free;
        Status = SubscriptionStatuses.Canceled;
        PeriodStartUtc = now.ToUniversalTime();
        PeriodEndUtc = now.ToUniversalTime();
        OperationId = operationId;
        UpdatedAtUtc = now.ToUniversalTime();
        Version++;
    }

    public void Refresh(DateTimeOffset now)
    {
        if (Status is not (SubscriptionStatuses.Active or SubscriptionStatuses.Trial)) return;
        if (PeriodEndUtc is null || PeriodEndUtc > now) return;
        Status = SubscriptionStatuses.PastDue;
        UpdatedAtUtc = now.ToUniversalTime();
        Version++;
    }

    public BillingPlan EffectivePlan() => Status == SubscriptionStatuses.Canceled
        ? BillingPlans.FreePlan
        : BillingPlans.Find(PlanCode) ?? BillingPlans.FreePlan;
}
