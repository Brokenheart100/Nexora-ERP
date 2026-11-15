namespace Nexora.Purchasing.Domain;

public sealed class PurchaseRuleException(string message) : Exception(message);
