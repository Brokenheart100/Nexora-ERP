using System.Security.Cryptography;
using System.Text.Json;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed class TaxFilings(IBookAccess access, IBookStore books, IChartStore chart, ITaxFilingStore filings,
    IFinanceHistoryReader history, FinanceMutation mutations, TimeProvider clock, ILedgerStore ledger)
{
    public async Task<TaxCalendarView> CalendarAsync(Guid workspace, CancellationToken ct)
    {
        var (current, book) = await BookAsync(workspace, false, ct);
        return Calendar(current, book, !await filings.HasFilingsAsync(current.Scope, ct));
    }

    public async Task<TaxCalendarView> ChangeCalendarAsync(SetTaxCalendar command, CancellationToken ct)
    {
        const string action = "tax.calendar.changed";
        var (current, book) = await BookAsync(command.WorkspaceId, true, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        var canChange = !await filings.HasFilingsAsync(current.Scope, ct);
        if (replay is not null) return Calendar(current, book, canChange);
        var cycle = command.Cycle switch
        {
            "monthly" => TaxCycle.Monthly,
            "quarterly" => TaxCycle.Quarterly,
            _ => throw new ArgumentException("Choose monthly or quarterly tax periods.")
        };
        var basis = command.Basis switch
        {
            null => book.TaxBasis,
            "accrual" => TaxBasis.Accrual,
            "cash" => TaxBasis.Cash,
            _ => throw new ArgumentException("Choose accrual or cash tax recognition.")
        };
        DemandVersion(book.TaxCalendarVersion, command.ExpectedVersion);
        if (!canChange && (book.TaxCycle != cycle || book.TaxBasis != basis))
            throw new BusinessConflictException("The tax cycle and recognition basis are fixed after the first filing.");
        book.ChangeTaxCalendar(cycle, basis);
        mutations.Record(current, command.OperationId, action, command, book.WorkspaceId, book.TaxCalendarVersion);
        return Calendar(current, book, canChange);
    }

    public async Task<TaxPeriodView> PeriodAsync(Guid workspace, DateOnly on, CancellationToken ct)
    {
        var (current, book) = await BookAsync(workspace, false, ct);
        var period = Period(book, on);
        var totals = await TotalsAsync(current.Scope, book, period, ct);
        var history = await filings.HistoryAsync(current.Scope, period, ct);
        return new(totals, history, history.FirstOrDefault() is { } latest && latest.Fingerprint != totals.Fingerprint,
            book.TaxLockedThrough);
    }

    public async Task<TaxFilingView> DetailAsync(Guid workspace, Guid id, CancellationToken ct)
    {
        var (current, _) = await BookAsync(workspace, false, ct);
        return await FindAsync(current.Scope, id, ct);
    }

    public async Task<TaxFilingView> RecordAsync(RecordTaxFiling command, CancellationToken ct)
    {
        const string action = "tax.filing.recorded";
        var (current, book) = await BookAsync(command.WorkspaceId, true, ct);
        if (command.LockBooks) current.Demand(LedgerPermissions.Period);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return await FindAsync(current.Scope, replay.TargetId!.Value, ct);
        if (await ledger.HasApplyingOpeningSubledgersAsync(current.Scope, ct))
            throw new LedgerRuleException("Wait for the approved opening subledger batch to post.");
        var period = Period(book, command.On);
        var previous = await filings.LatestAsync(current.Scope, period, ct);
        DemandVersion(previous?.Version ?? 0, command.ExpectedVersion);
        var totals = await TotalsAsync(current.Scope, book, period, ct);
        if (!StringComparer.Ordinal.Equals(command.ExpectedFingerprint, totals.Fingerprint))
            throw new BusinessConflictException("The tax report changed. Refresh and review the amounts before filing.");
        var filing = new TaxFiling(book, period, previous, command.Reference?.Trim() ?? "", command.Reason?.Trim(),
            totals.Fingerprint, JsonSerializer.Serialize(totals), new(current.Actor.Issuer, current.Actor.Subject),
            clock.GetUtcNow(), command.LockBooks);
        filings.Add(filing);
        if (command.LockBooks) book.LockForTax(period.Through);
        mutations.Record(current, command.OperationId, action, command, filing.Id, filing.Version);
        return new(Entry(filing), totals);
    }

    private async Task<TaxPeriodTotals> TotalsAsync(ResourceScope scope, AccountingBook book, TaxPeriod period, CancellationToken ct)
    {
        var cash = book.TaxBasis == TaxBasis.Cash;
        var basis = cash ? "cash" : "accrual";
        var sourcePeriod = cash ? new TaxPeriod(book.StartsOn, period.Through) : period;
        var postings = await filings.SourcesAsync(scope, sourcePeriod, book.LastPostingNumber, book.MinorUnits, ct);
        if (cash)
        {
            var sourceHistory = await history.ReadAsync(scope, period.Through, book.LastPostingNumber, false, ct);
            postings = CashTaxPostings.Calculate(sourceHistory, postings, period, book.MinorUnits);
        }
        var codes = postings.GroupBy(x => x.Code, StringComparer.Ordinal).OrderBy(x => x.Key, StringComparer.Ordinal).Select(group =>
        {
            var input = group.Where(x => x.Direction == "input").Sum(x => x.Amount);
            var output = group.Where(x => x.Direction == "output").Sum(x => x.Amount);
            return new TaxCodeTotal(group.Key, input, output, output - input);
        }).ToArray();
        var snapshotKey = cash ? JsonSerializer.SerializeToUtf8Bytes(new { period, basis, postings })
            : JsonSerializer.SerializeToUtf8Bytes(new { period, postings });
        var fingerprint = Convert.ToHexString(SHA256.HashData(snapshotKey));
        return new(period, book.BaseCurrency, book.LastPostingNumber, fingerprint,
            codes.Sum(x => x.Input), codes.Sum(x => x.Output), codes.Sum(x => x.NetPayable), codes, postings, basis);
    }

    private async Task<(BookAccess Current, AccountingBook Book)> BookAsync(Guid workspace, bool write, CancellationToken ct)
    {
        var current = await access.DemandAsync(workspace, false, ct);
        if (write) current.Demand(TaxUseCases.Manage);
        else if (!current.Allows(TaxUseCases.Manage)) current.Demand(LedgerPermissions.Read);
        var book = write ? await chart.LockBookAsync(current.Scope, ct) : await books.FindAsync(current.Scope, ct);
        return (current, book ?? throw new ResourceNotFoundException());
    }

    private async Task<TaxFilingView> FindAsync(ResourceScope scope, Guid id, CancellationToken ct)
    {
        var filing = await filings.FindAsync(scope, id, ct) ?? throw new ResourceNotFoundException();
        return new(Entry(filing), JsonSerializer.Deserialize<TaxPeriodTotals>(filing.SnapshotJson)!);
    }

    private static TaxPeriod Period(AccountingBook book, DateOnly on)
    {
        var period = TaxPeriod.For(on, book.TaxCycle);
        if (period.Through < book.StartsOn) throw new ArgumentException("The tax period predates the book.");
        return period;
    }

    private static void DemandVersion(long version, long expectedVersion)
    {
        if (version != expectedVersion) throw new RevisionConflictException("The tax filing or calendar changed. Refresh and retry.");
    }

    private static TaxCalendarView Calendar(BookAccess current, AccountingBook book, bool canChange) =>
        new(book.TaxCycle == TaxCycle.Quarterly ? "quarterly" : "monthly", book.TaxCalendarVersion,
            book.TaxLockedThrough, current.Allows(TaxUseCases.Manage),
            current.Allows(TaxUseCases.Manage) && current.Allows(LedgerPermissions.Period),
            book.TaxBasis == TaxBasis.Cash ? "cash" : "accrual", canChange && current.Allows(TaxUseCases.Manage));

    private static TaxFilingEntry Entry(TaxFiling filing) =>
        new(filing.Id, filing.From, filing.Through, filing.Version, filing.CorrectsId, filing.Reference, filing.Reason,
            filing.RecordedAtUtc, filing.LockBooks, filing.Fingerprint);
}
