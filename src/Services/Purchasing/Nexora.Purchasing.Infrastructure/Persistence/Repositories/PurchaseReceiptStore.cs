using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Purchasing.Application;
using Nexora.Purchasing.Domain;

namespace Nexora.Purchasing.Infrastructure;

public sealed class PurchaseReceiptStore(PurchasingDbContext db) : IPurchaseReceipts
{
    public Task<ReceiptPermit[]> ListAsync(ResourceScope scope, Guid orderId, CancellationToken ct, PageWindow? page = null)
    {
        IQueryable<ReceiptPermit> query = db.Set<ReceiptPermit>().Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId && x.OrderId == orderId)
            .OrderBy(x => x.Id);
        if (page is { } window) query = query.Skip(window.Offset).Take(window.Size);
        return query.ToArrayAsync(ct);
    }

    public void Add(ReceiptPermit permit)
    {
        db.Add(permit);
        db.Add(new ReceiptProcess(permit.Id, permit.WorkspaceId, permit.TenantId, permit.OrderId));
    }
}
