using Nexora.BuildingBlocks.Application;
using Nexora.MasterData.Domain;

namespace Nexora.MasterData.Application;

public sealed class PartnerQueries(ICatalogAccess access, IPartnerReader reader)
{
    public async Task<PartnerList> ListAsync(Guid workspaceId, PageWindow page, CancellationToken cancellationToken, string? role = null)
    {
        var current = await access.DemandAsync(workspaceId, PartnerPermissions.Read, cancellationToken);
        var filter = role switch
        {
            null => (PartnerRoles?)null, "customer" => PartnerRoles.Customer, "supplier" => PartnerRoles.Supplier,
            "donor" => PartnerRoles.Donor, _ => throw new CatalogRuleException("Invalid partner role.")
        };
        var (items, hasMore) = await reader.ListAsync(current.Scope, page, cancellationToken, filter);
        return new(items, hasMore, current.Allows(PartnerPermissions.Manage));
    }

    public async Task<PartnerDetail> DetailAsync(Guid workspaceId, Guid partnerId, CancellationToken cancellationToken)
    {
        var current = await access.DemandAsync(workspaceId, PartnerPermissions.Read, cancellationToken);
        return await reader.DetailAsync(current.Scope, partnerId, cancellationToken) ?? throw new ResourceNotFoundException();
    }

    public async Task<PartnerReference> ReferenceAsync(Guid workspaceId, Guid partnerId, string? role, CancellationToken cancellationToken)
    {
        var current = await access.DemandAsync(workspaceId, PartnerPermissions.Read, cancellationToken);
        if (role is null || !PartnerRoleCodes.IsKnown(role)) throw new CatalogRuleException("Invalid partner role.");
        var partner = await reader.SummaryAsync(current.Scope, partnerId, cancellationToken) ?? throw new ResourceNotFoundException();
        if (!partner.IsActive || !partner.Roles.Contains(role))
            throw new BusinessConflictException("The partner is inactive or does not have the required role.");
        return new(partner.Id, partner.Code, partner.Name, role, partner.Version);
    }
}
