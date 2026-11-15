namespace Nexora.Organization.Domain;

public sealed class WorkspaceRoleGrant
{
    public Guid Id { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public Guid MemberId { get; private set; }
    public Guid RoleId { get; private set; }
    public long RoleRevision { get; private set; }
    public string[] Permissions { get; private set; } = [];
    public string Scope { get; private set; } = "";
    public Guid? ScopeId { get; private set; }
    public DateOnly? StartsOn { get; private set; }
    public DateOnly? EndsOn { get; private set; }
    public int RequiredApprovals { get; private set; } = 1;
    public int ApprovalCount { get; private set; }
    public Guid RequestedBy { get; private set; }
    public Guid? FirstApprovedBy { get; private set; }
    public Guid? ApprovedBy { get; private set; }
    public DateTimeOffset ExpiresAtUtc { get; private set; }
    public string State { get; private set; } = "Pending";

    private WorkspaceRoleGrant() { }

    internal WorkspaceRoleGrant(Guid workspaceId, Guid memberId, WorkspaceCustomRole role, string scope,
        Guid? scopeId, DateOnly? startsOn, DateOnly? endsOn, int requiredApprovals, Guid requestedBy, DateTimeOffset now)
    {
        if (requiredApprovals is < 1 or > 2)
            throw new ArgumentException("Role grants require one or two owner approvals.");
        Id = Guid.CreateVersion7();
        WorkspaceId = workspaceId;
        MemberId = memberId;
        RoleId = role.Id;
        RoleRevision = role.Revision;
        Permissions = [..role.Permissions];
        Scope = scope;
        ScopeId = scopeId;
        StartsOn = startsOn;
        EndsOn = endsOn;
        RequiredApprovals = requiredApprovals;
        RequestedBy = requestedBy;
        ExpiresAtUtc = now.AddHours(24);
    }

    internal bool Approve(Guid approver)
    {
        if (State != "Pending")
            throw new GovernanceRuleException("The role request is no longer current.");
        if (RequiredApprovals == 1)
        {
            ApprovalCount = 1;
            ApprovedBy = approver;
            State = "Active";
            return true;
        }
        if (ApprovalCount == 0)
        {
            ApprovalCount = 1;
            FirstApprovedBy = approver;
            return false;
        }
        if (FirstApprovedBy == approver)
            throw new GovernanceAccessException();
        ApprovalCount = 2;
        ApprovedBy = approver;
        State = "Active";
        return true;
    }

    internal void Revoke() => State = "Revoked";
}
