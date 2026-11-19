using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public interface IPartnerLedgerReader
{
    Task<PartnerPosting[]> ReadAsync(ResourceScope scope, Guid partnerId, bool customers, DateOnly through, long watermark,
        CancellationToken ct);
}
