namespace Nexora.Finance.Application;

public interface ITradePartnerAuthority
{
    Task<DonorReference> DemandDonorAsync(Guid workspaceId, Guid id, CancellationToken ct);
}
