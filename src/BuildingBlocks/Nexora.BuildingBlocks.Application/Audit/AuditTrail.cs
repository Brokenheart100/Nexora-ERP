namespace Nexora.BuildingBlocks.Application;

// One audit shape lets the workspace UI merge security and business audit entries from several services.
public sealed record AuditQuery(DateTimeOffset? From, DateTimeOffset? Through, string? Actor, string? Action,
    Guid? TargetId, int Page = 1, int PageSize = 50)
{
    public const int DefaultPageSize = 50;
    public const int MaxPageSize = 200;
    public const int RetentionDays = 730;

    public AuditQuery Normalize(TimeProvider clock) => this with
    {
        Page = Page < 1 ? 1 : Page,
        PageSize = PageSize is < 1 or > MaxPageSize ? DefaultPageSize : PageSize,
        From = From ?? clock.GetUtcNow().AddDays(-RetentionDays),
    };
}

public sealed record AuditEntry(Guid Id, string Source, string Action, string ActorIssuer, string ActorSubject,
    Guid? TargetId, long? Version, Guid? OperationId, DateTimeOffset OccurredAtUtc);

public sealed record AuditPage(IReadOnlyList<AuditEntry> Entries, bool HasMore)
{
    public int RetentionDays => AuditQuery.RetentionDays;
}

public static class AuditSources
{
    public const string Organization = "organization";
    public const string Finance = "finance";
    public const string Sales = "sales";
    public const string Purchasing = "purchasing";
}
