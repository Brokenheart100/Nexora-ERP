namespace Nexora.Finance.Domain;

public sealed record FiscalClosingLine(Guid AccountId, string Code, string Name, decimal Balance);
