namespace Nexora.Organization.Domain;

public static class InvoiceStatuses
{
    public const string Pending = "pending";
    public const string Paid = "paid";
    public const string Void = "void";
}

public sealed class BillingInvoice
{
    private BillingInvoice() { }

    public Guid Id { get; private set; }
    public Guid BillingAccountId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public string PlanCode { get; private set; } = BillingPlans.Free;
    public string Status { get; private set; } = InvoiceStatuses.Pending;
    public int AmountCents { get; private set; }
    public string Currency { get; private set; } = "CNY";
    public string? PaymentReference { get; private set; }
    public Guid OperationId { get; private set; }
    public Guid? PaymentOperationId { get; private set; }
    public DateTimeOffset IssuedAtUtc { get; private set; }
    public DateTimeOffset? PaidAtUtc { get; private set; }

    public static BillingInvoice Issue(Guid billingAccountId, Guid workspaceId, BillingPlan plan, bool paid,
        Guid operationId, string? reference, DateTimeOffset now, int? amountCents = null) => new()
    {
        Id = Guid.CreateVersion7(), BillingAccountId = billingAccountId, WorkspaceId = workspaceId,
        PlanCode = plan.Code, AmountCents = Math.Max(0, amountCents ?? plan.MonthlyPriceCents), Currency = plan.Currency,
        Status = paid ? InvoiceStatuses.Paid : InvoiceStatuses.Pending,
        PaymentReference = reference, OperationId = operationId,
        PaymentOperationId = paid ? operationId : null,
        IssuedAtUtc = now.ToUniversalTime(), PaidAtUtc = paid ? now.ToUniversalTime() : null
    };

    public void MarkPaid(Guid paymentOperationId, string reference, DateTimeOffset now)
    {
        if (Status == InvoiceStatuses.Paid && PaymentOperationId == paymentOperationId) return;
        Status = InvoiceStatuses.Paid;
        PaymentReference = reference;
        PaymentOperationId = paymentOperationId;
        PaidAtUtc = now.ToUniversalTime();
    }

    public void Void()
    {
        if (Status == InvoiceStatuses.Paid) return;
        Status = InvoiceStatuses.Void;
    }
}
