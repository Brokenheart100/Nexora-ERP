using Nexora.Purchasing.Contracts;

namespace Nexora.Inventory.Application;

public sealed record InventoryChange(Guid Id, long Version);

public sealed record WarehouseView(Guid Id, string Code, string Name, Guid? ReceiverId, long Version, bool CanReceive,
    bool CanApproveReturns, bool CanApproveSalesReturns, bool CanReadStock = false);

public sealed record WarehousesView(bool CanManage, WarehouseView[] Warehouses);

public sealed record ReceiptView(ReceiptTicketV1 Ticket, string Executed, string Cost, bool Fenced, long Revision);

public sealed record PoolView(Guid ItemId, Guid UnitId, string Currency, string Quantity, string Value, string Average, long Sequence, string Reserved, string Available);

public sealed record MovementView(Guid Id, Guid ItemId, Guid PermitId, long Sequence, DateOnly On, string Quantity, string Cost, Guid? ReversesId);

public sealed record StockReturnView(Guid Id, Guid OriginalId, DateOnly On, string Quantity, string Reason, Guid? MovementId,
    bool Cancelled, bool CanConfirm);

public sealed record ReceiptApplied(InventoryChange Result, ReceiptProgressV1? Progress, InventoryCostedV1? Costed);
