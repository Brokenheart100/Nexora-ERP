using System.Text.Json;

namespace Nexora.Finance.Application;

public sealed class ChartImportPreview
{
    private ChartImportPreview() { }
    public ChartImportPreview(BookAccess access, string mode, string format, string fileHash, long revision,
        IReadOnlyList<ImportedAccount> rows, DateTimeOffset now)
    {
        Id = Guid.CreateVersion7();
        TenantId = access.Scope.TenantId;
        WorkspaceId = access.Scope.WorkspaceId;
        Issuer = access.Actor.Issuer;
        Subject = access.Actor.Subject;
        Mode = mode;
        Format = format;
        FileHash = fileHash;
        ChartRevision = revision;
        RowsJson = JsonSerializer.Serialize(rows);
        ExpiresAtUtc = now.AddMinutes(20);
    }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public string Issuer { get; private set; } = "";
    public string Subject { get; private set; } = "";
    public string Mode { get; private set; } = "";
    public string Format { get; private set; } = "";
    public string FileHash { get; private set; } = "";
    public long ChartRevision { get; private set; }
    public string RowsJson { get; private set; } = "";
    public DateTimeOffset ExpiresAtUtc { get; private set; }
    public long? CommittedRevision { get; private set; }

    public IReadOnlyList<ImportedAccount> ReadRows() => JsonSerializer.Deserialize<ImportedAccount[]>(RowsJson)!;
    public void Complete(long revision) => CommittedRevision = revision;
}
