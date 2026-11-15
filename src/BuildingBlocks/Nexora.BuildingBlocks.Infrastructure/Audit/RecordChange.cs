namespace Nexora.BuildingBlocks.Infrastructure;

// Persisted snapshot row written in the same transaction as the business change.
public sealed class RecordChange
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid WorkspaceId { get; set; }
    public string Service { get; set; } = string.Empty;
    public string EntityName { get; set; } = string.Empty;
    public string EntityId { get; set; } = string.Empty;
    public string Operation { get; set; } = string.Empty;
    public string ActorIssuer { get; set; } = string.Empty;
    public string ActorSubject { get; set; } = string.Empty;
    public DateTimeOffset OccurredAtUtc { get; set; }
    public string? ChangedProperties { get; set; }
    public string? BeforeJson { get; set; }
    public string? AfterJson { get; set; }
}
