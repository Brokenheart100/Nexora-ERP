using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

public sealed class FinanceHistoryReader(FinanceDbContext db) : IFinanceHistoryReader
{
    private IQueryable<T> Scoped<T>(ResourceScope scope) where T : class => db.Set<T>().AsNoTracking()
        .Where(x => EF.Property<Guid>(x, "TenantId") == scope.TenantId && EF.Property<Guid>(x, "WorkspaceId") == scope.WorkspaceId);

    public async Task<FinanceHistory> ReadAsync(ResourceScope scope, DateOnly through, long watermark, bool includeCash, CancellationToken ct)
    {
        var journals = Scoped<Journal>(scope).Where(x => x.State == JournalState.Posted && x.PostingNumber <= watermark && x.On <= through);
        var receivableId = (await Scoped<ReceivableSetup>(scope).SingleOrDefaultAsync(ct))?.Accounts.ReceivableAccountId;
        var customers = await (from doc in Scoped<CustomerDocument>(scope)
                               join journal in journals on doc.JournalId equals (Guid?)journal.Id
                               select new PostedCustomer(doc.Id, doc.Terms,
                                   new(journal.Id, journal.PostingNumber!.Value, journal.On, journal.SourceNumber, journal.Memo, journal.Kind, journal.CashActivity),
                                   journal.Lines.Where(x => x.AccountId == receivableId).Sum(x => x.Debit - x.Credit))).ToArrayAsync(ct);
        var taxAccountId = (await Scoped<TradeSetup>(scope).SingleOrDefaultAsync(ct))?.InputTaxAccountId;
        var trades = await (from doc in Scoped<TradeDocument>(scope)
                            join journal in journals on doc.JournalId equals (Guid?)journal.Id
                            select new PostedTrade(doc.Id, doc.Terms,
                                new(journal.Id, journal.PostingNumber!.Value, journal.On, journal.SourceNumber, journal.Memo, journal.Kind, journal.CashActivity),
                                doc.Total, doc.RecoveryTotal, journal.Lines.Where(x => x.AccountId == taxAccountId)
                                    .Sum(x => x.Credit - x.Debit))).ToArrayAsync(ct);
        if (!includeCash) return new([], customers, trades);

        var accounts = Scoped<ChartAccount>(scope);
        var cashAccounts = Scoped<BankAccount>(scope).Select(x => x.AccountId).Union(accounts.Where(x => x.Category == AccountCategory.Asset
            && x.Purpose == AccountPurpose.Posting && (x.Code == "1001" || x.Code == "1002")).Select(x => x.Id));
        var cash = await cashAccounts.ToArrayAsync(ct);
        var cashLines = await (from journal in journals
                               where journal.Lines.Any(x => cash.Contains(x.AccountId))
                               from line in journal.Lines
                               join account in accounts on line.AccountId equals account.Id
                               orderby journal.PostingNumber, line.Ordinal
                               select new CashJournalLine(new(journal.Id, journal.PostingNumber!.Value, journal.On, journal.SourceNumber,
                                   journal.Memo, journal.Kind, journal.CashActivity), account.Id, line.Code, line.Name, account.Category,
                                   line.Debit, line.Credit, cash.Contains(account.Id))).ToArrayAsync(ct);
        return new(cashLines, customers, trades);
    }
}
