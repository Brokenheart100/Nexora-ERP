using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

public sealed class TradeStore(FinanceDbContext db) : ITradeStore, IStatementStore
{
    private IQueryable<T> Scope<T>(ResourceScope scope) where T : class => db.Set<T>()
        .Where(x => EF.Property<Guid>(x, "TenantId") == scope.TenantId && EF.Property<Guid>(x, "WorkspaceId") == scope.WorkspaceId);

    public Task<TradeSetup?> SetupAsync(ResourceScope scope, CancellationToken ct) => Scope<TradeSetup>(scope).SingleOrDefaultAsync(ct);
    public Task<BankAccount[]> BanksAsync(ResourceScope scope, CancellationToken ct) => Scope<BankAccount>(scope).OrderBy(x => x.Code).ToArrayAsync(ct);
    public Task<BankAccount?> BankAsync(ResourceScope scope, Guid id, CancellationToken ct) => Scope<BankAccount>(scope).SingleOrDefaultAsync(x => x.Id == id, ct);
    public Task<TradeDocument?> DocumentAsync(ResourceScope scope, Guid id, CancellationToken ct) => Scope<TradeDocument>(scope).SingleOrDefaultAsync(x => x.Id == id, ct);
    public Task<TradeDocument[]> DocumentsAsync(ResourceScope scope, int page, CancellationToken ct) => Scope<TradeDocument>(scope).AsNoTracking()
        .OrderByDescending(x => x.CreatedAtUtc).ThenByDescending(x => x.Id).Skip((page - 1) * 50).Take(50).ToArrayAsync(ct);
    public Task<BankMovement?> MovementAsync(ResourceScope scope, Guid id, CancellationToken ct) => Scope<BankMovement>(scope).SingleOrDefaultAsync(x => x.Id == id, ct);
    public Task<BankMovement[]> MovementsAsync(ResourceScope scope, Guid bankId, int page, CancellationToken ct) => Scope<BankMovement>(scope).AsNoTracking()
        .Where(x => x.BankId == bankId).OrderByDescending(x => x.On).ThenByDescending(x => x.Id).Skip((page - 1) * 50).Take(50).ToArrayAsync(ct);
    public Task<BankMovement[]> DocumentMovementsAsync(ResourceScope scope, Guid id, CancellationToken ct) =>
        Scope<BankMovement>(scope).Where(x => x.DocumentId == id).ToArrayAsync(ct);
    public Task<ReceiptAccrual?> ReceiptAsync(ResourceScope scope, Guid id, CancellationToken ct)
    {
        // A buffered return may follow the source being accrued in the current transaction.
        var pending = db.Set<ReceiptAccrual>().Local.SingleOrDefault(x => x.Id == id
            && x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId);
        return pending is null ? Scope<ReceiptAccrual>(scope).SingleOrDefaultAsync(x => x.Id == id, ct) : Task.FromResult<ReceiptAccrual?>(pending);
    }
    public Task<ReceiptAccrual[]> ReceiptsAsync(ResourceScope scope, int page, CancellationToken ct) => Scope<ReceiptAccrual>(scope).AsNoTracking()
        .Where(x => !x.IsSales).OrderByDescending(x => x.Id).Skip((page - 1) * 50).Take(50).ToArrayAsync(ct);
    public Task<ReceiptAccrual?> NextCostAsync(ResourceScope scope, ReceiptFact fact, CancellationToken ct) =>
        Scope<ReceiptAccrual>(scope).SingleOrDefaultAsync(x => x.WarehouseId == fact.WarehouseId && x.ItemId == fact.ItemId
            && x.Sequence == fact.Sequence + 1, ct);
    public Task<bool> PredecessorPostedAsync(ReceiptFact fact, CancellationToken ct) => fact.Sequence == 1
        ? Task.FromResult(true)
        : Scope<ReceiptAccrual>(new(fact.TenantId, fact.WorkspaceId)).AnyAsync(x =>
            x.WarehouseId == fact.WarehouseId && x.ItemId == fact.ItemId && x.Sequence == fact.Sequence - 1 && x.Posted, ct);

    public Task<bool> HasPendingReturnAsync(ResourceScope scope, Guid receiptId, CancellationToken ct) =>
        db.Set<ReceiptAccrual>().FromSqlInterpolated($"""
            SELECT * FROM finance.receipt_accruals
            WHERE "TenantId" = {scope.TenantId} AND "WorkspaceId" = {scope.WorkspaceId}
              AND NOT "Posted" AND "Fact"->>'ReversesId' = {receiptId.ToString()}
            """).AnyAsync(ct);

    public Task<BankImportPreview?> PreviewAsync(BookAccess access, Guid id, CancellationToken ct) =>
        Scope<BankImportPreview>(access.Scope).SingleOrDefaultAsync(x => x.Id == id && x.Issuer == access.Actor.Issuer && x.Subject == access.Actor.Subject, ct);
    public Task<StatementLine[]> ExistingAsync(ResourceScope scope, Guid bankId, string[] ids, CancellationToken ct) =>
        Scope<StatementLine>(scope).AsNoTracking().Where(x => x.BankId == bankId && ids.Contains(x.ExternalId)).ToArrayAsync(ct);
    public Task<StatementLine[]> ListAsync(ResourceScope scope, Guid bankId, int page, CancellationToken ct) =>
        Scope<StatementLine>(scope).AsNoTracking().Where(x => x.BankId == bankId)
            .OrderByDescending(x => x.On).ThenByDescending(x => x.Id).Skip((page - 1) * 50).Take(50).ToArrayAsync(ct);
    public Task<StatementLine?> LineAsync(ResourceScope scope, Guid id, CancellationToken ct) => Scope<StatementLine>(scope).SingleOrDefaultAsync(x => x.Id == id, ct);
    public Task<StatementMatch?> MatchAsync(ResourceScope scope, Guid id, CancellationToken ct) => Scope<StatementMatch>(scope).SingleOrDefaultAsync(x => x.Id == id, ct);
    public Task<StatementMatch[]> MatchesAsync(ResourceScope scope, Guid lineId, CancellationToken ct) =>
        Scope<StatementMatch>(scope).AsNoTracking().Where(x => x.StatementLineId == lineId).OrderBy(x => x.Id).ToArrayAsync(ct);

    public void Add(TradeSetup setup) => db.Add(setup);
    public void Add(BankAccount bank) => db.Add(bank);
    public void Add(TradeDocument document) => db.Add(document);
    public void Add(BankMovement movement) => db.Add(movement);
    public void Add(ReceiptAccrual receipt) => db.Add(receipt);
    public void Add(BankImportPreview preview) => db.Add(preview);
    public void Add(StatementLine line) => db.Add(line);
    public void Add(StatementMatch match) => db.Add(match);
}
