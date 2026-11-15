namespace Nexora.Inventory.Domain;

public sealed record ReceiptTerms(Guid TenantId, Guid WorkspaceId, Guid PermitId, Guid OrderId, Guid LineId,
    long ApprovedVersion, Guid WarehouseId, Guid ItemId, Guid UnitId, Guid SupplierId,
    DateOnly OrderDate, decimal Quantity, decimal UnitPrice, string Currency, int MinorUnits);
