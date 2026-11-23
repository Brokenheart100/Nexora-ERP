using Nexora.BuildingBlocks.Application;
using Nexora.Sales.Domain;

namespace Nexora.Sales.Application;

public interface ISalesOrders
{
    Task<IReadOnlyList<SalesOrder>> PageAsync(SalesAccess access, PageWindow page, CancellationToken ct, bool? isQuote = null);
    Task<SalesOrder?> GetAsync(ResourceScope scope, Guid id, CancellationToken ct);
    Task<SalesOrder?> FindConvertedAsync(ResourceScope scope, Guid quoteId, CancellationToken ct);
    Task<SalesOrder?> LockAsync(ResourceScope scope, Guid id, CancellationToken ct);
    Task LockOperationAsync(SalesAccess current, Guid operationId, CancellationToken ct);
    Task<SalesAudit?> FindOperationAsync(SalesAccess current, Guid operationId, CancellationToken ct);
    void Add(SalesOrder order);
    void Add(SalesAudit audit);
}
