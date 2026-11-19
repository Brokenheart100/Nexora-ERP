namespace Nexora.Finance.Domain;

public sealed record BillReceiptInput(Guid ReceiptId, decimal Quantity, decimal Net, Guid? TaxAssessmentId);

public sealed record DonationReceiptIdentity(string DonorName, string RecipientName);

public sealed record TradeTerms(TradeKind Kind, DateOnly On, string Number, string Memo, decimal Amount,
    Guid? BankId, Guid? OtherBankId, Guid? CounterAccountId, Guid? SourceId, Guid? PartnerId, decimal Quantity,
    Guid? TaxAssessmentId, Guid? StatementLineId, string? Method, Guid? ReturnReceiptId = null, BillReceiptInput[]? BillReceipts = null, [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)] DateOnly? DueOn = null,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)] DonationReceiptIdentity? DonationIdentity = null,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)] OpeningSubledgerSource? OpeningSource = null);
