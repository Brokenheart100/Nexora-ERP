namespace Nexora.Inventory.Domain;

public sealed class StockRuleException(string message, string code = "inventory.stock_rule") : Exception(message)
{
    public string Code { get; } = code;
}
