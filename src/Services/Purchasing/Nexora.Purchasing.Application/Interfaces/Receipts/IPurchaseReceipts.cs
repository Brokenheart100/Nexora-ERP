using Nexora.BuildingBlocks.Application;
using Nexora.Purchasing.Domain;

namespace Nexora.Purchasing.Application;

public interface IPurchaseReceipts
{
    Task<ReceiptPermit[]> ListAsync(ResourceScope scope, Guid orderId, CancellationToken ct, PageWindow? page = null);
    void Add(ReceiptPermit permit);
}
