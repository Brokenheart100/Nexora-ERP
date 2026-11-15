namespace Nexora.Organization.Domain;

public sealed class WorkspaceNavigationLink
{
    private WorkspaceNavigationLink() { }

    public WorkspaceNavigationLink(Workspace personal, Workspace company, IdentityReference actor)
    {
        if (!personal.IsPersonal || company.IsPersonal || !personal.IsOwnedBy(actor) || !company.IsOwnedBy(actor))
            throw new GovernanceAccessException();
        PersonalWorkspaceId = personal.Id;
        CompanyWorkspaceId = company.Id;
        Issuer = actor.Issuer;
        Subject = actor.Subject;
        IsActive = true;
        Version = 1;
    }

    public Guid PersonalWorkspaceId { get; private set; }
    public Guid CompanyWorkspaceId { get; private set; }
    public string Issuer { get; private set; } = "";
    public string Subject { get; private set; } = "";
    public bool IsActive { get; private set; }
    public long Version { get; private set; }

    public bool SetActive(bool active)
    {
        if (IsActive == active) return false;
        IsActive = active;
        Version++;
        return true;
    }
}
