using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed class DonationReceipts(TradeAccess access, ITradeStore trade)
{
    public async Task<DonationReceipt> ReadAsync(Guid workspaceId, Guid id, CancellationToken ct)
    {
        var (current, book) = await access.ReadAsync(workspaceId, ct);
        var donation = await trade.DocumentAsync(current.Scope, id, ct);
        if (donation is not { State: TradeState.Posted, Terms.Kind: TradeKind.Donation, JournalId: Guid journalId })
            throw new ResourceNotFoundException();
        return new($"DON-{donation.Id:N}", donation.Number, donation.Terms.On, book.BaseCurrency, book.MinorUnits,
            donation.Total, donation.Terms.Method!, donation.Terms.DonationIdentity?.DonorName ?? donation.Terms.PartnerId!.Value.ToString(),
            donation.Terms.DonationIdentity?.RecipientName, journalId, donation.ReversedById);
    }
}
