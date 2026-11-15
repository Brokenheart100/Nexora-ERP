namespace Nexora.Sales.Domain;

public sealed record SalesActor(string Issuer, string Subject);

public sealed record CustomerReference(Guid Id, string Code, string Name, long Version);

public sealed record StockReference(Guid ItemId, string Code, string Name, long ItemVersion, Guid CategoryId, long CategoryVersion,
    Guid UnitId, string UnitCode, long UnitVersion);

public sealed record SalesTerms(string Currency, int MinorUnits, DateOnly StartsOn);

public sealed record LineTerms(StockReference Stock, decimal Quantity, decimal UnitPrice);
