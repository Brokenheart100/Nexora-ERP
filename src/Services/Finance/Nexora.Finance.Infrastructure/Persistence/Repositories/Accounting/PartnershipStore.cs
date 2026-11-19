using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

public sealed class PartnershipStore(FinanceDbContext db) : IPartnershipStore
{
    public Task<PartnershipYear?> FindAsync(ResourceScope scope, int year, CancellationToken ct) =>
        db.Set<PartnershipYear>().SingleOrDefaultAsync(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId
            && x.Year == year, ct);

    public void Add(PartnershipYear year) => db.Add(year);
}
