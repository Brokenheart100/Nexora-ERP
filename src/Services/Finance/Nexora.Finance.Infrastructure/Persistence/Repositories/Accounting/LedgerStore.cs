using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

public sealed class LedgerStore(FinanceDbContext db) : ILedgerStore
{
    public Task<bool> ImportedSourceExistsAsync(ResourceScope scope, string provider, string externalId, CancellationToken ct) =>
        Journals(scope).AnyAsync(x => x.ImportProvider == provider && x.ExternalId == externalId, ct);
    private IQueryable<Journal> Journals(ResourceScope scope) => db.Set<Journal>()
        .Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId);
    private IQueryable<FiscalPeriod> Periods(ResourceScope scope) => db.Set<FiscalPeriod>()
        .Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId);

    public Task<FiscalPeriod?> PeriodAsync(ResourceScope scope, DateOnly month, CancellationToken ct) =>
        Periods(scope).SingleOrDefaultAsync(x => x.Month == month, ct);

    public Task<FiscalPeriod[]> PeriodsAsync(ResourceScope scope, CancellationToken ct) =>
        Periods(scope).AsNoTracking().OrderByDescending(x => x.Month).ToArrayAsync(ct);

    public Task<PeriodTransition[]> TransitionsAsync(ResourceScope scope, DateOnly month, CancellationToken ct) =>
        db.Set<PeriodTransition>().AsNoTracking().Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId
            && x.Month == month).OrderBy(x => x.Version).ToArrayAsync(ct);

    public Task<Journal?> FindAsync(ResourceScope scope, Guid id, bool tracking, CancellationToken ct)
    {
        var query = Journals(scope);
        return (tracking ? query : query.AsNoTracking()).Include(x => x.Lines).SingleOrDefaultAsync(x => x.Id == id, ct);
    }

    public Task<Journal?> SourceAsync(ResourceScope scope, string sourceKey, CancellationToken ct) =>
        Journals(scope).AsNoTracking().SingleOrDefaultAsync(x => x.SourceKey == sourceKey && x.State != JournalState.Cancelled, ct);

    public Task<ChartAccount[]> AccountsAsync(ResourceScope scope, Guid[] ids, CancellationToken ct) =>
        db.Accounts.Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId && ids.Contains(x.Id)).ToArrayAsync(ct);

    public Task<bool> HasPostingsAsync(ResourceScope scope, CancellationToken ct) =>
        Journals(scope).AnyAsync(x => x.State == JournalState.Posted, ct);

    public Task<bool> HasOrdinaryPostingsAsync(ResourceScope scope, CancellationToken ct) =>
        Journals(scope).AnyAsync(x => x.State == JournalState.Posted && x.Kind != JournalKind.Opening, ct);

    public Task<bool> HasApplyingOpeningSubledgersAsync(ResourceScope scope, CancellationToken ct) =>
        db.Set<OpeningSubledgerBatch>().AnyAsync(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId
            && x.State == OpeningSubledgerState.ApplyingStock, ct);

    public async Task<PeriodCheck> CheckAsync(ResourceScope scope, DateOnly month, CancellationToken ct)
    {
        var until = month.AddMonths(1);
        var check = await Journals(scope).Where(x => x.On >= month && x.On < until).GroupBy(_ => 1)
            .Select(x => new PeriodCheck(x.Max(y => y.PostingNumber) ?? 0, x.Count(y => y.State == JournalState.Posted),
                x.Count(y => y.State == JournalState.Draft || y.State == JournalState.Submitted),
                x.Where(y => y.State == JournalState.Posted).Sum(y => y.Lines.Sum(line => line.Debit)),
                x.Where(y => y.State == JournalState.Posted).Sum(y => y.Lines.Sum(line => line.Credit))))
            .SingleOrDefaultAsync(ct);
        return check ?? new(0, 0, 0, 0, 0);
    }

    public async Task<JournalSummary[]> ListAsync(ResourceScope scope, DateOnly? month, Guid? accountId, bool postedOnly, PageWindow page,
        int[]? monthKeys, CancellationToken ct)
    {
        var query = Journals(scope).AsNoTracking();
        if (postedOnly) query = query.Where(x => x.State == JournalState.Posted);
        if (monthKeys is not null) query = query.Where(x => monthKeys.Contains(x.On.Year * 100 + x.On.Month));
        if (month is DateOnly from)
        {
            var until = from.AddMonths(1);
            query = query.Where(x => x.On >= from && x.On < until);
        }
        if (accountId is Guid id) query = query.Where(x => x.Lines.Any(line => line.AccountId == id));
        var pageRows = await query.OrderByDescending(x => x.On).ThenByDescending(x => x.Id).Skip(page.Offset).Take(page.Size)
            .Select(x => new { x.Id, x.Kind, x.SourceNumber, x.On, x.Memo, x.State, x.Version, x.PostingNumber, x.ReversesId,
                x.ImportProvider, x.ExternalId })
            .ToArrayAsync(ct);
        return pageRows.Select(x => new JournalSummary(x.Id, x.Kind.ToString().ToLowerInvariant(), x.SourceNumber,
            x.On, x.Memo, x.State.ToString().ToLowerInvariant(), x.Version, x.PostingNumber, x.ReversesId,
            x.ImportProvider, x.ExternalId)).ToArray();
    }

    public Task<BalanceRow[]> BalancesAsync(ResourceScope scope, DateOnly through, CancellationToken ct) =>
        (from journal in Journals(scope).AsNoTracking()
         where journal.State == JournalState.Posted && journal.On <= through
         from line in journal.Lines
         join account in db.Accounts.AsNoTracking() on new { line.TenantId, line.WorkspaceId, Id = line.AccountId }
             equals new { account.TenantId, account.WorkspaceId, account.Id }
         group line by new { account.Id, account.Code, account.Name } into entries
         orderby entries.Key.Code
         select new BalanceRow(entries.Key.Id, entries.Key.Code, entries.Key.Name, entries.Sum(x => x.Debit), entries.Sum(x => x.Credit)))
        .ToArrayAsync(ct);

    private IQueryable<JournalLink> Links(ResourceScope scope) => db.Set<JournalLink>()
        .Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId);

    public Task<JournalLink?> FindLinkAsync(ResourceScope scope, Guid id, bool tracking, CancellationToken ct)
    {
        var query = Links(scope);
        return (tracking ? query : query.AsNoTracking()).SingleOrDefaultAsync(x => x.Id == id, ct);
    }

    public Task<JournalLinkView[]> LinksAsync(ResourceScope scope, Guid? journalId, int page, CancellationToken ct)
    {
        var links = Links(scope).AsNoTracking();
        if (journalId is Guid id) links = links.Where(x => x.FromJournalId == id || x.ToJournalId == id);
        var journals = Journals(scope).AsNoTracking();
        return (from link in links
                join source in journals on new { link.TenantId, link.WorkspaceId, Id = link.FromJournalId }
                    equals new { source.TenantId, source.WorkspaceId, source.Id }
                join target in journals on new { link.TenantId, link.WorkspaceId, Id = link.ToJournalId }
                    equals new { target.TenantId, target.WorkspaceId, target.Id }
                orderby link.CreatedAtUtc descending, link.Id descending
                select new JournalLinkView(link.Id, link.FromJournalId, source.SourceNumber, source.On, link.ToJournalId,
                    target.SourceNumber, target.On, link.Kind, link.Memo, link.CreatedByIssuer, link.CreatedBySubject,
                    link.CreatedAtUtc, link.Version))
            .Skip((page - 1) * 50).Take(50).ToArrayAsync(ct);
    }

    public Task<bool> LinkExistsAsync(ResourceScope scope, Guid fromJournalId, Guid toJournalId, string kind, CancellationToken ct) =>
        Links(scope).AnyAsync(x => x.FromJournalId == fromJournalId && x.ToJournalId == toJournalId && x.Kind == kind, ct);

    public Task<JournalLink[]> AllLinksAsync(ResourceScope scope, CancellationToken ct) =>
        Links(scope).AsNoTracking().OrderBy(x => x.CreatedAtUtc).ToArrayAsync(ct);

    public Task<JournalScanRow[]> JournalScanRowsAsync(ResourceScope scope, CancellationToken ct) =>
        Journals(scope).AsNoTracking()
            .Select(x => new JournalScanRow(x.Id, x.SourceNumber, x.On, x.State, x.ReversesId))
            .ToArrayAsync(ct);

    public void Add(Journal journal) => db.Add(journal);
    public void Add(JournalLink link) => db.Add(link);
    public void Remove(JournalLink link) => db.Remove(link);
    public void Add(FiscalPeriod period) => db.Add(period);
    public void Add(PeriodTransition transition) => db.Add(transition);
}
