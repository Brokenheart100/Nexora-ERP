namespace Nexora.Finance.Domain;

public sealed record StatementEntry(int Row, string ExternalId, DateOnly On, decimal Amount, string Description);
