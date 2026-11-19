using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed record InvoiceInput(Guid ShipmentId, decimal Quantity);

public sealed record CustomerDraft(string Kind, string Number, DateOnly On, Guid? CustomerId = null, decimal Amount = 0,
    InvoiceInput[]? Lines = null, Guid? BankId = null, Guid? InvoiceId = null, Guid? FundsId = null,
    Guid? ReturnId = null, decimal ReturnQuantity = 0, DateOnly? DueOn = null);

public sealed record ReceivableHome(ReceivableAccounts? Accounts, bool CanConfigure, bool CanDraft, bool CanPost, string Currency,
    bool FiscalNumbering);

public sealed record CustomerDocumentView(Guid Id, CustomerTerms Terms, string State, long Version, Guid? JournalId,
    decimal OpenBalance, bool IsMaker, bool AwaitsFiscalNumber);

public sealed record InvoiceNumberingView(string? Pattern, long StartingNumber, long Version);
public sealed record InvoiceNumberPreview(string Number, int FiscalYear, long Sequence);

public sealed record ShipmentAllowance(Guid Id, Guid OrderId, Guid ItemId, Guid CustomerId, string CustomerName, string ItemName,
    DateOnly On, decimal Quantity, decimal UnitPrice, decimal Available, Guid? ReturnOf, decimal Creditable, bool Posted, string? PendingReason);
