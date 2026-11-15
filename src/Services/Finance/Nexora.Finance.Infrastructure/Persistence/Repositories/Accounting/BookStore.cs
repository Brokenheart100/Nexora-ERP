using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

public sealed class BookStore(FinanceDbContext db) : IBookStore
{
    public Task<AccountingBook?> FindAsync(ResourceScope scope, CancellationToken ct) =>
        db.Books.AsNoTracking().SingleOrDefaultAsync(x => x.WorkspaceId == scope.WorkspaceId && x.TenantId == scope.TenantId, ct);

    public async Task<IReadOnlyList<ChartAccount>> ListAccountsAsync(ResourceScope scope, CancellationToken ct) =>
        await db.Accounts.AsNoTracking().Where(x => x.WorkspaceId == scope.WorkspaceId && x.TenantId == scope.TenantId)
            .OrderBy(x => x.Code).ToListAsync(ct);

    public void Add(AccountingBook book, IReadOnlyList<ChartAccount> accounts)
    {
        db.Books.Add(book);
        db.Accounts.AddRange(accounts);
    }
}
