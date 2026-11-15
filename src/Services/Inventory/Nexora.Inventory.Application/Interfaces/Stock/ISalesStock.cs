using Nexora.BuildingBlocks.Application;
using Nexora.Inventory.Domain;

namespace Nexora.Inventory.Application;

public interface ISalesStock
{
    Task<SalesReservation?> FindAsync(ResourceScope scope, Guid permitId, CancellationToken ct);
    Task<SalesReservation[]> ListAsync(ResourceScope scope, Guid warehouseId, CancellationToken ct);
    Task<(decimal Quantity, decimal Cost)> ReturnedAsync(ResourceScope scope, Guid originalId, CancellationToken ct);
    void Add(SalesReservation reservation);
}
