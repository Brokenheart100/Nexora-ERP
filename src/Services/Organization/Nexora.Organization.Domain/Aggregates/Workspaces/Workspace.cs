namespace Nexora.Organization.Domain;

public sealed partial class Workspace
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid OperationId { get; private set; }
    public string Name { get; private set; } = "";
    public string CountryCode { get; private set; } = "CN";
    public string BaseCurrency { get; private set; } = "CNY";
    public bool IsPersonal { get; private set; }
    public string OwnerIssuer { get; private set; } = "";
    public string OwnerSubject { get; private set; } = "";
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public long Version { get; private set; }
    private readonly List<WorkspaceMember> _members = [];
    private readonly List<WorkspaceInvitation> _invitations = [];
    public IReadOnlyCollection<WorkspaceMember> Members => _members.AsReadOnly();
    public IReadOnlyCollection<WorkspaceInvitation> Invitations => _invitations.AsReadOnly();

    private Workspace() { }

    public static Workspace Open(Guid tenantId, Guid workspaceId, Guid operationId,
        string name, IdentityReference owner, DateTimeOffset now, bool isPersonal = false)
    {
        if (tenantId == Guid.Empty || workspaceId == Guid.Empty || operationId == Guid.Empty)
            throw new ArgumentException("Workspace, tenant and operation identifiers are required.");
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        if (name.Trim().Length > 160) throw new ArgumentException("Workspace name exceeds 160 characters.");
        ArgumentNullException.ThrowIfNull(owner);
        var workspace = new Workspace
        {
            Id = workspaceId, TenantId = tenantId, OperationId = operationId, Name = name.Trim(),
            OwnerIssuer = owner.Issuer, OwnerSubject = owner.Subject, CreatedAtUtc = now.ToUniversalTime(), Version = 1,
            IsPersonal = isPersonal
        };
        workspace._members.Add(WorkspaceMember.Join(workspaceId, owner, GovernanceRoles.Owner, now));
        return workspace;
    }

    public bool IsOwnedBy(IdentityReference identity) => _members.Any(x => x.Matches(identity) && x.IsActive && x.Role == GovernanceRoles.Owner);

    // Execution permissions require a separately approved grant.
    public bool AllowsGovernanceOperation(IdentityReference identity, string permission) =>
        _members.Any(x => x.Matches(identity) && x.IsActive
            && (WorkspacePermissions.Allows(x.Role, permission) || FinanceRoles.Allows(x.FinanceRole, permission)
                || PurchaseRoles.Allows(x.PurchaseRole, permission) || SalesRoles.Allows(x.SalesRole, permission)
                || ActiveRoleGrants(x).Any(grant => grant.Scope == CustomRolePolicy.Company && grant.Permissions.Contains(permission))));

    public string ChangeExecutionRole(IdentityReference actor, Guid memberId, ExecutionRoleArea area, string action, string? role, DateTimeOffset now)
    {
        Require(actor, ExecutionRoles.ManagePermission(area));
        if (IsPersonal) throw new GovernanceRuleException("Personal workspaces do not grant shared execution roles.");
        var target = _members.SingleOrDefault(x => x.Id == memberId && x.IsActive)
            ?? throw new GovernanceRuleException("An active member is required.");
        var decisionMaker = _members.Single(x => x.Matches(actor) && x.IsActive);
        var proposed = ExecutionRoles.Known(area, target.ProposedRole) ? target.ProposedRole : null;
        string auditRole;
        switch (action)
        {
            case "propose":
                if (target.ProposedBusinessRoles is not null)
                    throw new GovernanceRuleException("Cancel the pending business role change first.");
                if (!ExecutionRoles.Known(area, role)) throw new ArgumentException("Unknown execution role.");
                if (target.RoleFor(area) is not null) throw new GovernanceRuleException("Revoke the current execution role first.");
                target.ProposeRole(role!, decisionMaker.Id, Version + 1, now);
                auditRole = role!;
                break;
            case "approve":
                if (target.RoleProposerId == decisionMaker.Id || target.Id == decisionMaker.Id)
                    throw new GovernanceAccessException();
                if (proposed is null || target.RoleProposalVersion != Version
                    || target.RoleProposalExpiresAtUtc <= now
                    || !_members.Any(x => x.Id == target.RoleProposerId && x.IsActive && x.Role == GovernanceRoles.Owner))
                    throw new GovernanceRuleException("No current execution role proposal is available.");
                auditRole = proposed;
                target.ConfirmRole(area);
                break;
            case "revoke":
                auditRole = target.RoleFor(area) ?? proposed
                    ?? throw new GovernanceRuleException("No execution role or proposal is present.");
                target.RevokeRole(area);
                break;
            default:
                throw new ArgumentException("Unknown execution role action.");
        }
        Version++;
        return $"{(area == ExecutionRoleArea.Finance ? "finance" : "purchase")}-role.{action}.{auditRole}";
    }

    public WorkspaceInvitation Invite(IdentityReference actor, Guid operationId, VerifiedEmail email, string role, string tokenHash, DateTimeOffset now,
        IReadOnlyList<string>? businessRoles = null)
    {
        Require(actor, WorkspacePermissions.Invite);
        if (IsPersonal) throw new GovernanceRuleException("Personal workspaces are private.");
        if (operationId == Guid.Empty || tokenHash.Length != 64 || !tokenHash.All(Uri.IsHexDigit)) throw new ArgumentException("Invalid invitation intent.");
        RequireGrant(actor, role);
        var selection = ExecutionRoles.ValidateSelection(businessRoles ?? []);
        if (selection.Length > 0 && !IsOwnedBy(actor)) throw new GovernanceAccessException();
        if (_invitations.Any(x => x.OperationId == operationId)) throw new GovernanceRuleException("Invitation intent already exists; revoke it before creating another link.");
        if (_invitations.Any(x => x.Email == email.Value && x.Issuer == actor.Issuer && x.IsOutstanding && x.ExpiresAtUtc > now))
            throw new GovernanceRuleException("An active invitation already exists.");
        var invitation = WorkspaceInvitation.Issue(Id, operationId, actor, email, role, tokenHash, now, selection);
        _invitations.Add(invitation); Version++;
        return invitation;
    }

    public WorkspaceMember AcceptInvitation(Guid invitationId, string tokenHash, IdentityReference actor, VerifiedEmail email, DateTimeOffset now)
    {
        var invitation = _invitations.SingleOrDefault(x => x.Id == invitationId);
        if (invitation is null || !System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(
            System.Text.Encoding.UTF8.GetBytes(invitation.TokenHash), System.Text.Encoding.UTF8.GetBytes(tokenHash))
            || invitation.Issuer != actor.Issuer || invitation.Email != email.Value)
            throw new GovernanceRuleException("Invitation cannot be redeemed.");
        if (invitation.State != "Pending" || invitation.ExpiresAtUtc <= now) throw new GovernanceRuleException("Invitation is expired, revoked or already consumed.");
        // Losing the right to grant also invalidates pending proposals; a stored invitation cannot preserve revoked authority.
        var inviter = new IdentityReference(invitation.InviterIssuer, invitation.InviterSubject);
        Require(inviter, WorkspacePermissions.Invite); RequireGrant(inviter, invitation.Role);
        if (invitation.BusinessRoles is { Length: > 0 } &&
            (!IsOwnedBy(inviter) || !_members.Any(x => x.Id == invitation.ApproverMemberId && x.IsActive && x.Role == GovernanceRoles.Owner)))
            throw new GovernanceAccessException();
        if (_members.Any(x => x.Matches(actor))) throw new GovernanceRuleException("Existing membership must be managed explicitly; an invitation cannot reactivate it.");
        var member = WorkspaceMember.Join(Id, actor, invitation.Role, now);
        if (invitation.BusinessRoles is { } roles) member.ApplyBusinessRoles(roles);
        _members.Add(member); invitation.Accept(actor.Subject); Version++;
        return member;
    }

    public void ChangeMember(IdentityReference actor, Guid memberId, string role, bool active)
    {
        Require(actor, WorkspacePermissions.Assign); Require(actor, WorkspacePermissions.Suspend);
        if (IsPersonal) throw new GovernanceRuleException("Personal workspaces are private.");
        RequireGrant(actor, role);
        var target = _members.SingleOrDefault(x => x.Id == memberId) ?? throw new GovernanceRuleException("Member does not belong to this workspace.");
        if (GovernanceRoles.IsAdministrator(target.Role) && !IsOwnedBy(actor)) throw new GovernanceAccessException();
        if (target.Role == role && target.IsActive == active) return;
        var otherOwners = _members.Count(x => x.Id != target.Id && x.IsActive && x.Role == GovernanceRoles.Owner);
        var otherAdmins = _members.Count(x => x.Id != target.Id && x.IsActive && GovernanceRoles.IsAdministrator(x.Role));
        if (target.IsActive && target.Role == GovernanceRoles.Owner && (!active || role != GovernanceRoles.Owner) && otherOwners == 0)
            throw new GovernanceRuleException("The last active owner cannot be suspended or demoted.");
        if ((!active || !GovernanceRoles.IsAdministrator(role)) && otherAdmins == 0 && target.IsActive && GovernanceRoles.IsAdministrator(target.Role))
            throw new GovernanceRuleException("The last active administrator cannot be removed.");
        target.Change(role, active);
        foreach (var grant in _roleGrants.Where(grant => grant.MemberId == target.Id && grant.State != "Revoked"))
            grant.Revoke();
        Version++;
    }

    public void RevokeInvitation(IdentityReference actor, Guid invitationId)
    {
        Require(actor, WorkspacePermissions.Revoke);
        var invitation = _invitations.SingleOrDefault(x => x.Id == invitationId) ?? throw new GovernanceRuleException("Invitation does not belong to this workspace.");
        if ((GovernanceRoles.IsAdministrator(invitation.Role) || invitation.BusinessRoles is { Length: > 0 }) && !IsOwnedBy(actor))
            throw new GovernanceAccessException();
        if (invitation.State == "Revoked") return;
        if (!invitation.IsOutstanding) throw new GovernanceRuleException("A consumed invitation cannot be revoked.");
        invitation.Revoke(); Version++;
    }

    private void Require(IdentityReference identity, string permission)
    { if (!AllowsGovernanceOperation(identity, permission)) throw new GovernanceAccessException(); }
    private void RequireGrant(IdentityReference actor, string role)
    {
        if (!GovernanceRoles.Known(role)) throw new ArgumentException("Unknown governance role.");
        if (GovernanceRoles.IsAdministrator(role) && !IsOwnedBy(actor)) throw new GovernanceAccessException();
    }
}
