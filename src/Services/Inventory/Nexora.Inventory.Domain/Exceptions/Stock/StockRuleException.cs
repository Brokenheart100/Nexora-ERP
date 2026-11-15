namespace Nexora.Inventory.Domain;

public sealed class StockRuleException(string message) : Exception(message);
