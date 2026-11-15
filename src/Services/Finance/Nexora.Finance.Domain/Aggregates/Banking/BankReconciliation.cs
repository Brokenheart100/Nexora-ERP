namespace Nexora.Finance.Domain;

public sealed class BankReconciliation
{
    private BankReconciliation() { }

    public BankReconciliation(BankAccount bank, DateOnly through, decimal statementBalance, string snapshot,
        JournalActor maker, DateTimeOffset createdAtUtc)
    {
        Id = Guid.CreateVersion7();
        TenantId = bank.TenantId;
        WorkspaceId = bank.WorkspaceId;
        BankId = bank.Id;
        Through = through;
        StatementBalance = statementBalance;
        Snapshot = snapshot;
        MakerIssuer = maker.Issuer;
        MakerSubject = maker.Subject;
        CreatedAtUtc = createdAtUtc;
    }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public Guid BankId { get; private set; }
    public DateOnly Through { get; private set; }
    public decimal StatementBalance { get; private set; }
    public string Snapshot { get; private set; } = "";
    public string MakerIssuer { get; private set; } = "";
    public string MakerSubject { get; private set; } = "";
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public DateTimeOffset? CompletedAtUtc { get; private set; }
    public string? UndoReason { get; private set; }
    public ReconciliationState State { get; private set; } = ReconciliationState.Pending;
    public long Version { get; private set; } = 1;

    public void Finish(JournalActor actor, BankReconciliationSnapshot prepared, BankReconciliationSnapshot current, DateTimeOffset now)
    {
        if (State != ReconciliationState.Pending || MadeBy(actor))
            throw new LedgerRuleException("Reconciliation requires an independent reviewer and a pending report.");
        if (!prepared.HasSameEvidence(current)) throw new LedgerRuleException("Bank activity changed. Prepare a new reconciliation.");
        if (current.Difference != 0 || current.LedgerDifference != 0)
            throw new LedgerRuleException("Reconciliation differences must be zero.");
        State = ReconciliationState.Completed;
        CompletedAtUtc = now;
        Version++;
    }

    public void Undo(string reason)
    {
        if (State != ReconciliationState.Completed || reason.Length is < 1 or > 300)
            throw new LedgerRuleException("A completed reconciliation and a reason are required.");
        State = ReconciliationState.Undone;
        UndoReason = reason;
        Version++;
    }

    public void Cancel(JournalActor actor)
    {
        if (State != ReconciliationState.Pending || !MadeBy(actor))
            throw new LedgerRuleException("Only the preparer may cancel this pending reconciliation.");
        State = ReconciliationState.Cancelled;
        Version++;
    }

    private bool MadeBy(JournalActor actor) => MakerIssuer == actor.Issuer && MakerSubject == actor.Subject;
}
