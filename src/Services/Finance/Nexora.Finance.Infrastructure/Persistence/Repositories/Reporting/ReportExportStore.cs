using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

public sealed class ReportExportStore(FinanceDbContext db) : IReportExportStore
{
    private IQueryable<ReportExport> Scoped(ResourceScope scope) => db.Set<ReportExport>()
        .Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId);

    public Task<ReportExport?> FindAsync(ResourceScope scope, Guid id, CancellationToken ct) =>
        Scoped(scope).SingleOrDefaultAsync(x => x.Id == id, ct);

    public Task<ReportExportView[]> ListAsync(ResourceScope scope, JournalActor requester, CancellationToken ct) =>
        Scoped(scope).AsNoTracking().Where(x => x.Issuer == requester.Issuer && x.Subject == requester.Subject)
            .OrderByDescending(x => x.RequestedAtUtc).ThenByDescending(x => x.Id).Take(50)
            .Select(x => new ReportExportView(x.Id, x.Kind, x.Watermark, x.RequestedAtUtc, x.CompletedAtUtc)).ToArrayAsync(ct);

    public Task<int> CountPendingAsync(ResourceScope scope, JournalActor requester, CancellationToken ct) =>
        Scoped(scope).CountAsync(x => x.Issuer == requester.Issuer && x.Subject == requester.Subject && x.CompletedAtUtc == null, ct);

    public async Task PruneAsync(ResourceScope scope, JournalActor requester, int keep, CancellationToken ct)
    {
        var stale = await Scoped(scope).Where(x => x.Issuer == requester.Issuer && x.Subject == requester.Subject)
            .OrderByDescending(x => x.RequestedAtUtc).ThenByDescending(x => x.Id).Skip(keep)
            .Select(x => x.Id).ToArrayAsync(ct);
        if (stale.Length == 0) return;
        await db.Set<ReportExport>().Where(x => stale.Contains(x.Id)).ExecuteDeleteAsync(ct);
    }

    public void Add(ReportExport export) => db.Add(export);
}
