using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public interface IOpeningSubledgerStore
{
    Task<OpeningSubledgerBatch?> FindAsync(ResourceScope scope, Guid id, CancellationToken ct);
    Task<OpeningSubledgerBatch?> LatestAsync(ResourceScope scope, CancellationToken ct);
    Task<bool> HasActiveAsync(ResourceScope scope, CancellationToken ct);
    void Add(OpeningSubledgerBatch batch);
}

public interface IOpeningReferences
{
    Task DemandWarehouseManagementAsync(Guid workspaceId, CancellationToken ct);
    Task DemandWarehouseAsync(Guid workspaceId, Guid id, CancellationToken ct);
    Task<(Guid UnitId, string Name)> ItemAsync(Guid workspaceId, Guid id, CancellationToken ct);
    Task<string> PartnerAsync(Guid workspaceId, Guid id, string role, CancellationToken ct);
}
