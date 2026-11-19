namespace Nexora.Finance.Domain;

public enum OpeningSubledgerKind { Stock, Receivable, Payable, Bank }

public enum OpeningSubledgerState { Submitted, ApplyingStock, Posted, Rejected, Cancelled }

public sealed record OpeningSubledgerRow(Guid Id, OpeningSubledgerKind Kind, string Reference, Guid ResourceId,
    Guid? WarehouseId, Guid? UnitId, string Name, decimal Quantity, decimal Amount, DateOnly? DueOn, Guid AccountId);

public sealed record OpeningSubledgerPosting(Guid RowId, Guid? JournalId, Guid SubledgerId);

public sealed class OpeningSubledgerBatch
{
    private OpeningSubledgerBatch() { }

    public OpeningSubledgerBatch(AccountingBook book, Guid equityAccountId, JournalActor maker, string fileHash,
        OpeningSubledgerRow[] rows, DateTimeOffset now)
    {
        Id = Guid.CreateVersion7();
        TenantId = book.TenantId;
        WorkspaceId = book.WorkspaceId;
        On = book.StartsOn;
        Currency = book.BaseCurrency;
        EquityAccountId = equityAccountId;
        Maker = maker;
        FileHash = fileHash;
        Rows = rows;
        CreatedAtUtc = now;
    }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public DateOnly On { get; private set; }
    public string Currency { get; private set; } = "";
    public Guid EquityAccountId { get; private set; }
    public string FileHash { get; private set; } = "";
    public JournalActor Maker { get; private set; } = null!;
    public JournalActor? Reviewer { get; private set; }
    public OpeningSubledgerRow[] Rows { get; private set; } = [];
    public OpeningSubledgerPosting[] Postings { get; private set; } = [];
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public long Version { get; private set; } = 1;
    public OpeningSubledgerState State { get; private set; }
    public string? Rejection { get; private set; }

    public void Approve(JournalActor reviewer)
    {
        if (State != OpeningSubledgerState.Submitted || Maker == reviewer)
            throw new LedgerRuleException("An independent reviewer must approve this submitted batch.");
        Reviewer = reviewer;
        State = OpeningSubledgerState.ApplyingStock;
        Version++;
    }

    public void Cancel(JournalActor actor)
    {
        if (State != OpeningSubledgerState.Submitted || Maker != actor)
            throw new LedgerRuleException("Only the maker can cancel a submitted batch.");
        State = OpeningSubledgerState.Cancelled;
        Version++;
    }

    public void Reject(string reason)
    {
        DemandApplying();
        Rejection = reason;
        State = OpeningSubledgerState.Rejected;
        Version++;
    }

    public void Post(OpeningSubledgerPosting[] postings)
    {
        DemandApplying();
        if (!Rows.Select(x => x.Id).SequenceEqual(postings.Select(x => x.RowId)))
            throw new LedgerRuleException("The opening postings do not cover the approved rows.");
        Postings = postings;
        State = OpeningSubledgerState.Posted;
        Version++;
    }

    private void DemandApplying()
    {
        if (State != OpeningSubledgerState.ApplyingStock || Reviewer is null)
            throw new LedgerRuleException("The batch is not approved for posting.");
    }
}
