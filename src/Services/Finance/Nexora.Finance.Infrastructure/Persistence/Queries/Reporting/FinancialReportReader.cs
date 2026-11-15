using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

public sealed class FinancialReportReader(FinanceDbContext db) : IFinancialReportReader
{
    public Task<StatementAccount[]> TotalsAsync(ResourceScope scope, StatementPeriod period, long watermark, CancellationToken ct, bool excludeClosing = false) =>
        (from entry in Entries(scope, period.Through, watermark, excludeClosing)
         group entry by new { entry.Account.Id, entry.Account.Code, entry.Account.Name, entry.Account.Category } into totals
         select new StatementAccount(totals.Key.Id, totals.Key.Code, totals.Key.Name, totals.Key.Category,
             totals.Sum(x => x.Journal.On < period.From ? x.Line.Debit - x.Line.Credit : 0),
             totals.Sum(x => x.Journal.On >= period.From ? x.Line.Debit : 0),
             totals.Sum(x => x.Journal.On >= period.From ? x.Line.Credit : 0)))
        .ToArrayAsync(ct);

    public Task<ReportPosting[]> PostingsAsync(ResourceScope scope, StatementPeriod period, long watermark,
        Guid? accountId, int page, CancellationToken ct, bool excludeClosing = false)
    {
        var entries = Entries(scope, period.Through, watermark, excludeClosing).Where(x => x.Journal.On >= period.From);
        entries = accountId is Guid id ? entries.Where(x => x.Account.Id == id)
            : entries.Where(x => x.Account.Category == AccountCategory.Income || x.Account.Category == AccountCategory.Expense);
        return entries.OrderByDescending(x => x.Journal.On).ThenByDescending(x => x.Journal.PostingNumber)
            .ThenBy(x => x.Line.Ordinal).Skip((page - 1) * 50).Take(51)
            .Select(x => new ReportPosting(x.Journal.Id, x.Journal.PostingNumber!.Value, x.Journal.On, x.Journal.SourceNumber,
                x.Journal.Memo, x.Account.Id, x.Line.Code, x.Line.Name, x.Line.Debit, x.Line.Credit)).ToArrayAsync(ct);
    }

    private IQueryable<Entry> Entries(ResourceScope scope, DateOnly through, long watermark, bool excludeClosing) =>
        from journal in db.Set<Journal>().AsNoTracking()
        where journal.TenantId == scope.TenantId && journal.WorkspaceId == scope.WorkspaceId
            && journal.State == JournalState.Posted && journal.PostingNumber <= watermark && journal.On <= through
            && (!excludeClosing || journal.Kind != JournalKind.FiscalClosing)
        from line in journal.Lines
        join account in db.Accounts.AsNoTracking() on new { line.TenantId, line.WorkspaceId, Id = line.AccountId }
            equals new { account.TenantId, account.WorkspaceId, account.Id }
        select new Entry { Journal = journal, Line = line, Account = account };

    private sealed class Entry
    {
        public required Journal Journal { get; init; }
        public required JournalLine Line { get; init; }
        public required ChartAccount Account { get; init; }
    }
}
