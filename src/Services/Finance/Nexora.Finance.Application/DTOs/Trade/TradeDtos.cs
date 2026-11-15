using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed record TradeAccounts(Guid InventoryAccountId, Guid AccrualAccountId, Guid PayableAccountId, Guid InputTaxAccountId,
    Guid VarianceAccountId, Guid DonationIncomeAccountId, Guid? SupplierRecoveryAccountId = null);

public sealed record TradeHome(string Currency, int MinorUnits, bool CanConfigure, bool CanSubmit, bool CanApprove, TradeSetup? Setup,
    BankView[] Banks);

public sealed record BankView(Guid Id, string Code, string Name, string Kind, Guid AccountId, bool IsDefault, decimal Balance, long Version);

public sealed record TradeDocumentView(Guid Id, TradeTerms Terms, string State, long Version, Guid? JournalId, Guid? ReversedById,
    decimal Total, decimal Outstanding, decimal Recoverable, bool IsMaker, BillReceiptMatch[]? BillMatches);

public sealed record AccrualView(ReceiptFact Fact, bool Posted, string? PendingReason, Guid? JournalId, decimal MatchedQuantity, decimal MatchedCost);

public sealed record TradeChange(Guid Id, long Version);

public sealed record VariancePlan(ResourceScope Scope, Guid BillId, Guid ReceiptId, DateOnly On, decimal Quantity, decimal Amount,
    string Currency, DateTimeOffset OccurredAtUtc, decimal SourceQuantity, Guid AdjustmentId);

public sealed record TradeDecision(TradeChange Change, IReadOnlyList<VariancePlan> Variances);
