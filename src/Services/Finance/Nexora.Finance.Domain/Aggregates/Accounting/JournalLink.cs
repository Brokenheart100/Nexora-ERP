namespace Nexora.Finance.Domain;

public static class JournalLinkKinds
{
    public const string Related = "related";
    public const string Adjustment = "adjustment";
    public const string Settlement = "settlement";
    public static readonly string[] All = [Related, Adjustment, Settlement];

    public static string Parse(string? value)
    {
        var kind = value?.Trim().ToLowerInvariant() ?? "";
        return All.Contains(kind) ? kind : throw new ArgumentException("Unknown journal link kind.");
    }
}

public sealed class JournalLink
{
    private JournalLink() { }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public Guid FromJournalId { get; private set; }
    public Guid ToJournalId { get; private set; }
    public string Kind { get; private set; } = JournalLinkKinds.Related;
    public string Memo { get; private set; } = "";
    public string CreatedByIssuer { get; private set; } = "";
    public string CreatedBySubject { get; private set; } = "";
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public long Version { get; private set; } = 1;

    public static JournalLink Create(Guid tenantId, Guid workspaceId, Guid fromJournalId, Guid toJournalId,
        string kind, string? memo, JournalActor creator, DateTimeOffset now)
    {
        if (fromJournalId == Guid.Empty || toJournalId == Guid.Empty) throw new ArgumentException("Both journal identifiers are required.");
        if (fromJournalId == toJournalId) throw new LedgerRuleException("A journal cannot be linked to itself.");
        var note = memo?.Trim() ?? "";
        if (note.Length > 300) throw new ArgumentException("A link note of up to 300 characters is allowed.");
        return new()
        {
            Id = Guid.CreateVersion7(), TenantId = tenantId, WorkspaceId = workspaceId,
            FromJournalId = fromJournalId, ToJournalId = toJournalId, Kind = JournalLinkKinds.Parse(kind),
            Memo = note, CreatedByIssuer = creator.Issuer, CreatedBySubject = creator.Subject,
            CreatedAtUtc = now.ToUniversalTime()
        };
    }
}
