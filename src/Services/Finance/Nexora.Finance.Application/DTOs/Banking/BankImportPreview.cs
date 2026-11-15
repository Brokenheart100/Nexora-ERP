using System.Text.Json;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed class BankImportPreview
{
    private BankImportPreview() { }
    public BankImportPreview(BookAccess access, Guid bankId, string hash, StatementEntry[] entries, DateTimeOffset expiresAtUtc)
    {
        Id = Guid.CreateVersion7();
        TenantId = access.Scope.TenantId;
        WorkspaceId = access.Scope.WorkspaceId;
        BankId = bankId;
        Issuer = access.Actor.Issuer;
        Subject = access.Actor.Subject;
        FileHash = hash;
        Entries = JsonSerializer.Serialize(entries);
        ExpiresAtUtc = expiresAtUtc;
    }
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public Guid BankId { get; private set; }
    public string Issuer { get; private set; } = "";
    public string Subject { get; private set; } = "";
    public string FileHash { get; private set; } = "";
    public string Entries { get; private set; } = "";
    public DateTimeOffset ExpiresAtUtc { get; private set; }
    public int? CommittedCount { get; private set; }
    public StatementEntry[] Read() => JsonSerializer.Deserialize<StatementEntry[]>(Entries)!;
    public void Complete(int count) => CommittedCount = count;
}
