using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

public sealed class ChartStore(FinanceDbContext db) : IChartStore
{
    public async Task<ChartState?> ReadAsync(ResourceScope scope, CancellationToken ct)
    {
        var rows = await (from book in db.Books.AsNoTracking()
            where book.TenantId == scope.TenantId && book.WorkspaceId == scope.WorkspaceId
            join account in db.Accounts.AsNoTracking() on new { book.TenantId, book.WorkspaceId }
                equals new { account.TenantId, account.WorkspaceId } into accounts
            from account in accounts.DefaultIfEmpty()
            orderby account.Code
            select new { Book = book, Account = (ChartAccount?)account }).ToListAsync(ct);
        return rows.Count == 0 ? null : new(rows[0].Book, rows.Select(x => x.Account).OfType<ChartAccount>().ToArray());
    }

    public Task<AccountingBook?> LockBookAsync(ResourceScope scope, CancellationToken ct)
    {
        if (db.Database.CurrentTransaction is null)
            throw new InvalidOperationException("Financial writes require the book transaction.");
        return db.Books.FromSqlInterpolated($"""
            SELECT * FROM finance.books
            WHERE "TenantId" = {scope.TenantId} AND "WorkspaceId" = {scope.WorkspaceId}
            FOR UPDATE
            """).SingleOrDefaultAsync(ct);
    }

    public async Task<IReadOnlyList<ChartAccount>> ListAsync(ResourceScope scope, bool tracking, CancellationToken ct)
    {
        var query = db.Accounts.Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId);
        return await (tracking ? query : query.AsNoTracking()).OrderBy(x => x.Code).ToListAsync(ct);
    }

    public Task<ChartImportPreview?> FindPreviewAsync(BookAccess access, Guid id, CancellationToken ct) =>
        db.ImportPreviews.SingleOrDefaultAsync(x => x.Id == id && x.TenantId == access.Scope.TenantId
            && x.WorkspaceId == access.Scope.WorkspaceId && x.Issuer == access.Actor.Issuer && x.Subject == access.Actor.Subject, ct);

    public Task<FinanceAudit?> FindAuditAsync(BookAccess access, Guid operationId, CancellationToken ct) =>
        db.Audit.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == access.Scope.TenantId
            && x.WorkspaceId == access.Scope.WorkspaceId && x.Issuer == access.Actor.Issuer
            && x.Subject == access.Actor.Subject && x.OperationId == operationId, ct);

    public void Add(ChartAccount account) => db.Accounts.Add(account);
    public void Add(ChartImportPreview preview) => db.ImportPreviews.Add(preview);
    public void Add(FinanceAudit audit) => db.Audit.Add(audit);
}
