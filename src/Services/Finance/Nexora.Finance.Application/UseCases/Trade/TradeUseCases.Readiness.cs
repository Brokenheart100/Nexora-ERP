using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed partial class TradeUseCases
{
    public async Task<CostBackfill> BackfillCostsAsync(ResourceScope scope, AccountingBook book,
        IReadOnlyList<ReceiptAccrual> receipts, CancellationToken ct)
    {
        var posted = new List<BackfilledCost>();
        var blocked = new List<BlockedCost>();
        foreach (var receipt in receipts.Where(x => !x.Posted).OrderBy(x => x.Fact.On).ThenBy(x => x.Fact.Sequence))
        {
            try
            {
                await AccrueAsync(scope, book, receipt, false, ct);
            }
            catch (LedgerRuleException rule)
            {
                receipt.WaitFor(rule.Message);
            }
            if (receipt.Posted)
                posted.Add(new BackfilledCost(receipt.Id, receipt.Fact.On, receipt.Fact.Cost, receipt.JournalId));
            else
                blocked.Add(new BlockedCost(receipt.Id, receipt.Fact.On, receipt.Fact.Cost,
                    receipt.PendingReason ?? "The cost fact was not posted."));
        }
        return new CostBackfill(posted.ToArray(), blocked.ToArray());
    }
}
