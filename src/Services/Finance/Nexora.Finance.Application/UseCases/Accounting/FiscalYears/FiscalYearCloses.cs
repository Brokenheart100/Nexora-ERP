using System.Text.Json;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed class FiscalYearCloses(TradeAccess access, IFiscalYearStore years, ILedgerStore ledger, IFinancialReportReader balances,
    IPartnershipStore partnerships, FinanceMutation mutations, TimeProvider clock)
{
    public async Task<FiscalYearView[]> ListAsync(Guid workspaceId, CancellationToken ct)
    {
        var (current, _) = await access.ReadAsync(workspaceId, ct);
        return (await years.ListAsync(current.Scope, ct)).Select(View).ToArray();
    }

    public async Task<FiscalYearPreview> PreviewAsync(Guid workspaceId, int year, Guid equity, CancellationToken ct)
    {
        var (current, book) = await access.ReadAsync(workspaceId, ct);
        return await PreviewAsync(current.Scope, book, Year(book, year), equity, ct);
    }

    public async Task<FiscalYearView> PrepareAsync(PrepareFiscalYear command, CancellationToken ct)
    {
        const string action = "fiscal.year-prepared";
        var (current, book) = await access.LockAsync(command.WorkspaceId, LedgerPermissions.Draft, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return View(await FindAsync(current.Scope, replay.TargetId!.Value, ct));
        var period = Year(book, command.Year);
        await DemandNextAsync(current.Scope, book, period.From, ct);
        var report = await PreviewAsync(current.Scope, book, period, command.EquityAccountId, ct);
        DemandReady(report);
        var row = new FiscalYearClose(book, period.From, period.Through, command.EquityAccountId, JsonSerializer.Serialize(report), Actor(current));
        years.Add(row);
        mutations.Record(current, command.OperationId, action, command, row.Id, row.Version);
        return View(row);
    }

    public async Task<FiscalYearView> DecideAsync(DecideFiscalYear command, CancellationToken ct)
    {
        var permission = command.Decision switch
        {
            "cancel" => LedgerPermissions.Draft,
            "close" or "reopen" => LedgerPermissions.Period,
            _ => throw new ArgumentException("Invalid fiscal year decision.")
        };
        var (current, book) = await access.LockAsync(command.WorkspaceId, permission, ct);
        var action = "fiscal.year-" + command.Decision;
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return View(await FindAsync(current.Scope, replay.TargetId!.Value, ct));
        var row = await FindAsync(current.Scope, command.Id, ct);
        if (row.Version != command.ExpectedVersion) throw new RevisionConflictException("The fiscal year plan changed.");
        var actor = Actor(current);
        if (command.Decision == "cancel") row.Cancel(actor);
        else if (command.Decision == "close")
        {
            await DemandNextAsync(current.Scope, book, row.First, ct);
            var report = await PreviewAsync(current.Scope, book, new(row.First, row.Last), row.EquityAccountId, ct);
            DemandReady(report);
            row.DemandClose(actor, JsonSerializer.Serialize(report));
            var equity = await EquityAsync(current.Scope, row.EquityAccountId, ct);
            var journalIds = new List<Guid>();
            foreach (var batch in report.Lines.Chunk(199))
            {
                var lines = batch.Select(x => new JournalLineSnapshot(x.AccountId, x.Code, x.Name,
                    Math.Max(0, -x.Balance), Math.Max(0, x.Balance))).ToList();
                var sum = batch.Sum(x => x.Balance);
                if (sum != 0) lines.Add(new(equity.Id, equity.Code, equity.Name, Math.Max(0, sum), Math.Max(0, -sum)));
                BookClosing(lines, "Fiscal year closing");
            }
            if (report.PartnerAllocations is { Length: > 0 } allocations)
            {
                var lines = new List<JournalLineSnapshot>();
                Add(equity.Id, equity.Code, equity.Name, report.NetProfit);
                foreach (var partner in allocations)
                {
                    Add(partner.Capital.AccountId, partner.Capital.Code, partner.Capital.Name, partner.Drawings.Balance - partner.Capital.Balance);
                    Add(partner.Drawings.AccountId, partner.Drawings.Code, partner.Drawings.Name, -partner.Drawings.Balance);
                }
                if (lines.Count > 0)
                {
                    BookClosing(lines, "Partnership profit and drawings closing");
                    var assigned = await ledger.AccountsAsync(current.Scope, lines.Select(x => x.AccountId).Distinct().ToArray(), ct);
                    if (assigned.Any(x => !x.IsUsed)) book.AdvanceChart();
                    foreach (var account in assigned) account.MarkUsed();
                }
                void Add(Guid id, string code, string name, decimal amount)
                {
                    if (amount != 0) lines.Add(new(id, code, name, Math.Max(0, amount), Math.Max(0, -amount)));
                }
            }
            if (journalIds.Count > 0 && !equity.IsUsed)
            {
                equity.MarkUsed();
                book.AdvanceChart();
            }
            row.Complete(journalIds.ToArray());

            void BookClosing(IReadOnlyList<JournalLineSnapshot> lines, string memo)
            {
                var sequence = journalIds.Count + 1;
                var journal = Journal.Start(book, JournalKind.FiscalClosing, $"CLOSE-{row.First:yyyyMMdd}-{sequence}", $"fiscal:{row.Id:N}:{sequence}",
                    row.Last, memo, new(row.MakerIssuer, row.MakerSubject), lines, clock.GetUtcNow());
                journal.Submit(new(row.MakerIssuer, row.MakerSubject));
                journal.Post(actor, book.NextPostingNumber(), clock.GetUtcNow());
                ledger.Add(journal);
                journalIds.Add(journal.Id);
            }
        }
        else
        {
            if (await years.LatestClosedAsync(current.Scope, ct) != row.Last)
                throw new LedgerRuleException("Only the most recently closed fiscal year can be reopened.");
            var reason = command.Reason?.Trim() ?? "";
            if (reason.Length is < 1 or > 300) throw new ArgumentException("Provide a fiscal year reopening reason.");
            var journalIds = new List<Guid>();
            foreach (var id in row.ClosingJournals)
            {
                var original = await ledger.FindAsync(current.Scope, id, false, ct) ?? throw new ResourceNotFoundException();
                var reversal = original.ReopenFiscalYear(book, reason, new(row.MakerIssuer, row.MakerSubject), actor, clock.GetUtcNow());
                ledger.Add(reversal);
                journalIds.Add(reversal.Id);
            }
            row.Reopen(journalIds.ToArray(), reason);
        }
        mutations.Record(current, command.OperationId, action, command, row.Id, row.Version);
        return View(row);
    }

    private async Task<FiscalYearPreview> PreviewAsync(ResourceScope scope, AccountingBook book, StatementPeriod period, Guid equity, CancellationToken ct)
    {
        await EquityAsync(scope, equity, ct);
        var months = (await ledger.PeriodsAsync(scope, ct)).ToDictionary(x => x.Month);
        var open = new List<DateOnly>();
        for (var month = FiscalPeriod.MonthOf(period.From); month <= period.Through; month = month.AddMonths(1))
            if (months.GetValueOrDefault(month)?.State != PeriodState.Closed) open.Add(month);
        var accountTotals = await balances.TotalsAsync(scope, period, book.LastPostingNumber, ct);
        var rows = accountTotals
            .Where(x => AccrualStatement.IsProfitAndLoss(x.Category) && x.Debit != x.Credit)
            .OrderBy(x => x.Code, StringComparer.Ordinal).Select(x => new FiscalClosingLine(x.Id, x.Code, x.Name, x.Debit - x.Credit)).ToArray();
        var pending = await years.PendingDocumentsAsync(scope, period.From, period.Through, ct);
        var profit = -rows.Sum(x => x.Balance);
        var fiscalYear = FiscalInvoiceNumber.Year(period.From, book.FiscalYearStartMonth);
        var configuration = await partnerships.FindAsync(scope, fiscalYear, ct);
        FiscalPartnerClosing[]? allocations = null;
        if (configuration is not null)
        {
            var partners = configuration.Partners;
            var ids = partners.SelectMany(x => new[] { x.CapitalAccountId, x.DrawingsAccountId }).ToArray();
            var accounts = (await ledger.AccountsAsync(scope, ids, ct)).ToDictionary(x => x.Id);
            if (ids.Contains(equity) || accounts.Count != ids.Length
                || accounts.Values.Any(x => x.IsArchived || x.Category != AccountCategory.Equity || x.Purpose != AccountPurpose.Posting))
                throw new LedgerRuleException("Choose active partner accounts and a distinct retained earnings account.");
            var shares = configuration.Allocate(profit, book.MinorUnits);
            var totals = accountTotals.ToDictionary(x => x.Id);
            allocations = partners.Select((partner, i) => new FiscalPartnerClosing(partner.Code, partner.Name, partner.Share,
                Row(partner.CapitalAccountId, shares[i]), Row(partner.DrawingsAccountId, totals.GetValueOrDefault(partner.DrawingsAccountId)?.Closing ?? 0)))
                .ToArray();
            FiscalClosingLine Row(Guid id, decimal amount) => new(id, accounts[id].Code, accounts[id].Name, amount);
        }
        return new(period, equity, profit, rows, open.ToArray(), pending, allocations);
    }

    private static void DemandReady(FiscalYearPreview report)
    {
        if (report.OpenMonths.Length != 0) throw new LedgerRuleException("Close all fiscal periods before closing the year.");
        if (report.PendingDocuments != 0) throw new LedgerRuleException("Resolve all pending financial documents and inventory costs before closing the year.");
    }

    private async Task DemandNextAsync(ResourceScope scope, AccountingBook book, DateOnly first, CancellationToken ct)
    {
        var previous = await years.LatestClosedAsync(scope, ct);
        var expected = previous?.AddDays(1) ?? book.StartsOn;
        if (first != expected) throw new LedgerRuleException("Close fiscal years in accounting order.");
    }

    private async Task<ChartAccount> EquityAsync(ResourceScope scope, Guid id, CancellationToken ct)
    {
        var account = (await ledger.AccountsAsync(scope, [id], ct)).SingleOrDefault() ?? throw new ResourceNotFoundException();
        if (account.Category != AccountCategory.Equity || account.Purpose != AccountPurpose.Posting || account.IsArchived)
            throw new LedgerRuleException("Choose an active equity posting account for retained earnings.");
        return account;
    }
    private async Task<FiscalYearClose> FindAsync(ResourceScope scope, Guid id, CancellationToken ct) =>
        await years.FindAsync(scope, id, ct) ?? throw new ResourceNotFoundException();
    private static JournalActor Actor(BookAccess current) => new(current.Actor.Issuer, current.Actor.Subject);
    private static FiscalYearView View(FiscalYearClose row) => new(row.Id, row.Version, row.State.ToString().ToLowerInvariant(),
        JsonSerializer.Deserialize<FiscalYearPreview>(row.Snapshot)!, row.ClosingJournals, row.ReopeningJournals, row.ReopenReason);
    private static StatementPeriod Year(AccountingBook book, int year)
    {
        if (year is < 1899 or > 9997) throw new ArgumentException("Invalid fiscal year.");
        var anchor = new DateOnly(year, book.FiscalYearStartMonth, 1);
        var last = anchor.AddYears(1).AddDays(-1);
        if (last < book.StartsOn) throw new ArgumentException("The fiscal year predates the accounting book.");
        return new(anchor < book.StartsOn ? book.StartsOn : anchor, last);
    }
}
