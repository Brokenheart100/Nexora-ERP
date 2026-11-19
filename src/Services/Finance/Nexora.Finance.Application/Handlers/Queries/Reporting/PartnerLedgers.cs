using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed class PartnerLedgers(TradeAccess access, IPartnerLedgerReader reader)
{
    public async Task<PartnerLedger> ReadAsync(Guid workspaceId, string kind, Guid partnerId, DateOnly from, DateOnly through,
        long? watermark, PageWindow window, CancellationToken ct)
    {
        var customers = kind switch
        {
            "receivables" => true,
            "payables" => false,
            _ => throw new ResourceNotFoundException()
        };
        var (current, book) = await access.ReadAsync(workspaceId, ct);
        if (partnerId == Guid.Empty || from < book.StartsOn || from > through)
            throw new ArgumentException("Invalid partner or ledger dates.");
        var at = OpenItemReports.Watermark(book, through, watermark);
        var facts = await reader.ReadAsync(current.Scope, partnerId, customers, through, at, ct);
        var opening = facts.Where(x => x.Source.On < from).ToArray();
        var period = facts.Where(x => x.Source.On >= from).OrderBy(x => x.Source.On).ThenBy(x => x.Source.Number).ToArray();
        var open = Balance(opening, period, x => x.OpenDelta);
        var funds = Balance(opening, period, x => x.FundsDelta);
        var previous = period.Take(window.Offset);
        var openBalance = open.Opening + previous.Sum(x => x.OpenDelta);
        var fundsBalance = funds.Opening + previous.Sum(x => x.FundsDelta);
        var rows = period.Skip(window.Offset).Take(window.Size)
            .Select(x => new PartnerLedgerEntry(x.DocumentId, x.Kind, x.Source.SourceNumber, x.Source.On,
            x.Source.JournalId, x.Source.Number, x.RelatedDocumentId, x.OpenDelta, openBalance += x.OpenDelta,
            x.FundsDelta, fundsBalance += x.FundsDelta)).ToArray();
        return new(kind, partnerId, book.BaseCurrency, book.MinorUnits, from, through, at, open, funds, rows,
            period.Length > window.Offset + window.Size);
    }

    private static PartnerLedgerBalance Balance(PartnerPosting[] opening, PartnerPosting[] period, Func<PartnerPosting, decimal> amount)
    {
        var start = opening.Sum(amount);
        var changes = period.Select(amount).ToArray();
        var increases = changes.Where(x => x > 0).Sum();
        var decreases = -changes.Where(x => x < 0).Sum();
        return new(start, increases, decreases, start + increases - decreases);
    }
}
