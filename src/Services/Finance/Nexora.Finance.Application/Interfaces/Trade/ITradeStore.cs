using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public interface ITradeStore
{
    Task<TradeSetup?> SetupAsync(ResourceScope scope, CancellationToken ct);
    Task<BankAccount[]> BanksAsync(ResourceScope scope, CancellationToken ct);
    Task<BankAccount?> BankAsync(ResourceScope scope, Guid id, CancellationToken ct);
    Task<TradeDocument?> DocumentAsync(ResourceScope scope, Guid id, CancellationToken ct);
    Task<TradeDocument[]> DocumentsAsync(ResourceScope scope, int page, CancellationToken ct, bool postedBillsOnly = false);
    Task<BankMovement?> MovementAsync(ResourceScope scope, Guid id, CancellationToken ct);
    Task<BankMovement[]> MovementsAsync(ResourceScope scope, Guid bankId, int page, CancellationToken ct);
    Task<BankMovement[]> DocumentMovementsAsync(ResourceScope scope, Guid id, CancellationToken ct);
    Task<ReceiptAccrual?> ReceiptAsync(ResourceScope scope, Guid id, CancellationToken ct);
    Task<ReceiptAccrual[]> ReceiptsAsync(ResourceScope scope, int page, CancellationToken ct);
    Task<ReceiptAccrual?> NextCostAsync(ResourceScope scope, ReceiptFact fact, CancellationToken ct);
    Task<bool> PredecessorPostedAsync(ReceiptFact fact, CancellationToken ct);
    Task<bool> HasPendingReturnAsync(ResourceScope scope, Guid receiptId, CancellationToken ct);
    void Add(TradeSetup setup);
    void Add(BankAccount bank);
    void Add(TradeDocument document);
    void Add(BankMovement movement);
    void Add(ReceiptAccrual receipt);
}
