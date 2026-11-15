namespace Nexora.Finance.Domain;

public sealed record JournalLineInput(Guid AccountId, decimal Debit, decimal Credit);

public sealed record JournalActor(string Issuer, string Subject);

public sealed record JournalLineSnapshot(Guid AccountId, string Code, string Name, decimal Debit, decimal Credit);
