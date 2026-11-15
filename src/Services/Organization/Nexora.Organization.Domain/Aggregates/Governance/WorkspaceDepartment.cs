namespace Nexora.Organization.Domain;

public sealed class WorkspaceDepartment
{
    public Guid Id { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public string Name { get; private set; } = "";

    private WorkspaceDepartment() { }

    internal WorkspaceDepartment(Guid workspaceId, string name)
    {
        Id = Guid.CreateVersion7();
        WorkspaceId = workspaceId;
        Name = name;
    }
}
