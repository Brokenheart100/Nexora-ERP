using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

public sealed class TaxStore(FinanceDbContext db) : ITaxStore
{
    public Task<TaxRate[]> RatesAsync(ResourceScope scope, CancellationToken ct) => db.Set<TaxRate>().AsNoTracking()
        .Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId)
        .OrderBy(x => x.Code).ThenBy(x => x.EffectiveOn).ToArrayAsync(ct);

    public Task<TaxGroup[]> GroupsAsync(ResourceScope scope, CancellationToken ct) => db.Set<TaxGroup>().AsNoTracking()
        .Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId)
        .GroupBy(x => x.Code).Select(x => x.OrderByDescending(y => y.Version).First()).ToArrayAsync(ct);

    public Task<TaxClassification[]> ClassificationsAsync(ResourceScope scope, Guid? itemId, Guid? partnerId, CancellationToken ct) =>
        db.Set<TaxClassification>().AsNoTracking()
            .Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId
                && ((itemId == null && partnerId == null) || (x.Kind == "item" && x.ResourceId == itemId)
                    || (x.Kind == "partner" && x.ResourceId == partnerId)))
            .GroupBy(x => new { x.Kind, x.ResourceId }).Select(x => x.OrderByDescending(y => y.Version).First()).ToArrayAsync(ct);

    public Task<TaxAssessment?> FindAsync(ResourceScope scope, Guid id, CancellationToken ct) => db.Set<TaxAssessment>().AsNoTracking()
        .SingleOrDefaultAsync(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId && x.Id == id, ct);

    public void Add(TaxRate rate) => db.Add(rate);
    public void Add(TaxGroup group) => db.Add(group);
    public void Add(TaxClassification classification) => db.Add(classification);
    public void Add(TaxAssessment assessment) => db.Add(assessment);
}
