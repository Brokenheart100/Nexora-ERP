namespace Nexora.Finance.Domain;

public sealed class TaxFiling
{
    private TaxFiling() { }

    public TaxFiling(AccountingBook book, TaxPeriod period, TaxFiling? previous, string reference, string? reason,
        string fingerprint, string snapshotJson, JournalActor actor, DateTimeOffset now, bool lockBooks)
    {
        if (previous is not null && (previous.TenantId != book.TenantId || previous.WorkspaceId != book.WorkspaceId
            || previous.From != period.From || previous.Through != period.Through))
            throw new LedgerRuleException("A correction must refer to the same tax period.");
        if (reference.Length is < 1 or > 100 || reason?.Length > 300 || previous is not null && string.IsNullOrWhiteSpace(reason))
            throw new ArgumentException("Provide a filing reference and a reason for any correction.");

        Id = Guid.CreateVersion7();
        TenantId = book.TenantId;
        WorkspaceId = book.WorkspaceId;
        From = period.From;
        Through = period.Through;
        Version = (previous?.Version ?? 0) + 1;
        CorrectsId = previous?.Id;
        Reference = reference;
        Reason = reason;
        Fingerprint = fingerprint;
        SnapshotJson = snapshotJson;
        FiledByIssuer = actor.Issuer;
        FiledBySubject = actor.Subject;
        // Match the stored precision so the initial response and a replay expose the same timestamp.
        RecordedAtUtc = now.ToUniversalTime().AddTicks(-(now.Ticks % TimeSpan.TicksPerMicrosecond));
        LockBooks = lockBooks;
    }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public DateOnly From { get; private set; }
    public DateOnly Through { get; private set; }
    public long Version { get; private set; }
    public Guid? CorrectsId { get; private set; }
    public string Reference { get; private set; } = "";
    public string? Reason { get; private set; }
    public string Fingerprint { get; private set; } = "";
    public string SnapshotJson { get; private set; } = "";
    public string FiledByIssuer { get; private set; } = "";
    public string FiledBySubject { get; private set; } = "";
    public DateTimeOffset RecordedAtUtc { get; private set; }
    public bool LockBooks { get; private set; }
}
