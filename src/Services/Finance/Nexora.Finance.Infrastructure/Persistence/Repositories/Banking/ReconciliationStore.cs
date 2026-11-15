using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

public sealed class ReconciliationStore(FinanceDbContext db) : IReconciliationStore
{
    private IQueryable<T> Scope<T>(ResourceScope scope) where T : class => db.Set<T>()
        .Where(x => EF.Property<Guid>(x, "TenantId") == scope.TenantId && EF.Property<Guid>(x, "WorkspaceId") == scope.WorkspaceId);

    public Task<BankReconciliation?> FindAsync(ResourceScope scope, Guid id, CancellationToken ct) =>
        Scope<BankReconciliation>(scope).SingleOrDefaultAsync(x => x.Id == id, ct);
    public Task<BankReconciliation[]> ListAsync(ResourceScope scope, Guid bankId, CancellationToken ct) =>
        Scope<BankReconciliation>(scope).AsNoTracking().Where(x => x.BankId == bankId)
            .OrderByDescending(x => x.CreatedAtUtc).ThenByDescending(x => x.Id).Take(100).ToArrayAsync(ct);
    public Task<DateOnly?> ClosedThroughAsync(ResourceScope scope, Guid bankId, CancellationToken ct) =>
        Scope<BankReconciliation>(scope).Where(x => x.BankId == bankId && x.State == ReconciliationState.Completed)
            .MaxAsync(x => (DateOnly?)x.Through, ct);
    public Task<bool> AnyClosedAccountAsync(ResourceScope scope, Guid[] accounts, DateOnly postingDate, CancellationToken ct) =>
        (from row in Scope<BankReconciliation>(scope)
         where row.State == ReconciliationState.Completed && row.Through >= postingDate
         join bank in Scope<BankAccount>(scope) on row.BankId equals bank.Id
         where accounts.Contains(bank.AccountId)
         select row.Id).AnyAsync(ct);
    public void Add(BankReconciliation reconciliation) => db.Add(reconciliation);

    public async Task<ReconciliationInput> InputsAsync(ResourceScope scope, BankAccount bank, DateOnly through, CancellationToken ct)
    {
        var scopedMovements = Scope<BankMovement>(scope).AsNoTracking().Where(x => x.BankId == bank.Id && x.On <= through);
        var source = Scope<TradeDocument>(scope).AsNoTracking();
        var movementRows = await (from movement in scopedMovements
                                  join doc in source on movement.DocumentId equals doc.Id into docs
                                  from doc in docs.DefaultIfEmpty()
                                  orderby movement.On, movement.Id
                                  select new { movement.Id, movement.JournalId, movement.On, movement.Amount, Terms = doc == null ? null : doc.Terms })
            .ToArrayAsync(ct);
        var movements = movementRows.Select(x => new ReconciliationMovement(x.Id, x.JournalId, x.On, x.Amount,
            x.Terms?.Kind == TradeKind.Opening)).ToArray();
        var scopedLines = Scope<StatementLine>(scope).AsNoTracking().Where(x => x.BankId == bank.Id && x.On <= through);
        var lines = await scopedLines.OrderBy(x => x.On).ThenBy(x => x.Id)
            .Select(x => new ReconciliationLine(x.Id, x.On, x.ExternalId, x.Amount, x.Excluded)).ToArrayAsync(ct);
        var matches = await (from match in Scope<StatementMatch>(scope).AsNoTracking()
                             where !match.Reversed
                             join movement in scopedMovements on match.MovementId equals movement.Id
                             join line in scopedLines.Where(x => !x.Excluded) on match.StatementLineId equals line.Id
                             orderby match.Id
                             select new ReconciliationMatch(match.Id, movement.Id, line.Id, match.Amount)).ToArrayAsync(ct);
        var balance = await (from journal in Scope<Journal>(scope).AsNoTracking()
                             where journal.State == JournalState.Posted && journal.On <= through
                             from line in journal.Lines
                             where line.AccountId == bank.AccountId
                             select line.Debit - line.Credit).SumAsync(ct);
        return new(balance, movements, lines, matches);
    }
}
