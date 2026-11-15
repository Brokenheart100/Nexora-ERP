using Nexora.BuildingBlocks.Application;
using Nexora.Purchasing.Domain;

namespace Nexora.Purchasing.Application;

public interface IPurchaseOrders
{
    Task<IReadOnlyList<PurchaseOrder>> PageAsync(PurchaseAccess access, PageWindow page, CancellationToken ct);
    Task<PurchaseOrder?> GetAsync(ResourceScope scope, Guid id, CancellationToken ct);
    Task<PurchaseOrder?> LockAsync(ResourceScope scope, Guid id, CancellationToken ct);
    Task LockOperationAsync(PurchaseAccess current, Guid operationId, CancellationToken ct);
    Task<PurchaseAudit?> FindOperationAsync(PurchaseAccess current, Guid operationId, CancellationToken ct);
    void Add(PurchaseOrder order);
    void Add(PurchaseAudit audit);
}
