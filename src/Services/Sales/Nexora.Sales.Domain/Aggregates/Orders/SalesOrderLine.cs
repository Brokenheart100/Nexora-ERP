namespace Nexora.Sales.Domain;

public sealed class SalesOrderLine
{
    private SalesOrderLine() { }

    internal SalesOrderLine(SalesOrder order, int ordinal, LineTerms terms)
    {
        if (terms.Quantity is <= 0 or > 1_000_000m || Math.Round(terms.Quantity, 6) != terms.Quantity)
            throw new ArgumentException("Use a positive quantity with up to six decimal places.");
        if (terms.UnitPrice is <= 0 or > 10_000_000m || Math.Round(terms.UnitPrice, 6) != terms.UnitPrice)
            throw new ArgumentException("Use a positive unit price with up to six decimal places.");
        var stock = terms.Stock;
        Id = Guid.CreateVersion7();
        TenantId = order.TenantId;
        WorkspaceId = order.WorkspaceId;
        OrderId = order.Id;
        Ordinal = ordinal;
        ItemId = stock.ItemId;
        ItemCode = stock.Code;
        ItemName = stock.Name;
        ItemVersion = stock.ItemVersion;
        CategoryId = stock.CategoryId;
        CategoryVersion = stock.CategoryVersion;
        UnitId = stock.UnitId;
        UnitCode = stock.UnitCode;
        UnitVersion = stock.UnitVersion;
        Quantity = terms.Quantity;
        UnitPrice = terms.UnitPrice;
        Amount = Math.Round(Quantity * UnitPrice, order.MinorUnits, MidpointRounding.AwayFromZero);
    }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public Guid OrderId { get; private set; }
    public int Ordinal { get; private set; }
    public Guid ItemId { get; private set; }
    public string ItemCode { get; private set; } = "";
    public string ItemName { get; private set; } = "";
    public long ItemVersion { get; private set; }
    public Guid CategoryId { get; private set; }
    public long CategoryVersion { get; private set; }
    public Guid UnitId { get; private set; }
    public string UnitCode { get; private set; } = "";
    public long UnitVersion { get; private set; }
    public decimal Quantity { get; private set; }
    public decimal UnitPrice { get; private set; }
    public decimal Amount { get; private set; }

    internal LineTerms Snapshot() => new(new(ItemId, ItemCode, ItemName, ItemVersion, CategoryId, CategoryVersion,
        UnitId, UnitCode, UnitVersion), Quantity, UnitPrice);

    internal bool Matches(StockReference stock) => stock.ItemId == ItemId && stock.ItemVersion == ItemVersion
        && stock.CategoryId == CategoryId && stock.CategoryVersion == CategoryVersion && stock.UnitId == UnitId && stock.UnitVersion == UnitVersion;
}
