using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

public sealed class InvoiceDispatchStore(FinanceDbContext db) : IInvoiceDispatches
{
    private IQueryable<InvoiceDispatch> Scoped(ResourceScope scope) =>
        db.Set<InvoiceDispatch>().Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId);
    public Task<InvoiceDispatch?> FindAsync(ResourceScope scope, Guid id, CancellationToken ct) =>
        Scoped(scope).SingleOrDefaultAsync(x => x.Id == id, ct);
    public Task<InvoiceDispatch[]> ListAsync(ResourceScope scope, Guid documentId, bool isDonation, CancellationToken ct) =>
        Scoped(scope).AsNoTracking().Where(x => x.DocumentId == documentId && x.IsDonation == isDonation)
            .OrderByDescending(x => x.Id).Take(100).ToArrayAsync(ct);
    public void Add(InvoiceDispatch dispatch) => db.Add(dispatch);
}
