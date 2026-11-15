namespace Nexora.Finance.Domain;

public sealed class Journal
{
    private Journal() { }
    private readonly List<JournalLine> _lines = [];
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public JournalKind Kind { get; private set; }
    public string SourceKey { get; private set; } = "";
    public string SourceNumber { get; private set; } = "";
    public Guid? ReversesId { get; private set; }
    public CashActivity? CashActivity { get; private set; }
    public string MakerIssuer { get; private set; } = "";
    public string MakerSubject { get; private set; } = "";
    public string? ReviewerIssuer { get; private set; }
    public string? ReviewerSubject { get; private set; }
    public long? ApprovedVersion { get; private set; }
    public JournalState State { get; private set; } = JournalState.Draft;
    public DateOnly On { get; private set; }
    public string Memo { get; private set; } = "";
    public long Version { get; private set; } = 1;
    public long? PostingNumber { get; private set; }
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public DateTimeOffset? PostedAtUtc { get; private set; }
    public IReadOnlyCollection<JournalLine> Lines => _lines.AsReadOnly();

    public static Journal Start(AccountingBook book, JournalKind kind, string sourceNumber, string sourceKey,
        DateOnly on, string memo, JournalActor maker, IReadOnlyList<JournalLineSnapshot> lines, DateTimeOffset now, CashActivity? cashActivity = null)
    {
        var journal = new Journal
        {
            Id = Guid.CreateVersion7(), TenantId = book.TenantId, WorkspaceId = book.WorkspaceId, Kind = kind,
            SourceKey = sourceKey, SourceNumber = sourceNumber, MakerIssuer = maker.Issuer, MakerSubject = maker.Subject,
            CreatedAtUtc = now
        };
        journal.SetContent(book, on, memo, lines, cashActivity);
        return journal;
    }

    public void Edit(AccountingBook book, DateOnly on, string memo, IReadOnlyList<JournalLineSnapshot> lines, JournalActor actor, CashActivity? cashActivity = null)
    {
        RequireMaker(actor);
        if (State != JournalState.Draft) throw new LedgerRuleException("Only draft journals may be edited.");
        SetContent(book, on, memo, lines, cashActivity);
        Version++;
    }
    public void Submit(JournalActor actor)
    {
        RequireMaker(actor);
        if (State != JournalState.Draft) throw new LedgerRuleException("Only a draft can be submitted.");
        State = JournalState.Submitted;
        Version++;
    }
    public void Cancel(JournalActor actor)
    {
        RequireMaker(actor);
        if (State is not (JournalState.Draft or JournalState.Submitted)) throw new LedgerRuleException("Only pending journals can be cancelled.");
        State = JournalState.Cancelled;
        Version++;
    }
    public void Post(JournalActor reviewer, long number, DateTimeOffset now)
    {
        if (State != JournalState.Submitted) throw new LedgerRuleException("Submit the journal for review before posting.");
        if (MadeBy(reviewer)) throw new LedgerRuleException("The maker cannot approve this journal.");
        CompletePosting(reviewer, number, now);
    }
    public Journal RequestReversal(AccountingBook book, DateOnly on, string reason, JournalActor maker, DateTimeOffset now)
    {
        if (State != JournalState.Posted || Kind != JournalKind.Manual || on < On)
            throw new LedgerRuleException("Only a posted manual journal can be reversed on or after its original date.");
        var reversal = Start(book, JournalKind.Reversal, SourceNumber, $"reversal:{Id:N}", on, reason,
            maker, _lines.Select(x => new JournalLineSnapshot(x.AccountId, x.Code, x.Name, x.Credit, x.Debit)).ToArray(), now);
        reversal.ReversesId = Id;
        reversal.CashActivity = CashActivity;
        reversal.Submit(maker);
        return reversal;
    }

    public Journal ReverseAutomatic(AccountingBook book, DateOnly on, string reason, JournalActor maker, JournalActor reviewer, DateTimeOffset now)
    {
        if (State != JournalState.Posted || Kind != JournalKind.Automatic || on < On)
            throw new LedgerRuleException("A posted automatic journal and valid reversal date are required.");
        var reversal = Start(book, JournalKind.Reversal, SourceNumber, $"reversal:{Id:N}", on, reason,
            maker, _lines.Select(x => new JournalLineSnapshot(x.AccountId, x.Code, x.Name, x.Credit, x.Debit)).ToArray(), now);
        reversal.ReversesId = Id;
        reversal.CashActivity = CashActivity;
        reversal.Submit(maker);
        reversal.Post(reviewer, book.NextPostingNumber(), now);
        return reversal;
    }
    public Journal ReopenFiscalYear(AccountingBook book, string reason, JournalActor maker, JournalActor reviewer, DateTimeOffset now)
    {
        if (State != JournalState.Posted || Kind != JournalKind.FiscalClosing || ReversesId is not null)
            throw new LedgerRuleException("A posted fiscal closing journal is required.");
        var reversal = Start(book, JournalKind.FiscalClosing, SourceNumber, $"fiscal-reopen:{Id:N}", On, reason,
            maker, _lines.Select(x => new JournalLineSnapshot(x.AccountId, x.Code, x.Name, x.Credit, x.Debit)).ToArray(), now);
        reversal.ReversesId = Id;
        reversal.Submit(maker);
        reversal.Post(reviewer, book.NextPostingNumber(), now);
        return reversal;
    }

    private void SetContent(AccountingBook book, DateOnly on, string memo, IReadOnlyList<JournalLineSnapshot> lines, CashActivity? cashActivity)
    {
        if (on < book.StartsOn || on.Year > 9998 || Kind == JournalKind.Opening && on != book.StartsOn)
            throw new ArgumentException("Invalid journal date.");
        memo = memo?.Trim() ?? "";
        if (memo.Length is < 1 or > 300) throw new ArgumentException("A journal description is required.");
        if (lines.Count is < 2 or > 200) throw new ArgumentException("A journal needs between two and two hundred lines.");
        foreach (var line in lines)
        {
            if (line.AccountId == Guid.Empty || !Valid(line.Debit) || !Valid(line.Credit) || (line.Debit > 0) == (line.Credit > 0))
                throw new ArgumentException("Each line needs a valid account and exactly one positive amount in book precision.");
        }
        if (lines.Sum(x => x.Debit) != lines.Sum(x => x.Credit)) throw new LedgerRuleException("Debits and credits must balance.");
        if (cashActivity is { } activity && (Kind != JournalKind.Manual || !Enum.IsDefined(activity)))
            throw new ArgumentException("Cash flow classification is only available on manual journals.");
        On = on;
        Memo = memo;
        CashActivity = cashActivity;
        _lines.Clear();
        _lines.AddRange(lines.Select((x, index) => new JournalLine(this, index + 1, x)));
        bool Valid(decimal amount) => amount is >= 0 and <= 1_000_000_000_000m && Math.Round(amount, book.MinorUnits) == amount;
    }
    private void CompletePosting(JournalActor reviewer, long number, DateTimeOffset now)
    {
        State = JournalState.Posted;
        ApprovedVersion = Version;
        ReviewerIssuer = reviewer.Issuer;
        ReviewerSubject = reviewer.Subject;
        PostingNumber = number;
        PostedAtUtc = now;
        Version++;
    }
    private bool MadeBy(JournalActor actor) => MakerIssuer == actor.Issuer && MakerSubject == actor.Subject;
    private void RequireMaker(JournalActor actor)
    {
        if (!MadeBy(actor)) throw new LedgerRuleException("Only the journal maker can change this draft.");
    }
}
