namespace Nexora.Organization.Domain;

public sealed class WorkspaceCustomRole
{
    public Guid Id { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public string Name { get; private set; } = "";
    public string[] Permissions { get; private set; } = [];
    public long Revision { get; private set; }

    private WorkspaceCustomRole() { }

    internal WorkspaceCustomRole(Guid workspaceId, string name, string[] permissions)
    {
        Id = Guid.CreateVersion7();
        WorkspaceId = workspaceId;
        Revise(name, permissions);
    }

    internal void Revise(string name, string[] permissions)
    {
        Name = name;
        Permissions = permissions;
        Revision++;
    }
}
