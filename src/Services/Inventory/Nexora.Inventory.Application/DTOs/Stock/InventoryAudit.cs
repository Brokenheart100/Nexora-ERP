namespace Nexora.Inventory.Application;

public sealed record InventoryAudit(Guid Id, Guid TenantId, Guid WorkspaceId, string Issuer, string Subject,
    Guid OperationId, string Fingerprint, Guid TargetId, long ResultVersion, DateTimeOffset OccurredAtUtc);
