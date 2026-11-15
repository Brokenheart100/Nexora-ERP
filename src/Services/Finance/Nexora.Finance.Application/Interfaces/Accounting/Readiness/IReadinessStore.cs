using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public interface IReadinessStore
{
    Task<int> PostedDocumentsWithoutJournalAsync(ResourceScope scope, CancellationToken ct);
    Task<ReadinessDocument[]> MissingDocumentsAsync(ResourceScope scope, int limit, CancellationToken ct);
    Task<int> PendingCostsAsync(ResourceScope scope, CancellationToken ct);
    Task<PendingCost[]> PendingCostListAsync(ResourceScope scope, int limit, CancellationToken ct);
    Task<ReceiptAccrual[]> PendingAccrualsAsync(ResourceScope scope, CancellationToken ct);
}
