using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

public sealed class TaxFilingStore(FinanceDbContext db) : ITaxFilingStore
{
    public Task<bool> HasFilingsAsync(ResourceScope scope, CancellationToken ct) => Scoped(scope).AnyAsync(ct);

    public Task<TaxFilingEntry[]> HistoryAsync(ResourceScope scope, TaxPeriod period, CancellationToken ct) =>
        ForPeriod(scope, period).Select(x => new TaxFilingEntry(x.Id, x.From, x.Through, x.Version, x.CorrectsId,
            x.Reference, x.Reason, x.RecordedAtUtc, x.LockBooks, x.Fingerprint)).ToArrayAsync(ct);

    public Task<TaxFiling?> LatestAsync(ResourceScope scope, TaxPeriod period, CancellationToken ct) =>
        ForPeriod(scope, period).FirstOrDefaultAsync(ct);

    public Task<TaxFiling?> FindAsync(ResourceScope scope, Guid id, CancellationToken ct) =>
        Scoped(scope).SingleOrDefaultAsync(x => x.Id == id, ct);

    public Task<TaxPosting[]> SourcesAsync(ResourceScope scope, TaxPeriod period, long watermark, int minorUnits, CancellationToken ct) =>
        new TaxFilingSources(db).ReadAsync(scope, period, watermark, minorUnits, ct);

    public void Add(TaxFiling filing) => db.Add(filing);

    private IQueryable<TaxFiling> Scoped(ResourceScope scope) => db.Set<TaxFiling>().AsNoTracking()
        .Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId);

    private IQueryable<TaxFiling> ForPeriod(ResourceScope scope, TaxPeriod period) =>
        Scoped(scope).Where(x => x.From == period.From && x.Through == period.Through).OrderByDescending(x => x.Version);
}
