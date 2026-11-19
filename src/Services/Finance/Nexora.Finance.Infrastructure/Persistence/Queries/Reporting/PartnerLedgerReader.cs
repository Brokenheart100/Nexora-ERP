using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

public sealed class PartnerLedgerReader(FinanceDbContext db) : IPartnerLedgerReader
{
    private IQueryable<T> Scoped<T>(ResourceScope scope) where T : class => db.Set<T>().AsNoTracking()
        .Where(x => EF.Property<Guid>(x, "TenantId") == scope.TenantId && EF.Property<Guid>(x, "WorkspaceId") == scope.WorkspaceId);

    public Task<PartnerPosting[]> ReadAsync(ResourceScope scope, Guid partnerId, bool customers, DateOnly through, long watermark,
        CancellationToken ct)
    {
        var journals = Scoped<Journal>(scope)
            .Where(x => x.State == JournalState.Posted && x.PostingNumber <= watermark && x.On <= through);
        return customers ? CustomersAsync(scope, partnerId, journals, ct) : SuppliersAsync(scope, partnerId, journals, ct);
    }

    private async Task<PartnerPosting[]> CustomersAsync(ResourceScope scope, Guid partnerId, IQueryable<Journal> journals, CancellationToken ct)
    {
        var setup = await Scoped<ReceivableSetup>(scope).SingleOrDefaultAsync(ct);
        if (setup is null) return [];
        var receivable = setup.Accounts.ReceivableAccountId;
        var advance = setup.Accounts.AdvanceAccountId;
        var rows = await (from doc in Scoped<CustomerDocument>(scope)
                          join journal in journals on doc.JournalId equals (Guid?)journal.Id
                          select new
                          {
                              doc.Id, doc.Terms,
                              Source = new PostedSource(journal.Id, journal.PostingNumber!.Value, journal.On,
                                  journal.SourceNumber, journal.Memo, journal.Kind, journal.CashActivity),
                              Open = journal.Lines.Where(x => x.AccountId == receivable).Sum(x => x.Debit - x.Credit),
                              Funds = journal.Lines.Where(x => x.AccountId == advance).Sum(x => x.Credit - x.Debit)
                          }).ToArrayAsync(ct);
        return rows.Where(x => x.Terms.CustomerId == partnerId)
            .Select(x => new PartnerPosting(x.Id, x.Terms.Kind.ToString().ToLowerInvariant(), x.Source,
                x.Terms.InvoiceId ?? x.Terms.FundsId, x.Open, x.Funds)).ToArray();
    }

    private async Task<PartnerPosting[]> SuppliersAsync(ResourceScope scope, Guid partnerId, IQueryable<Journal> journals, CancellationToken ct)
    {
        var setup = await Scoped<TradeSetup>(scope).SingleOrDefaultAsync(ct);
        if (setup is null) return [];
        var payable = setup.PayableAccountId;
        var recovery = setup.SupplierRecoveryAccountId;
        var rows = await (from doc in Scoped<TradeDocument>(scope)
                          join journal in journals on doc.JournalId equals (Guid?)journal.Id
                          where journal.Lines.Any(x => x.AccountId == payable || x.AccountId == recovery)
                          select new
                          {
                              doc.Id, doc.Terms,
                              Source = new PostedSource(journal.Id, journal.PostingNumber!.Value, journal.On,
                                  journal.SourceNumber, journal.Memo, journal.Kind, journal.CashActivity),
                              Open = journal.Lines.Where(x => x.AccountId == payable).Sum(x => x.Credit - x.Debit),
                              Funds = journal.Lines.Where(x => x.AccountId == recovery).Sum(x => x.Debit - x.Credit)
                          }).ToArrayAsync(ct);
        var terms = rows.ToDictionary(x => x.Id, x => x.Terms);
        return rows.Where(x => Supplier(x.Terms, terms) == partnerId)
            .Select(x => new PartnerPosting(x.Id, x.Terms.Kind.ToString().ToLowerInvariant(), x.Source,
                x.Terms.SourceId, x.Open, x.Funds)).ToArray();
    }

    private static Guid? Supplier(TradeTerms terms, Dictionary<Guid, TradeTerms> documents)
    {
        // Settlement and reversal facts inherit the party from the originating bill.
        for (var links = 0; links < 4; links++)
        {
            if (terms.Kind == TradeKind.Bill) return terms.PartnerId;
            if (terms.SourceId is not Guid source || !documents.TryGetValue(source, out var original)) return null;
            terms = original;
        }
        return null;
    }
}
