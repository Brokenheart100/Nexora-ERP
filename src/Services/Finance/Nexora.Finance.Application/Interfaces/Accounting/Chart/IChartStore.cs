using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public interface IChartStore
{
    Task<ChartState?> ReadAsync(ResourceScope scope, CancellationToken cancellationToken);
    Task<AccountingBook?> LockBookAsync(ResourceScope scope, CancellationToken cancellationToken);
    Task<IReadOnlyList<ChartAccount>> ListAsync(ResourceScope scope, bool tracking, CancellationToken cancellationToken);
    Task<ChartImportPreview?> FindPreviewAsync(BookAccess access, Guid id, CancellationToken cancellationToken);
    Task<FinanceAudit?> FindAuditAsync(BookAccess access, Guid operationId, CancellationToken cancellationToken);
    void Add(ChartAccount account);
    void Add(ChartImportPreview preview);
    void Add(FinanceAudit audit);
}
