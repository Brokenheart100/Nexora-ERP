using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public interface IReportExportStore
{
    Task<ReportExport?> FindAsync(ResourceScope scope, Guid id, CancellationToken ct);
    Task<ReportExportView[]> ListAsync(ResourceScope scope, JournalActor requester, CancellationToken ct);
    Task<int> CountPendingAsync(ResourceScope scope, JournalActor requester, CancellationToken ct);
    Task PruneAsync(ResourceScope scope, JournalActor requester, int keep, CancellationToken ct);
    void Add(ReportExport export);
}
