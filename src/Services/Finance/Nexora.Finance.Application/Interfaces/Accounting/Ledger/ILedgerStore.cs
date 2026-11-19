using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public interface ILedgerStore
{
    Task<bool> ImportedSourceExistsAsync(ResourceScope scope, string provider, string externalId, CancellationToken ct);
    Task<FiscalPeriod?> PeriodAsync(ResourceScope scope, DateOnly month, CancellationToken ct);
    Task<FiscalPeriod[]> PeriodsAsync(ResourceScope scope, CancellationToken ct);
    Task<PeriodTransition[]> TransitionsAsync(ResourceScope scope, DateOnly month, CancellationToken ct);
    Task<Journal?> FindAsync(ResourceScope scope, Guid id, bool tracking, CancellationToken ct);
    Task<Journal?> SourceAsync(ResourceScope scope, string sourceKey, CancellationToken ct);
    Task<ChartAccount[]> AccountsAsync(ResourceScope scope, Guid[] ids, CancellationToken ct);
    Task<PeriodCheck> CheckAsync(ResourceScope scope, DateOnly month, CancellationToken ct);
    Task<bool> HasPostingsAsync(ResourceScope scope, CancellationToken ct);
    Task<bool> HasOrdinaryPostingsAsync(ResourceScope scope, CancellationToken ct);
    Task<bool> HasApplyingOpeningSubledgersAsync(ResourceScope scope, CancellationToken ct);
    Task<JournalSummary[]> ListAsync(ResourceScope scope, DateOnly? month, Guid? accountId, bool postedOnly, PageWindow page,
        int[]? monthKeys, CancellationToken ct);
    Task<BalanceRow[]> BalancesAsync(ResourceScope scope, DateOnly through, CancellationToken ct);
    Task<JournalLink?> FindLinkAsync(ResourceScope scope, Guid id, bool tracking, CancellationToken ct);
    Task<JournalLinkView[]> LinksAsync(ResourceScope scope, Guid? journalId, int page, CancellationToken ct);
    Task<bool> LinkExistsAsync(ResourceScope scope, Guid fromJournalId, Guid toJournalId, string kind, CancellationToken ct);
    Task<JournalLink[]> AllLinksAsync(ResourceScope scope, CancellationToken ct);
    Task<JournalScanRow[]> JournalScanRowsAsync(ResourceScope scope, CancellationToken ct);
    void Add(Journal journal);
    void Add(JournalLink link);
    void Remove(JournalLink link);
    void Add(FiscalPeriod period);
    void Add(PeriodTransition transition);
}
