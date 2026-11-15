namespace Nexora.Finance.Domain;

public sealed record BillReceiptMatch(Guid Id, Guid ReceiptId, decimal Quantity, decimal Net, decimal Tax, decimal Variance,
    decimal CreditedQuantity = 0, decimal CreditedNet = 0, decimal CreditedTax = 0);
