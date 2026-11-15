namespace Nexora.Purchasing.Application;

public sealed record PurchaseLineInput(Guid ItemId, string Quantity, string UnitPrice);

public sealed record PurchaseDraft(DateOnly On, Guid SupplierId, string? Note, PurchaseLineInput[] Lines,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    Guid? DepartmentId = null);

public sealed record PurchaseChange(Guid Id, long Version);

public sealed record PurchaseSummary(Guid Id, string Number, DateOnly On, string Currency, string SupplierName, string State, long Version,
    Guid? DepartmentId = null);

public sealed record PurchaseList(bool CanCreate, bool CanApprove, bool HasMore, PurchaseSummary[] Orders);

public sealed record PurchaseLineView(Guid Id, Guid ItemId, string ItemCode, string ItemName, long ItemVersion, string UnitCode,
    long UnitVersion, string Quantity, string UnitPrice, string Amount);

public sealed record PurchaseDetail(PurchaseSummary Order, Guid SupplierId, string SupplierCode, long SupplierVersion,
    string Note, int MinorUnits, PurchaseLineView[] Lines, string Total, bool IsMaker, long? ApprovedVersion, DateTimeOffset? ApprovedAtUtc);
