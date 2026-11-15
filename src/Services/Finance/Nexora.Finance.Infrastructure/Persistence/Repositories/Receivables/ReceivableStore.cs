using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

public sealed class ReceivableStore(FinanceDbContext db) : IReceivableStore
{
    private IQueryable<T> Scope<T>(ResourceScope scope) where T : class => db.Set<T>()
        .Where(x => EF.Property<Guid>(x, "TenantId") == scope.TenantId && EF.Property<Guid>(x, "WorkspaceId") == scope.WorkspaceId);

    public Task<ReceivableSetup?> SetupAsync(ResourceScope scope, CancellationToken ct) =>
        Scope<ReceivableSetup>(scope).SingleOrDefaultAsync(ct);
    public Task<CustomerDocument?> FindAsync(ResourceScope scope, Guid id, CancellationToken ct) =>
        Scope<CustomerDocument>(scope).SingleOrDefaultAsync(x => x.Id == id, ct);
    public Task<CustomerDocument[]> ListAsync(ResourceScope scope, int page, CancellationToken ct) =>
        Scope<CustomerDocument>(scope).AsNoTracking().OrderByDescending(x => x.Id).Skip((page - 1) * 50).Take(50).ToArrayAsync(ct);
    public Task<CustomerDocument[]> CreditsAsync(ResourceScope scope, Guid invoiceId, CancellationToken ct) =>
        db.Set<CustomerDocument>().FromSqlInterpolated($"""
            SELECT * FROM finance.customer_documents WHERE "TenantId" = {scope.TenantId} AND "WorkspaceId" = {scope.WorkspaceId}
              AND "Terms"->>'InvoiceId' = {invoiceId.ToString()}
              AND ("Terms"->>'Kind')::integer = {(int)CustomerDocumentKind.Credit} AND "State" = {(int)CustomerDocumentState.Posted}
            """).AsNoTracking().ToArrayAsync(ct);
    public Task<ReceiptAccrual[]> ShipmentsAsync(ResourceScope scope, int page, CancellationToken ct) =>
        Scope<ReceiptAccrual>(scope).AsNoTracking().Where(x => x.IsSales).OrderByDescending(x => x.Id)
            .Skip((page - 1) * 50).Take(50).ToArrayAsync(ct);
    public void Add(ReceivableSetup setup) => db.Add(setup);
    public void Add(CustomerDocument document) => db.Add(document);
}
