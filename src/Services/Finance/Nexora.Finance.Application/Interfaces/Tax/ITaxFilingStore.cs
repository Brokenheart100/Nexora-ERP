using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public interface ITaxFilingStore
{
    Task<bool> HasFilingsAsync(ResourceScope scope, CancellationToken ct);
    Task<TaxFilingEntry[]> HistoryAsync(ResourceScope scope, TaxPeriod period, CancellationToken ct);
    Task<TaxFiling?> LatestAsync(ResourceScope scope, TaxPeriod period, CancellationToken ct);
    Task<TaxFiling?> FindAsync(ResourceScope scope, Guid id, CancellationToken ct);
    Task<TaxPosting[]> SourcesAsync(ResourceScope scope, TaxPeriod period, long watermark, int minorUnits, CancellationToken ct);
    void Add(TaxFiling filing);
}
