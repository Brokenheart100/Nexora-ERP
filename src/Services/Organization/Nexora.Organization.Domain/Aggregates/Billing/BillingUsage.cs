namespace Nexora.Organization.Domain;

public sealed class BillingDocumentUsage
{
    private BillingDocumentUsage() { }

    public Guid BillingAccountId { get; private set; }
    public DateOnly PeriodMonth { get; private set; }
    public int Documents { get; private set; }
    public long Version { get; private set; }

    public static BillingDocumentUsage Open(Guid billingAccountId, DateOnly periodMonth) => new()
    { BillingAccountId = billingAccountId, PeriodMonth = periodMonth };

    public void Reserve(int count)
    {
        Documents += count;
        Version++;
    }
}

public sealed class BillingUsageReservation
{
    private BillingUsageReservation() { }

    public Guid OperationId { get; private set; }
    public Guid BillingAccountId { get; private set; }
    public DateOnly PeriodMonth { get; private set; }
    public int Count { get; private set; }
    public DateTimeOffset RecordedAtUtc { get; private set; }

    public static BillingUsageReservation Record(Guid operationId, Guid billingAccountId, DateOnly periodMonth,
        int count, DateTimeOffset now) => new()
    {
        OperationId = operationId, BillingAccountId = billingAccountId, PeriodMonth = periodMonth,
        Count = count, RecordedAtUtc = now.ToUniversalTime()
    };
}
