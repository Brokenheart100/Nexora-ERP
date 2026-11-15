namespace Nexora.Inventory.Domain;

public sealed class Warehouse
{
    private Warehouse() { }
    public Warehouse(Guid tenantId, Guid workspaceId, string code, string name)
    {
        Id = Guid.CreateVersion7();
        TenantId = tenantId;
        WorkspaceId = workspaceId;
        Code = code?.Trim().ToUpperInvariant() ?? "";
        Name = name?.Trim() ?? "";
        if (Code.Length is < 1 or > 40 || Code.Any(x => !char.IsAsciiLetterOrDigit(x) && x is not ('-' or '_'))
            || Name.Length is < 1 or > 160) throw new ArgumentException("Invalid warehouse code or name.");
    }
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public string Code { get; private set; } = "";
    public string Name { get; private set; } = "";
    public Guid? ReceiverId { get; private set; }
    public long Version { get; private set; } = 1;
    public void Assign(Guid? receiver)
    {
        ReceiverId = receiver;
        Version++;
    }
}
