namespace Nexora.Purchasing.Contracts;

public static class ReceiptRoutes
{
    public const string InventoryExchange = "nexora.inventory.receipt.commands";
    public const string InventoryQueue = "nexora.inventory.receipts.v1";
    public const string PurchasingExchange = "nexora.purchasing.receipt.events";
    public const string PurchasingQueue = "nexora.purchasing.receipts.v1";
    public const string CostExchange = "nexora.inventory.cost.events";
    public const string FinanceQueue = "nexora.finance.inventory-cost.v1";
}

public sealed record ReceiptTicketV1(Guid TenantId, Guid WorkspaceId, Guid PermitId, Guid OrderId, Guid LineId,
    long ApprovedVersion, Guid WarehouseId, Guid ItemId, Guid UnitId, Guid SupplierId, DateOnly OrderDate,
    string Quantity, string UnitPrice, string Currency, int MinorUnits);
public sealed record ReceiptGrantedV1(Guid EventId, ReceiptTicketV1 Ticket, DateTimeOffset OccurredAtUtc);
public sealed record ReceiptFenceV1(Guid EventId, ReceiptTicketV1 Ticket, DateTimeOffset OccurredAtUtc);
public sealed record ReceiptProgressV1(Guid EventId, Guid Id, Guid TenantId, Guid WorkspaceId, Guid OrderId,
    long Revision, string Executed, bool Fenced, DateTimeOffset OccurredAtUtc);
public sealed record InventoryCostedV1(Guid EventId, Guid TenantId, Guid WorkspaceId, Guid WarehouseId, Guid ItemId,
    Guid OrderId, Guid LineId, Guid PermitId, Guid SupplierId, long Sequence, DateOnly On, string Quantity,
    string Cost, string Currency, DateTimeOffset OccurredAtUtc, Guid? ReversesId = null, Guid? AdjustmentForBillId = null);
public sealed record StockAdjustedV1(Guid EventId, Guid StockOperationId, Guid TenantId, Guid WorkspaceId, Guid WarehouseId,
    Guid ItemId, long Sequence, DateOnly On, string Quantity, string Cost, string Currency, bool Transfer);
public sealed record PurchaseVarianceV1(Guid EventId, Guid TenantId, Guid WorkspaceId, Guid BillId, Guid ReceiptId,
    DateOnly On, string Quantity, string Amount, string Currency, DateTimeOffset OccurredAtUtc, string? SourceQuantity = null, Guid? AdjustmentId = null);
