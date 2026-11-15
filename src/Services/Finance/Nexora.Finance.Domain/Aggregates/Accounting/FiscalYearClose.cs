namespace Nexora.Finance.Domain;

public sealed class FiscalYearClose
{
    private FiscalYearClose() { }
    public FiscalYearClose(AccountingBook book, DateOnly first, DateOnly last, Guid equity, string snapshot, JournalActor maker)
    {
        Id = Guid.CreateVersion7();
        TenantId = book.TenantId;
        WorkspaceId = book.WorkspaceId;
        First = first;
        Last = last;
        EquityAccountId = equity;
        Snapshot = snapshot;
        MakerIssuer = maker.Issuer;
        MakerSubject = maker.Subject;
    }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public DateOnly First { get; private set; }
    public DateOnly Last { get; private set; }
    public Guid EquityAccountId { get; private set; }
    public string Snapshot { get; private set; } = "";
    public string MakerIssuer { get; private set; } = "";
    public string MakerSubject { get; private set; } = "";
    public Guid[] ClosingJournals { get; private set; } = [];
    public Guid[] ReopeningJournals { get; private set; } = [];
    public string? ReopenReason { get; private set; }
    public long Version { get; private set; } = 1;
    public FiscalCloseState State { get; private set; } = FiscalCloseState.Pending;

    public void DemandClose(JournalActor reviewer, string preview)
    {
        if (State != FiscalCloseState.Pending || MadeBy(reviewer))
            throw new LedgerRuleException("Year end requires a pending plan and an independent reviewer.");
        if (Snapshot != preview) throw new LedgerRuleException("The fiscal year changed after preview.");
    }

    public void Complete(Guid[] journals)
    {
        if (State != FiscalCloseState.Pending) throw new LedgerRuleException("Only a pending fiscal year can be closed.");
        ClosingJournals = journals.ToArray();
        State = FiscalCloseState.Closed;
        Version++;
    }

    public void Reopen(Guid[] reversals, string reason)
    {
        if (State != FiscalCloseState.Closed || reason.Length is < 1 or > 300)
            throw new LedgerRuleException("Reopening requires a closed year and a reason.");
        ReopeningJournals = reversals.ToArray();
        ReopenReason = reason;
        State = FiscalCloseState.Reopened;
        Version++;
    }

    public void Cancel(JournalActor maker)
    {
        if (State != FiscalCloseState.Pending || !MadeBy(maker))
            throw new LedgerRuleException("Only the preparer may cancel a pending fiscal year.");
        State = FiscalCloseState.Cancelled;
        Version++;
    }

    private bool MadeBy(JournalActor actor) => MakerIssuer == actor.Issuer && MakerSubject == actor.Subject;
}
