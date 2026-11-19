namespace Nexora.Finance.Application;

public interface ITradePartnerAuthority
{
    Task<DonorReference> DemandDonorAsync(Guid workspaceId, Guid id, CancellationToken ct);
    Task<string[]> DonorEmailsAsync(Guid workspaceId, Guid id, CancellationToken ct);
}
