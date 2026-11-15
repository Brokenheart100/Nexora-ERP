namespace Nexora.ServiceDefaults.Http;

[AttributeUsage(AttributeTargets.Method)]
public sealed class IdempotentWriteAttribute(string? revisionField = null) : Attribute
{
    public string? RevisionField { get; } = revisionField;
}
