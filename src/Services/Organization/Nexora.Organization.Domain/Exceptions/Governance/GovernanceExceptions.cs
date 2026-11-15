namespace Nexora.Organization.Domain;

public sealed class GovernanceRuleException(string message) : Exception(message);
public sealed class GovernanceAccessException : Exception;
