namespace Nexora.Finance.Domain;

public sealed class InvoiceDispatch
{
    private InvoiceDispatch() { }

    public InvoiceDispatch(CustomerDocument invoice, string recipient, DateTimeOffset now, Guid? previousId)
        : this(invoice.TenantId, invoice.WorkspaceId, invoice.Id, invoice.JournalId, false, recipient, now, previousId)
    {
        if (invoice.Terms.Kind != CustomerDocumentKind.Invoice || invoice.State != CustomerDocumentState.Posted)
            throw new LedgerRuleException("Only a posted invoice can be dispatched.");
    }

    public InvoiceDispatch(TradeDocument donation, string recipient, DateTimeOffset now, Guid? previousId)
        : this(donation.TenantId, donation.WorkspaceId, donation.Id, donation.JournalId, true, recipient, now, previousId)
    {
        if (donation.Terms.Kind != TradeKind.Donation || donation.State != TradeState.Posted || donation.ReversedById is not null)
            throw new LedgerRuleException("Only an active posted donation can be dispatched.");
    }

    private InvoiceDispatch(Guid tenantId, Guid workspaceId, Guid documentId, Guid? journalId, bool isDonation,
        string recipient, DateTimeOffset now, Guid? previousId)
    {
        Id = Guid.CreateVersion7();
        TenantId = tenantId;
        WorkspaceId = workspaceId;
        DocumentId = documentId;
        JournalId = journalId ?? throw new LedgerRuleException("Only a posted document can be dispatched.");
        IsDonation = isDonation;
        Recipient = recipient;
        PreviousId = previousId;
        UpdatedAtUtc = now;
    }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public Guid DocumentId { get; private set; }
    public bool IsDonation { get; private set; }
    public Guid JournalId { get; private set; }
    public string Recipient { get; private set; } = "";
    public Guid? PreviousId { get; private set; }
    public Guid? ResentAsId { get; private set; }
    public DispatchState State { get; private set; } = DispatchState.Queued;
    public int Attempt { get; private set; } = 1;
    public long Version { get; private set; } = 1;
    public DateTimeOffset UpdatedAtUtc { get; private set; }
    public DateTimeOffset? LeaseUntilUtc { get; private set; }
    public string? Detail { get; private set; }

    public bool Start(int attempt, DateTimeOffset now)
    {
        if (State != DispatchState.Queued || Attempt != attempt) return false;
        Move(DispatchState.Sending, now);
        LeaseUntilUtc = now.AddMinutes(2);
        return true;
    }

    public void Finish(int attempt, DispatchState state, string? detail, DateTimeOffset now)
    {
        if (Attempt != attempt || State != DispatchState.Sending) return;
        if (state is not (DispatchState.Sent or DispatchState.Failed or DispatchState.Unknown))
            throw new LedgerRuleException("Invalid mail delivery outcome.");
        Move(state, now, detail);
    }

    public void Expire(int attempt, DateTimeOffset now)
    {
        if (LeaseUntilUtc <= now) Finish(attempt, DispatchState.Unknown, "Delivery confirmation was not recorded.", now);
    }

    public void Retry(DateTimeOffset now)
    {
        if (State != DispatchState.Failed) throw new LedgerRuleException("Only a known failed dispatch can be retried.");
        Attempt++;
        Move(DispatchState.Queued, now);
    }

    public void Abandon(DateTimeOffset now)
    {
        if (State is not (DispatchState.Queued or DispatchState.Failed or DispatchState.Unknown) || ResentAsId is not null)
            throw new LedgerRuleException("This dispatch cannot be abandoned.");
        Move(DispatchState.Abandoned, now);
    }

    public void MarkResent(Guid replacement, DateTimeOffset now)
    {
        if (State is not (DispatchState.Sent or DispatchState.Unknown) || ResentAsId is not null)
            throw new LedgerRuleException("This dispatch cannot be resent.");
        ResentAsId = replacement;
        UpdatedAtUtc = now;
        Version++;
    }

    private void Move(DispatchState state, DateTimeOffset now, string? detail = null)
    {
        State = state;
        UpdatedAtUtc = now;
        Detail = detail;
        LeaseUntilUtc = null;
        Version++;
    }
}
