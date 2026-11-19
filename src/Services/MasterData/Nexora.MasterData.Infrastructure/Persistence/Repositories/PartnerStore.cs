using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.MasterData.Application;
using Nexora.MasterData.Domain;

namespace Nexora.MasterData.Infrastructure;

public sealed class PartnerStore(CatalogDbContext db) : IPartnerRepository, IPartnerReader
{
    private static readonly Expression<Func<BusinessPartner, PartnerSummary>> ProjectSummary = partner =>
        new(partner.Id, partner.Code.Value, partner.Name, PartnerRoleCodes.List(partner.Roles), partner.IsActive, partner.Version);

    public Task<BusinessPartner?> FindAsync(ResourceScope scope, Guid partnerId, CancellationToken ct) =>
        Scoped(scope).Include(partner => partner.Contacts).SingleOrDefaultAsync(partner => partner.Id == partnerId, ct);

    public void Add(BusinessPartner partner) => db.Partners.Add(partner);

    public async Task<(IReadOnlyList<PartnerSummary> Items, bool HasMore)> ListAsync(ResourceScope scope, PageWindow page,
        CancellationToken ct, PartnerRoles? role = null)
    {
        var query = Scoped(scope).AsNoTracking();
        if (role is { } filter) query = query.Where(partner => (partner.Roles & filter) == filter);
        var items = await query.OrderBy(partner => partner.Code).ThenBy(partner => partner.Id)
            .Skip(page.Offset).Take(page.Size + 1).Select(ProjectSummary).ToListAsync(ct);
        return (items.Take(page.Size).ToArray(), items.Count > page.Size);
    }

    public async Task<PartnerDetail?> DetailAsync(ResourceScope scope, Guid partnerId, CancellationToken ct)
    {
        var partner = await Scoped(scope).AsNoTracking().Include(x => x.Contacts).SingleOrDefaultAsync(x => x.Id == partnerId, ct);
        if (partner is null) return null;
        var contacts = partner.Contacts.OrderBy(x => x.Name, StringComparer.Ordinal).ThenBy(x => x.Id)
            .Select(x => new PartnerContactInput(x.Id, x.Name, x.Email, x.Phone)).ToArray();
        return new(partner.Id, partner.Code.Value, partner.Name, PartnerRoleCodes.List(partner.Roles),
            partner.IsActive, partner.Version, partner.TaxNumber, partner.Address, contacts);
    }

    public Task<PartnerSummary?> SummaryAsync(ResourceScope scope, Guid partnerId, CancellationToken ct) =>
        Scoped(scope).AsNoTracking().Where(partner => partner.Id == partnerId).Select(ProjectSummary).SingleOrDefaultAsync(ct);

    private IQueryable<BusinessPartner> Scoped(ResourceScope scope) =>
        db.Partners.Where(partner => partner.TenantId == scope.TenantId && partner.WorkspaceId == scope.WorkspaceId);
}
