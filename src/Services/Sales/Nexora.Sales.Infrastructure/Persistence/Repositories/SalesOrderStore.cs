using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Sales.Application;
using Nexora.Sales.Domain;

namespace Nexora.Sales.Infrastructure;

public sealed class SalesOrderStore(SalesDbContext db) : ISalesOrders
{
    private IQueryable<SalesOrder> Scoped(ResourceScope scope) =>
        db.Orders.Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId);

    public async Task<IReadOnlyList<SalesOrder>> PageAsync(SalesAccess access, PageWindow page, CancellationToken ct, bool? isQuote = null)
    {
        var query = Scoped(access.Scope).AsNoTracking();
        if (!access.Allows(SalesPermissions.Read))
        {
            var departments = access.DepartmentsFor(SalesPermissions.Read);
            var ownDepartments = access.DepartmentsFor(SalesPermissions.OwnRead);
            var ownCompany = access.Allows(SalesPermissions.OwnRead);
            var actor = access.Actor;
            query = query.Where(x => (x.DepartmentId.HasValue && departments.Contains(x.DepartmentId.Value))
                || (x.MakerIssuer == actor.Issuer && x.MakerSubject == actor.Subject &&
                    (ownCompany || x.DepartmentId.HasValue && ownDepartments.Contains(x.DepartmentId.Value))));
        }
        if (isQuote is { } quotes) query = query.Where(x => x.IsQuote == quotes);
        return await query.Include(x => x.Lines).OrderByDescending(x => x.CreatedAtUtc).ThenByDescending(x => x.Id)
            .Skip(page.Offset).Take(page.Size + 1).ToArrayAsync(ct);
    }

    public Task<SalesOrder?> GetAsync(ResourceScope scope, Guid id, CancellationToken ct) =>
        Scoped(scope).AsNoTracking().Include(x => x.Lines).SingleOrDefaultAsync(x => x.Id == id, ct);

    public Task<SalesOrder?> FindConvertedAsync(ResourceScope scope, Guid quoteId, CancellationToken ct) =>
        Scoped(scope).AsNoTracking().SingleOrDefaultAsync(x => x.QuoteId == quoteId, ct);

    public async Task<SalesOrder?> LockAsync(ResourceScope scope, Guid id, CancellationToken ct)
    {
        RequireTransaction();
        var order = await db.Orders.FromSqlInterpolated($"""
            SELECT * FROM sales.orders
            WHERE "TenantId" = {scope.TenantId} AND "WorkspaceId" = {scope.WorkspaceId} AND "Id" = {id}
            FOR UPDATE
            """).SingleOrDefaultAsync(ct);
        if (order is not null) await db.Entry(order).Collection(x => x.Lines).LoadAsync(ct);
        return order;
    }

    public async Task LockOperationAsync(SalesAccess current, Guid operationId, CancellationToken ct)
    {
        RequireTransaction();
        var key = $"sales:{current.Scope.TenantId}:{current.Scope.WorkspaceId}:{current.Actor.Issuer}:{current.Actor.Subject}:{operationId}";
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({key}, 0))", ct);
    }

    public Task<SalesAudit?> FindOperationAsync(SalesAccess current, Guid operationId, CancellationToken ct) =>
        db.Audit.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == current.Scope.TenantId && x.WorkspaceId == current.Scope.WorkspaceId
            && x.Issuer == current.Actor.Issuer && x.Subject == current.Actor.Subject && x.OperationId == operationId, ct);

    public void Add(SalesOrder order) => db.Orders.Add(order);
    public void Add(SalesAudit audit) => db.Audit.Add(audit);

    private void RequireTransaction()
    {
        if (db.Database.CurrentTransaction is null) throw new InvalidOperationException("Sales mutations require a transaction.");
    }
}
