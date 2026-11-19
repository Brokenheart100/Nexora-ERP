using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed record DispatchOutcome(DispatchState State, string? Detail = null);

public abstract record DispatchWork(string Recipient);

public sealed record InvoiceDispatchWork(string Recipient, CustomerTerms Invoice) : DispatchWork(Recipient);

public sealed record DonationDispatchWork(string Recipient, DonationReceipt Receipt) : DispatchWork(Recipient);

public sealed record DispatchStart(DispatchWork? Work, DateTimeOffset? LeaseUntilUtc = null);

public sealed record DispatchView(Guid Id, Guid InvoiceId, string Recipient, string State, int Attempt, long Version,
    Guid? PreviousId, Guid? ResentAsId, DateTimeOffset UpdatedAtUtc, string? Detail);
