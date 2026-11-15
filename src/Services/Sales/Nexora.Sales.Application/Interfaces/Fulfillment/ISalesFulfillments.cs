using Nexora.BuildingBlocks.Application;
using Nexora.Sales.Domain;

namespace Nexora.Sales.Application;

public interface ISalesFulfillments
{
    Task<FulfillmentPermit[]> ListAsync(ResourceScope scope, Guid orderId, CancellationToken ct, PageWindow? page = null);
    void Add(FulfillmentPermit permit);
}
