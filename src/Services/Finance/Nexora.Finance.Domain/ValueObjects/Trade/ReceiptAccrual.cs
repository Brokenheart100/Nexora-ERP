namespace Nexora.Finance.Domain;

public sealed record ReceiptFact(Guid Id, Guid TenantId, Guid WorkspaceId, Guid WarehouseId, Guid ItemId, Guid OrderId,
    Guid LineId, Guid PermitId, Guid SupplierId, long Sequence, DateOnly On, decimal Quantity, decimal Cost, string Currency, Guid? ReversesId,
    Guid? AdjustmentForBillId = null, SaleSnapshot? Sale = null, StockAdjustment? Stock = null);

public sealed record StockAdjustment(Guid OperationId, bool Transfer);
