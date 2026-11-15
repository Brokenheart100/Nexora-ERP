namespace Nexora.Finance.Domain;

public sealed record OpenItem(Guid Id, Guid? PartnerId, string? PartnerName, string Number, DateOnly On, DateOnly DueOn,
    Guid JournalId, decimal Original, decimal Outstanding, string Bucket);
