using Nexora.BuildingBlocks.Application;
using Nexora.MasterData.Domain;

namespace Nexora.MasterData.Application;

public interface IPartnerRepository
{
    Task<BusinessPartner?> FindAsync(ResourceScope scope, Guid partnerId, CancellationToken cancellationToken);
    void Add(BusinessPartner partner);
}

public interface IPartnerReader
{
    Task<(IReadOnlyList<PartnerSummary> Items, bool HasMore)> ListAsync(ResourceScope scope, PageWindow page,
        CancellationToken cancellationToken, PartnerRoles? role = null);
    Task<PartnerDetail?> DetailAsync(ResourceScope scope, Guid partnerId, CancellationToken cancellationToken);
    Task<PartnerSummary?> SummaryAsync(ResourceScope scope, Guid partnerId, CancellationToken cancellationToken);
}
