namespace Nexora.Finance.Application;

public sealed record DonationFiscalTicketView(Guid Id, Guid DonationId, string Code, string Number, DateOnly IssuedOn,
    DateTimeOffset LinkedAtUtc);

public sealed record DonationDispatchView(Guid Id, Guid DonationId, string Recipient, string State, int Attempt, long Version,
    Guid? PreviousId, Guid? ResentAsId, DateTimeOffset UpdatedAtUtc, string? Detail);
