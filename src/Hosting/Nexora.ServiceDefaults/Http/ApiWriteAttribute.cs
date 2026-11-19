namespace Nexora.ServiceDefaults.Http;

[AttributeUsage(AttributeTargets.Method)]
public sealed class ApiWriteAttribute(string? revisionField = null, bool idempotent = true) : Attribute
{
    public string? RevisionField { get; } = revisionField;
    public bool Idempotent { get; } = idempotent;
}

[AttributeUsage(AttributeTargets.Method)]
public sealed class RevisionTaggedAttribute : Attribute;
