using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed record DispatchOutcome(DispatchState State, string? Detail = null);

public sealed record DispatchWork(string Recipient, CustomerTerms Invoice);

public sealed record DispatchStart(DispatchWork? Work, DateTimeOffset? LeaseUntilUtc = null);

public sealed record DispatchView(Guid Id, Guid InvoiceId, string Recipient, string State, int Attempt, long Version,
    Guid? PreviousId, Guid? ResentAsId, DateTimeOffset UpdatedAtUtc, string? Detail);
