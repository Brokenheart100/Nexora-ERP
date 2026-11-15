using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

public sealed class FiscalYearStore(FinanceDbContext db) : IFiscalYearStore
{
    private IQueryable<FiscalYearClose> Scoped(ResourceScope scope) =>
        db.Set<FiscalYearClose>().Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId);
    public Task<FiscalYearClose?> FindAsync(ResourceScope scope, Guid id, CancellationToken ct) =>
        Scoped(scope).SingleOrDefaultAsync(x => x.Id == id, ct);
    public Task<FiscalYearClose[]> ListAsync(ResourceScope scope, CancellationToken ct) =>
        Scoped(scope).AsNoTracking().OrderByDescending(x => x.First).ThenByDescending(x => x.Id).Take(100).ToArrayAsync(ct);
    public Task<DateOnly?> LatestClosedAsync(ResourceScope scope, CancellationToken ct) =>
        Scoped(scope).Where(x => x.State == FiscalCloseState.Closed).MaxAsync(x => (DateOnly?)x.Last, ct);
    public Task<bool> IsClosedAsync(ResourceScope scope, DateOnly month, CancellationToken ct) =>
        Scoped(scope).AnyAsync(x => x.State == FiscalCloseState.Closed && x.First <= month.AddMonths(1).AddDays(-1) && x.Last >= month, ct);
    public Task<int> PendingDocumentsAsync(ResourceScope scope, DateOnly from, DateOnly through, CancellationToken ct) =>
        db.Database.SqlQuery<int>($"""
            SELECT COUNT(*)::integer AS "Value" FROM (
                SELECT 1 FROM finance.trade_documents
                WHERE "TenantId" = {scope.TenantId} AND "WorkspaceId" = {scope.WorkspaceId}
                    AND "State" = {(int)TradeState.Submitted} AND ("Terms"->>'On')::date BETWEEN {from} AND {through}
                UNION ALL
                SELECT 1 FROM finance.customer_documents
                WHERE "TenantId" = {scope.TenantId} AND "WorkspaceId" = {scope.WorkspaceId}
                    AND "State" = {(int)CustomerDocumentState.Submitted} AND ("Terms"->>'On')::date BETWEEN {from} AND {through}
                UNION ALL
                SELECT 1 FROM finance.receipt_accruals
                WHERE "TenantId" = {scope.TenantId} AND "WorkspaceId" = {scope.WorkspaceId}
                    AND NOT "Posted" AND ("Fact"->>'On')::date BETWEEN {from} AND {through}
            ) AS pending
            """).SingleAsync(ct);

    public void Add(FiscalYearClose row) => db.Add(row);
}
