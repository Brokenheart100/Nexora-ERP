using Nexora.Organization.Domain;

namespace Nexora.Organization.Application;

public sealed record PlanView(string Code, string Name, int MonthlyPriceCents, string Currency, PlanLimits Limits, IReadOnlyList<string> Modules);

public sealed record BillingUsageView(int Workspaces, int WorkspacesLimit, int Members, int MembersLimit,
    int DocumentsThisMonth, int DocumentsLimit, string Period);

public sealed record EntitlementsView(Guid WorkspaceId, string PlanCode, string PlanName, string Status, string EffectivePlanCode,
    IReadOnlyList<string> Modules, IReadOnlyList<string> Warnings, BillingUsageView Usage, DateTimeOffset? PeriodEndUtc);

public sealed record SubscriptionView(Guid WorkspaceId, string PlanCode, string Status, string EffectivePlanCode,
    DateTimeOffset? PeriodStartUtc, DateTimeOffset? PeriodEndUtc, long Version, BillingUsageView Usage);

public sealed record InvoiceView(Guid Id, string PlanCode, string Status, int AmountCents, string Currency,
    string? PaymentReference, DateTimeOffset IssuedAtUtc, DateTimeOffset? PaidAtUtc);

public sealed record PlanQuoteView(string PlanCode, string PlanName, int MonthlyPriceCents, string Currency,
    string CurrentPlanCode, string CurrentPlanName, string SubscriptionStatus, bool Prorated,
    int ChargeCents, int CreditCents, int AmountDueCents, int RemainingDays,
    DateTimeOffset EffectiveAtUtc, DateTimeOffset PeriodEndUtc);

public sealed record BillingView(Guid WorkspaceId, SubscriptionView Subscription, IReadOnlyList<InvoiceView> Invoices,
    IReadOnlyList<PlanView> Plans, bool CanManage);

public sealed record DocumentReservationView(Guid WorkspaceId, Guid OperationId, int Count, int DocumentsThisMonth, int DocumentsLimit, bool Replayed);

public sealed record BillingAudit(Guid TenantId, Guid WorkspaceId, string Action, Guid? TargetId, long Version);

public sealed record BillingOutcome<T>(T Result, BillingAudit? Audit);
