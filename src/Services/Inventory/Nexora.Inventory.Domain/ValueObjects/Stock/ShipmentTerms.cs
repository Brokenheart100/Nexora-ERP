namespace Nexora.Inventory.Domain;

public sealed record ShipmentTerms(Guid TenantId, Guid WorkspaceId, Guid PermitId, Guid OrderId, Guid LineId,
    long ApprovedVersion, Guid WarehouseId, Guid ItemId, Guid UnitId, Guid CustomerId, DateOnly OrderDate,
    decimal Quantity, decimal UnitPrice, string Currency, int MinorUnits, DateTimeOffset ExpiresAtUtc,
    string ItemName, string CustomerName);
