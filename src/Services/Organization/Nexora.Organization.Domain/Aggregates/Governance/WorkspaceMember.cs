namespace Nexora.Organization.Domain;

public sealed class WorkspaceMember
{
    public Guid Id { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public string Issuer { get; private set; } = "";
    public string Subject { get; private set; } = "";
    public string Role { get; private set; } = "";
    public string? FinanceRole { get; private set; }
    public string? PurchaseRole { get; private set; }
    public string? SalesRole { get; private set; }
    public string? ProposedRole { get; private set; }
    public string[]? ProposedBusinessRoles { get; private set; }
    public Guid? RoleProposerId { get; private set; }
    public long? RoleProposalVersion { get; private set; }
    public DateTimeOffset? RoleProposalExpiresAtUtc { get; private set; }
    public bool IsActive { get; private set; }
    public DateTimeOffset JoinedAtUtc { get; private set; }
    private WorkspaceMember() { }
    internal static WorkspaceMember Join(Guid workspaceId, IdentityReference identity, string role, DateTimeOffset now) => new()
    { Id = Guid.CreateVersion7(), WorkspaceId = workspaceId, Issuer = identity.Issuer, Subject = identity.Subject, Role = role, IsActive = true, JoinedAtUtc = now.ToUniversalTime() };
    public bool Matches(IdentityReference identity) => Issuer == identity.Issuer && Subject == identity.Subject;
    internal void Change(string role, bool active)
    {
        Role = role;
        IsActive = active;
        FinanceRole = PurchaseRole = SalesRole = null;
        ClearProposal();
    }
    private void SetRole(ExecutionRoleArea area, string? role)
    {
        switch (area)
        {
            case ExecutionRoleArea.Finance: FinanceRole = role; break;
            case ExecutionRoleArea.Purchasing: PurchaseRole = role; break;
            case ExecutionRoleArea.Sales: SalesRole = role; break;
            default: throw new ArgumentOutOfRangeException(nameof(area));
        }
    }

    internal string? RoleFor(ExecutionRoleArea area) => area switch
    {
        ExecutionRoleArea.Finance => FinanceRole,
        ExecutionRoleArea.Purchasing => PurchaseRole,
        ExecutionRoleArea.Sales => SalesRole,
        _ => throw new ArgumentOutOfRangeException(nameof(area))
    };
    internal void ProposeRole(string role, Guid proposerId, long version, DateTimeOffset now)
    {
        ProposedRole = role;
        SetProposal(proposerId, version, now);
    }
    internal void ProposeBusinessRoles(string[] roles, Guid proposerId, long version, DateTimeOffset now)
    {
        ProposedRole = null;
        ProposedBusinessRoles = roles;
        SetProposal(proposerId, version, now);
    }
    private void SetProposal(Guid proposerId, long version, DateTimeOffset now)
    {
        RoleProposerId = proposerId;
        RoleProposalVersion = version;
        RoleProposalExpiresAtUtc = now.AddHours(24);
    }
    internal void ConfirmRole(ExecutionRoleArea area)
    {
        SetRole(area, ProposedRole);
        ClearProposal();
    }
    internal void RevokeRole(ExecutionRoleArea area)
    {
        SetRole(area, null);
        if (ExecutionRoles.Known(area, ProposedRole)) ClearProposal();
    }
    internal void ApplyBusinessRoles(IReadOnlyList<string> roles)
    {
        foreach (var area in Enum.GetValues<ExecutionRoleArea>())
            SetRole(area, roles.SingleOrDefault(role => ExecutionRoles.Known(area, role)));
        ClearProposal();
    }
    internal void ClearProposal()
    {
        ProposedRole = null;
        ProposedBusinessRoles = null;
        RoleProposerId = null;
        RoleProposalVersion = null;
        RoleProposalExpiresAtUtc = null;
    }
}
