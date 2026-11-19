namespace Nexora.Finance.Contracts.Opening;

public static class StockOpeningRoutes
{
    public const string Exchange = "nexora.inventory.opening.commands";
    public const string Queue = "nexora.inventory.opening.v1";
}

public sealed record OpeningStockRowV1(Guid MovementId, Guid WarehouseId, Guid ItemId, Guid UnitId, string Quantity, string Value);

public sealed record OpeningStockRequestedV1(Guid BatchId, Guid TenantId, Guid WorkspaceId, DateOnly On, string Currency,
    OpeningStockRowV1[] Rows);

public sealed record OpeningStockAcknowledgedV1(Guid BatchId, Guid TenantId, Guid WorkspaceId, string? Rejection);
