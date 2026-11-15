namespace Nexora.Finance.Application;

public sealed record DonationReceipt(string Number, string DonationNumber, DateOnly On, string Currency, int MinorUnits,
    decimal Amount, string Method, string Donor, string? Recipient, Guid JournalId, Guid? ReversedById);
