namespace Nexora.Finance.Domain;

public sealed record ReceivableAccounts(Guid ReceivableAccountId, Guid AdvanceAccountId, Guid RevenueAccountId,
    Guid OutputTaxAccountId, Guid CostOfGoodsAccountId);

public sealed record SaleSnapshot(Guid CustomerId, string CustomerName, string ItemName, decimal UnitPrice);

public sealed record InvoiceBrand(string LegalName, string BrandName, string AccentColor, string? LogoPngBase64, long Version,
    string DateFormat = "yyyy-MM-dd", string TimeZone = "Asia/Shanghai");

public sealed record InvoiceLine(Guid? ShipmentId, Guid ItemId, string Name, decimal Quantity, decimal UnitPrice, decimal Net,
    decimal Tax, TaxAmount[] Components);

public sealed record CustomerTerms(CustomerDocumentKind Kind, string Number, DateOnly On, Guid CustomerId, string CustomerName,
    string Currency, decimal Total, InvoiceLine[]? Lines = null, InvoiceBrand? Brand = null, Guid? BankId = null,
    Guid? InvoiceId = null, Guid? FundsId = null, Guid? ReturnId = null, DateOnly? DueOn = null,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    OpeningSubledgerSource? OpeningSource = null);
