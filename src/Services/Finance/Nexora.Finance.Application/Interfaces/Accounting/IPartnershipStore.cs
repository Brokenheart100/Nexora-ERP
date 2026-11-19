using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public interface IPartnershipStore
{
    Task<PartnershipYear?> FindAsync(ResourceScope scope, int year, CancellationToken ct);
    void Add(PartnershipYear year);
}
