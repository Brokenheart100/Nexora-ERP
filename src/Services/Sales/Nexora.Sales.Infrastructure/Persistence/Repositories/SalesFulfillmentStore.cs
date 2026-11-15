using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Sales.Application;
using Nexora.Sales.Domain;

namespace Nexora.Sales.Infrastructure;

public sealed class SalesFulfillmentStore(SalesDbContext db) : ISalesFulfillments
{
    public Task<FulfillmentPermit[]> ListAsync(ResourceScope scope, Guid orderId, CancellationToken ct, PageWindow? page = null)
    {
        IQueryable<FulfillmentPermit> query = db.Set<FulfillmentPermit>().Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId && x.OrderId == orderId)
            .OrderBy(x => x.Id);
        if (page is { } window) query = query.Skip(window.Offset).Take(window.Size);
        return query.ToArrayAsync(ct);
    }

    public void Add(FulfillmentPermit permit)
    {
        db.Add(permit);
        db.Add(new FulfillmentProcess(permit.Id, permit.WorkspaceId, permit.TenantId, permit.OrderId));
    }
}
