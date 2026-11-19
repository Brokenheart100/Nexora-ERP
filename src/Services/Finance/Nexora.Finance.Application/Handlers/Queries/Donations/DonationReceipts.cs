using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed class DonationReceipts(TradeAccess access, ITradeStore trade)
{
    public async Task<DonationReceipt> ReadAsync(Guid workspaceId, Guid id, CancellationToken ct)
    {
        var (current, book) = await access.ReadAsync(workspaceId, ct);
        return View(await FindAsync(current.Scope, id, ct), book);
    }

    internal async Task<TradeDocument> FindAsync(ResourceScope scope, Guid id, CancellationToken ct) =>
        await trade.DocumentAsync(scope, id, ct) is { State: TradeState.Posted, Terms.Kind: TradeKind.Donation, JournalId: not null } donation
            ? donation : throw new ResourceNotFoundException();

    internal static DonationReceipt View(TradeDocument donation, AccountingBook book) =>
        new($"DON-{donation.Id:N}", donation.Number, donation.Terms.On, book.BaseCurrency, book.MinorUnits,
            donation.Total, donation.Terms.Method!, donation.Terms.DonationIdentity?.DonorName ?? donation.Terms.PartnerId!.Value.ToString(),
            donation.Terms.DonationIdentity?.RecipientName, donation.JournalId!.Value, donation.ReversedById);
}
