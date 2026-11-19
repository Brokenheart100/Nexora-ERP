namespace Nexora.Finance.Application;

public sealed record PartnerLedger(string Kind, Guid PartnerId, string Currency, int MinorUnits, DateOnly From, DateOnly Through,
    long Watermark, PartnerLedgerBalance Open, PartnerLedgerBalance Funds, PartnerLedgerEntry[] Items, bool HasMore);

public sealed record PartnerLedgerBalance(decimal Opening, decimal Increases, decimal Decreases, decimal Closing);

public sealed record PartnerLedgerEntry(Guid Id, string Kind, string Number, DateOnly On, Guid JournalId, long PostingNumber,
    Guid? RelatedDocumentId, decimal OpenDelta, decimal OpenBalance, decimal FundsDelta, decimal FundsBalance);
