using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

public sealed class InvoiceShareStore(FinanceDbContext db) : IInvoiceShares
{
    private IQueryable<InvoiceShare> Scoped(ResourceScope scope) =>
        db.Set<InvoiceShare>().Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId);
    public Task<InvoiceShare?> FindAsync(ResourceScope scope, Guid id, CancellationToken ct) =>
        Scoped(scope).SingleOrDefaultAsync(x => x.Id == id, ct);
    public Task<InvoiceShare?> FindTokenAsync(string hash, CancellationToken ct) =>
        db.Set<InvoiceShare>().AsNoTracking().SingleOrDefaultAsync(x => x.TokenHash == hash, ct);
    public Task<InvoiceShare[]> ListAsync(ResourceScope scope, Guid invoiceId, CancellationToken ct) =>
        Scoped(scope).AsNoTracking().Where(x => x.InvoiceId == invoiceId).OrderByDescending(x => x.Id).Take(100).ToArrayAsync(ct);
    public void Add(InvoiceShare share) => db.Add(share);
}
