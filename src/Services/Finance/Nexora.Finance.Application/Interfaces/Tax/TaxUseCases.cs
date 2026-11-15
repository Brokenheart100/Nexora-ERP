using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public interface ITaxStore
{
    Task<TaxRate[]> RatesAsync(ResourceScope scope, CancellationToken ct);
    Task<TaxGroup[]> GroupsAsync(ResourceScope scope, CancellationToken ct);
    Task<TaxClassification[]> ClassificationsAsync(ResourceScope scope, Guid? itemId, Guid? partnerId, CancellationToken ct);
    Task<TaxAssessment?> FindAsync(ResourceScope scope, Guid id, CancellationToken ct);
    void Add(TaxRate rate);
    void Add(TaxGroup group);
    void Add(TaxClassification classification);
    void Add(TaxAssessment assessment);
}

public interface ITaxReferenceAuthority
{
    Task<long> DemandActiveAsync(Guid workspaceId, string kind, Guid id, CancellationToken ct);
}
