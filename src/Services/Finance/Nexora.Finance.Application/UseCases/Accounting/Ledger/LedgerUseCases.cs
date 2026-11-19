using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed partial class LedgerUseCases(IBookAccess access, IBookStore books, IChartStore chart,
    ILedgerStore store, FinanceMutation mutations, TimeProvider clock, IFiscalYearStore years)
{

    public async Task<LedgerChange> StartAsync(StartJournal command, CancellationToken ct)
    {
        const string action = "journal.created";
        var (current, book) = await BeginAsync(command.WorkspaceId, LedgerPermissions.Draft, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return Change(replay);
        var (kind, source, key) = command.Kind switch
        {
            "opening" => (JournalKind.Opening, "OPENING", "opening"),
            "manual" => ManualSource(command.SourceNumber),
            _ => throw new ArgumentException("Unknown journal kind.")
        };
        if (await store.SourceAsync(current.Scope, key, ct) is not null)
            throw new BusinessConflictException("A journal already exists for this source.");
        if (kind == JournalKind.Opening && await store.HasPostingsAsync(current.Scope, ct))
            throw new LedgerRuleException("Opening balances must be posted before other journals.");
        var draft = RequiredDraft(command.Draft);
        current.DemandOn(LedgerPermissions.Draft, draft.On);
        await DemandOpenAsync(current.Scope, book, draft.On, ct);
        var lines = await ResolveLinesAsync(current.Scope, kind, draft.Lines, ct);
        var journal = Journal.Start(book, kind, source, key, draft.On, draft.Memo, Actor(current), lines, clock.GetUtcNow(), ParseCashActivity(draft.CashActivity));
        store.Add(journal);
        book.RegisterAccountingActivity();
        return Record(current, command.OperationId, action, command, journal);
    }

    public async Task<LedgerChange> EditAsync(EditJournal command, CancellationToken ct)
    {
        const string action = "journal.edited";
        var (current, book) = await BeginAsync(command.WorkspaceId, LedgerPermissions.Draft, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return Change(replay);
        var journal = await LoadAsync(current.Scope, command.JournalId, command.ExpectedVersion, ct);
        var draft = RequiredDraft(command.Draft);
        current.DemandOn(LedgerPermissions.Draft, journal.On);
        current.DemandOn(LedgerPermissions.Draft, draft.On);
        await DemandOpenAsync(current.Scope, book, journal.On, ct);
        await DemandOpenAsync(current.Scope, book, draft.On, ct);
        var lines = await ResolveLinesAsync(current.Scope, journal.Kind, draft.Lines, ct);
        journal.Edit(book, draft.On, draft.Memo, lines, Actor(current), ParseCashActivity(draft.CashActivity));
        return Record(current, command.OperationId, action, command, journal);
    }

    public async Task<LedgerChange> DecideAsync(DecideJournal command, CancellationToken ct)
    {
        var permission = command.Decision switch
        {
            "submit" or "cancel" => LedgerPermissions.Draft,
            "post" => LedgerPermissions.Post,
            _ => throw new ArgumentException("Unknown journal decision.")
        };
        var action = $"journal.{command.Decision}";
        var (current, book) = await BeginAsync(command.WorkspaceId, permission, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return Change(replay);
        var journal = await LoadAsync(current.Scope, command.JournalId, command.ExpectedVersion, ct);
        current.DemandOn(permission, journal.On);
        if (command.Decision != "cancel") await DemandOpenAsync(current.Scope, book, journal.On, ct);
        switch (command.Decision)
        {
            case "submit":
                journal.Submit(Actor(current));
                break;
            case "cancel":
                journal.Cancel(Actor(current));
                break;
            case "post":
                await PostPendingAsync(current, book, journal, ct);
                break;
        }
        return Record(current, command.OperationId, action, command, journal);
    }

    private async Task PostPendingAsync(BookAccess current, AccountingBook book, Journal journal, CancellationToken ct)
    {
        if (journal.Kind == JournalKind.Reversal)
        {
            current.Demand(LedgerPermissions.Reverse);
            journal.Post(Actor(current), book.NextPostingNumber(), clock.GetUtcNow());
            return;
        }
        if (journal.Kind == JournalKind.Opening && await store.HasPostingsAsync(current.Scope, ct))
            throw new LedgerRuleException("Opening balances must be posted before other journals.");
        if (journal.Kind is (JournalKind.Manual or JournalKind.Imported)
            && (await store.SourceAsync(current.Scope, "opening", ct)) is { State: not JournalState.Posted })
            throw new LedgerRuleException("Complete or cancel pending opening balances before posting.");
        var accounts = await DemandPostingAccountsAsync(current.Scope, journal.Kind, journal.Lines.Select(x => x.AccountId).ToArray(), ct);
        journal.Post(Actor(current), book.NextPostingNumber(), clock.GetUtcNow());
        if (accounts.Any(x => !x.IsUsed)) book.AdvanceChart();
        foreach (var account in accounts) account.MarkUsed();
    }

    public async Task<LedgerChange> ReverseAsync(ReverseJournal command, CancellationToken ct)
    {
        const string action = "journal.reversal.requested";
        var (current, book) = await BeginAsync(command.WorkspaceId, LedgerPermissions.Draft, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return Change(replay);
        var original = await LoadAsync(current.Scope, command.JournalId, command.ExpectedVersion, ct);
        current.DemandOn(LedgerPermissions.Draft, original.On);
        current.DemandOn(LedgerPermissions.Draft, command.On);
        if (await store.SourceAsync(current.Scope, $"reversal:{original.Id:N}", ct) is not null)
            throw new LedgerRuleException("This journal has already been reversed.");
        await DemandOpenAsync(current.Scope, book, command.On, ct);
        var reversal = original.RequestReversal(book, command.On, Reason(command.Reason), Actor(current), clock.GetUtcNow());
        store.Add(reversal);
        return Record(current, command.OperationId, action, command, reversal);
    }

    private async Task<JournalLineSnapshot[]> ResolveLinesAsync(ResourceScope scope, JournalKind kind, JournalLineInput[] inputs, CancellationToken ct)
    {
        if (inputs is not { Length: >= 2 and <= 200 } || inputs.Any(x => x is null)) throw new ArgumentException("Invalid journal lines.");
        var accounts = (await DemandPostingAccountsAsync(scope, kind, inputs.Select(x => x.AccountId).ToArray(), ct))
            .ToDictionary(x => x.Id);
        return inputs.Select(x => new JournalLineSnapshot(x.AccountId, accounts[x.AccountId].Code, accounts[x.AccountId].Name, x.Debit, x.Credit)).ToArray();
    }

    private async Task<ChartAccount[]> DemandPostingAccountsAsync(ResourceScope scope, JournalKind kind, Guid[] ids, CancellationToken ct)
    {
        ids = ids.Distinct().ToArray();
        var accounts = await store.AccountsAsync(scope, ids, ct);
        if (accounts.Length != ids.Length) throw new ResourceNotFoundException();
        if (accounts.Any(x => x.IsArchived || x.Purpose != AccountPurpose.Posting
            || kind == JournalKind.Opening && x.Category is AccountCategory.Income or AccountCategory.Expense))
            throw new LedgerRuleException("A journal account is archived, restricted, or invalid for opening balances.");
        return accounts;
    }
    private async Task DemandOpenAsync(ResourceScope scope, AccountingBook book, DateOnly date, CancellationToken ct)
    {
        if (date.Year is < 1900 or > 9998) throw new ArgumentException("Invalid accounting date.");
        if (await store.HasApplyingOpeningSubledgersAsync(scope, ct))
            throw new LedgerRuleException("Wait for the approved opening subledger batch to post.");
        book.DemandTaxDateOpen(date);
        var period = await store.PeriodAsync(scope, FiscalPeriod.MonthOf(date), ct)
            ?? throw new LedgerRuleException("The accounting period has not been opened.", "finance.period_not_open");
        period.RequireOpen();
    }
    private async Task<Journal> LoadAsync(ResourceScope scope, Guid id, long expected, CancellationToken ct)
    {
        var journal = await store.FindAsync(scope, id, true, ct) ?? throw new ResourceNotFoundException();
        DemandVersion(journal.Version, expected);
        return journal;
    }
    private async Task<(BookAccess, AccountingBook)> BeginAsync(Guid workspaceId, string permission, CancellationToken ct)
    {
        var current = await access.DemandAsync(workspaceId, false, ct);
        current.DemandAny(permission);
        return (current, await chart.LockBookAsync(current.Scope, ct) ?? throw new ResourceNotFoundException());
    }
    private async Task<(BookAccess, AccountingBook)> ReadBookAsync(Guid workspaceId, CancellationToken ct)
    {
        var current = await access.DemandAsync(workspaceId, false, ct);
        current.DemandAny(LedgerPermissions.Read);
        return (current, await books.FindAsync(current.Scope, ct) ?? throw new ResourceNotFoundException());
    }
    private LedgerChange Record(BookAccess access, Guid operation, string action, object command, Journal journal)
    {
        mutations.Record(access, operation, action, command, journal.Id, journal.Version);
        return new(journal.Id, journal.Version);
    }
    private static LedgerChange Change(FinanceAudit audit) => new(audit.TargetId!.Value, audit.ResultVersion);
    private static JournalActor Actor(BookAccess current) => new(current.Actor.Issuer, current.Actor.Subject);
    private static PeriodView View(FiscalPeriod period) => new(period.Month, period.State.ToString().ToLowerInvariant(), period.Version, period.ClosingWatermark);
    private static JournalSummary Summary(Journal journal) => new(journal.Id, journal.Kind.ToString().ToLowerInvariant(), journal.SourceNumber,
        journal.On, journal.Memo, journal.State.ToString().ToLowerInvariant(), journal.Version, journal.PostingNumber, journal.ReversesId,
        journal.ImportProvider, journal.ExternalId);
    private static void DemandVersion(long actual, long expected)
    {
        if (actual != expected) throw new RevisionConflictException("The journal or period version changed. Refresh and retry.");
    }
    private static JournalDraftInput RequiredDraft(JournalDraftInput? draft) => draft ?? throw new ArgumentException("Journal content is required.");
    private static string Reason(string value)
    {
        var reason = value?.Trim() ?? "";
        if (reason.Length is < 1 or > 300) throw new ArgumentException("A reason of up to 300 characters is required.");
        return reason;
    }
    private static (JournalKind, string, string) ManualSource(string? value)
    {
        var source = value?.Trim().ToUpperInvariant() ?? "";
        if (source.Length is < 1 or > 80 || source.Any(x => !(char.IsAsciiLetterOrDigit(x) || x is '-' or '_' or '/' or '.')))
            throw new ArgumentException("A valid manual source number is required.");
        return (JournalKind.Manual, source, $"manual:{source}");
    }
}
