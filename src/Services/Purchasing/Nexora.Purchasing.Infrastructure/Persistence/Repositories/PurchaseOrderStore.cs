using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Purchasing.Application;
using Nexora.Purchasing.Domain;

namespace Nexora.Purchasing.Infrastructure;

public sealed class PurchaseOrderStore(PurchasingDbContext db) : IPurchaseOrders
{
    private IQueryable<PurchaseOrder> Scoped(ResourceScope scope) =>
        db.Orders.Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId);

    public async Task<IReadOnlyList<PurchaseOrder>> PageAsync(PurchaseAccess access, PageWindow page, CancellationToken ct)
    {
        var query = Scoped(access.Scope).AsNoTracking();
        if (!access.Allows(PurchasePermissions.Read))
        {
            var departments = access.DepartmentsFor(PurchasePermissions.Read);
            var ownDepartments = access.DepartmentsFor(PurchasePermissions.OwnRead);
            var ownCompany = access.Allows(PurchasePermissions.OwnRead);
            var actor = access.Actor;
            query = query.Where(x => (x.DepartmentId.HasValue && departments.Contains(x.DepartmentId.Value))
                || (x.MakerIssuer == actor.Issuer && x.MakerSubject == actor.Subject &&
                    (ownCompany || x.DepartmentId.HasValue && ownDepartments.Contains(x.DepartmentId.Value))));
        }
        return await query.OrderByDescending(x => x.CreatedAtUtc).ThenByDescending(x => x.Id)
            .Skip(page.Offset).Take(page.Size + 1).ToArrayAsync(ct);
    }

    public Task<PurchaseOrder?> GetAsync(ResourceScope scope, Guid id, CancellationToken ct) =>
        Scoped(scope).AsNoTracking().Include(x => x.Lines).SingleOrDefaultAsync(x => x.Id == id, ct);

    public async Task<PurchaseOrder?> LockAsync(ResourceScope scope, Guid id, CancellationToken ct)
    {
        RequireTransaction();
        var order = await db.Orders.FromSqlInterpolated($"""
            SELECT * FROM purchasing.orders
            WHERE "TenantId" = {scope.TenantId} AND "WorkspaceId" = {scope.WorkspaceId} AND "Id" = {id}
            FOR UPDATE
            """).SingleOrDefaultAsync(ct);
        if (order is not null) await db.Entry(order).Collection(x => x.Lines).LoadAsync(ct);
        return order;
    }

    public async Task LockOperationAsync(PurchaseAccess current, Guid operationId, CancellationToken ct)
    {
        RequireTransaction();
        var key = $"purchasing:{current.Scope.TenantId}:{current.Scope.WorkspaceId}:{current.Actor.Issuer}:{current.Actor.Subject}:{operationId}";
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({key}, 0))", ct);
    }

    public Task<PurchaseAudit?> FindOperationAsync(PurchaseAccess current, Guid operationId, CancellationToken ct) =>
        db.Audit.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == current.Scope.TenantId && x.WorkspaceId == current.Scope.WorkspaceId
            && x.Issuer == current.Actor.Issuer && x.Subject == current.Actor.Subject && x.OperationId == operationId, ct);

    public void Add(PurchaseOrder order) => db.Orders.Add(order);
    public void Add(PurchaseAudit audit) => db.Audit.Add(audit);

    private void RequireTransaction()
    {
        if (db.Database.CurrentTransaction is null) throw new InvalidOperationException("Purchasing mutations require a transaction.");
    }
}
