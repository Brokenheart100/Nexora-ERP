namespace Nexora.Finance.Domain;

public sealed class LedgerRuleException(string message, string code = "finance.ledger_rule") : Exception(message)
{
    public string Code { get; } = code;
}
