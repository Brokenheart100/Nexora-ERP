namespace Nexora.Finance.Domain;

public sealed class ReportExport
{
    private ReportExport() { }

    public ReportExport(Guid tenantId, Guid workspaceId, JournalActor requester, string kind, long watermark,
        string snapshot, DateTimeOffset requestedAtUtc)
    {
        Id = Guid.CreateVersion7();
        TenantId = tenantId;
        WorkspaceId = workspaceId;
        Issuer = requester.Issuer;
        Subject = requester.Subject;
        Kind = kind;
        Watermark = watermark;
        Snapshot = snapshot;
        RequestedAtUtc = requestedAtUtc;
    }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public string Issuer { get; private set; } = "";
    public string Subject { get; private set; } = "";
    public string Kind { get; private set; } = "";
    public long Watermark { get; private set; }
    public string Snapshot { get; private set; } = "";
    public DateTimeOffset RequestedAtUtc { get; private set; }
    public DateTimeOffset? CompletedAtUtc { get; private set; }
    public byte[]? File { get; private set; }

    public void Complete(byte[] file, DateTimeOffset now)
    {
        if (CompletedAtUtc is not null) return;
        File = file;
        CompletedAtUtc = now;
    }
}
