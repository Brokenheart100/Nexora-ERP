using Nexora.BuildingBlocks.Application;

namespace Nexora.Organization.Application;

public interface IWarehouseScopeDirectory
{
    Task DemandWarehouseAsync(ResourceScope scope, Guid id, CancellationToken ct);
}
