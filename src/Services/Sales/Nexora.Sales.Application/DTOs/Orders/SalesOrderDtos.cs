namespace Nexora.Sales.Application;

public sealed record SalesLineInput(Guid ItemId, string Quantity, string UnitPrice);

public sealed record SalesDraft(DateOnly On, Guid CustomerId, string? Note, SalesLineInput[] Lines,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    Guid? DepartmentId = null);

public sealed record SalesChange(Guid Id, long Version);

public sealed record SalesSummary(Guid Id, string Number, DateOnly On, string Currency, string CustomerName, string State, long Version, bool IsQuote, Guid? QuoteId,
    Guid? DepartmentId = null, string? Total = null);

public sealed record SalesList(bool CanCreate, bool CanApprove, bool HasMore, SalesSummary[] Orders);

public sealed record SalesLineView(Guid Id, Guid ItemId, string ItemCode, string ItemName, long ItemVersion, string UnitCode,
    long UnitVersion, string Quantity, string UnitPrice, string Amount);

public sealed record SalesDetail(SalesSummary Order, Guid CustomerId, string CustomerCode, long CustomerVersion,
    string Note, int MinorUnits, SalesLineView[] Lines, string Total, bool IsMaker, long? ApprovedVersion, DateTimeOffset? ApprovedAtUtc,
    SalesDocumentReference? ConvertedOrder = null);

public sealed record SalesDocumentReference(Guid Id, string Number);
