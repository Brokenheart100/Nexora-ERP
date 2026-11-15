namespace Nexora.Purchasing.Application;

public sealed record PermitChange(Guid PermitId, long OrderVersion);

public sealed record PermitView(Guid Id, Guid LineId, Guid WarehouseId, string Quantity, string Executed, long Revision, string State);

public sealed record ReceiptAllowances(bool CanManage, PermitView[] Permits);
