using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public interface IFiscalYearStore
{
    Task<FiscalYearClose?> FindAsync(ResourceScope scope, Guid id, CancellationToken ct);
    Task<FiscalYearClose[]> ListAsync(ResourceScope scope, CancellationToken ct);
    Task<DateOnly?> LatestClosedAsync(ResourceScope scope, CancellationToken ct);
    Task<bool> IsClosedAsync(ResourceScope scope, DateOnly month, CancellationToken ct);
    Task<int> PendingDocumentsAsync(ResourceScope scope, DateOnly from, DateOnly through, CancellationToken ct);
    void Add(FiscalYearClose row);
}
