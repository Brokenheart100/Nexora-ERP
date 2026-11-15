namespace Nexora.Inventory.Domain;

public sealed record StockMovement(Guid Id, Guid TenantId, Guid WorkspaceId, Guid WarehouseId, Guid ItemId,
    Guid PermitId, long Sequence, DateOnly On, decimal Quantity, decimal Cost, DateTimeOffset OccurredAtUtc,
    Guid? ReversesId = null, string? Reason = null);
