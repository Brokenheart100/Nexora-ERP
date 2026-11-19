using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

public sealed class OpeningSubledgerStore(FinanceDbContext db) : IOpeningSubledgerStore
{
    private IQueryable<OpeningSubledgerBatch> Scoped(ResourceScope scope) => db.Set<OpeningSubledgerBatch>()
        .Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId);

    public Task<OpeningSubledgerBatch?> FindAsync(ResourceScope scope, Guid id, CancellationToken ct) =>
        Scoped(scope).SingleOrDefaultAsync(x => x.Id == id, ct);

    public Task<OpeningSubledgerBatch?> LatestAsync(ResourceScope scope, CancellationToken ct) =>
        Scoped(scope).AsNoTracking().OrderByDescending(x => x.Id).FirstOrDefaultAsync(ct);

    public Task<bool> HasActiveAsync(ResourceScope scope, CancellationToken ct) =>
        Scoped(scope).AnyAsync(x => x.State == OpeningSubledgerState.Submitted || x.State == OpeningSubledgerState.ApplyingStock
            || x.State == OpeningSubledgerState.Posted, ct);

    public void Add(OpeningSubledgerBatch batch) => db.Add(batch);
}
