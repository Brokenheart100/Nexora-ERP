using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public interface IDonationFiscalTickets
{
    Task<DonationFiscalTicket?> FindAsync(ResourceScope scope, Guid donationId, CancellationToken ct);
    Task<bool> NumberInUseAsync(ResourceScope scope, string code, string number, CancellationToken ct);
    void Add(DonationFiscalTicket ticket);
}
