namespace Nexora.BuildingBlocks.Application;

// Record changes keep a before/after snapshot for every write that carries tenant and workspace scope.
public static class RecordChangeOperations
{
    public const string Created = "created";
    public const string Updated = "updated";
    public const string Deleted = "deleted";
}

public sealed record RecordChangeQuery(DateTimeOffset? From, DateTimeOffset? Through, string? Actor, string? EntityName,
    string? Operation, Guid? EntityId, int Page = 1, int PageSize = AuditQuery.DefaultPageSize)
{
    public int RetentionDays => AuditQuery.RetentionDays;

    public RecordChangeQuery Normalize(TimeProvider clock) => this with
    {
        Page = Page < 1 ? 1 : Page,
        PageSize = PageSize is < 1 or > AuditQuery.MaxPageSize ? AuditQuery.DefaultPageSize : PageSize,
        From = From ?? clock.GetUtcNow().AddDays(-AuditQuery.RetentionDays),
        Actor = string.IsNullOrWhiteSpace(Actor) ? null : Actor.Trim(),
        EntityName = string.IsNullOrWhiteSpace(EntityName) ? null : EntityName.Trim(),
        Operation = string.IsNullOrWhiteSpace(Operation) ? null : Operation.Trim().ToLowerInvariant(),
    };
}

public sealed record RecordChangeView(Guid Id, string Service, string EntityName, string EntityId, string Operation,
    Guid TenantId, Guid WorkspaceId, string ActorIssuer, string ActorSubject, DateTimeOffset OccurredAtUtc,
    string? ChangedProperties, string? BeforeJson, string? AfterJson);

public sealed record RecordChangePage(IReadOnlyList<RecordChangeView> Changes, bool HasMore)
{
    public int RetentionDays => AuditQuery.RetentionDays;
}

public interface IRecordChangeReader
{
    Task<RecordChangePage> ReadAsync(ResourceScope scope, RecordChangeQuery query, CancellationToken cancellationToken);

    Task<string> ExportCsvAsync(ResourceScope scope, RecordChangeQuery query, CancellationToken cancellationToken);
}
