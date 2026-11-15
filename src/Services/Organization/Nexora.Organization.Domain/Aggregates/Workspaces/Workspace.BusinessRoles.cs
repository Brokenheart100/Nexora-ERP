namespace Nexora.Organization.Domain;

public sealed partial class Workspace
{
    public WorkspaceInvitation ApproveInvitation(IdentityReference actor, Guid invitationId, string tokenHash, DateTimeOffset now)
    {
        var approver = RequireBusinessRoleOwner(actor);
        var invitation = Invitations.SingleOrDefault(x => x.Id == invitationId)
            ?? throw new GovernanceRuleException("Invitation does not belong to this workspace.");
        var inviter = new IdentityReference(invitation.InviterIssuer, invitation.InviterSubject);
        if (inviter == actor || !IsOwnedBy(inviter)) throw new GovernanceAccessException();
        if (invitation.State != "PendingApproval" || invitation.ExpiresAtUtc <= now)
            throw new GovernanceRuleException("No pending invitation is available for approval.");

        invitation.Approve(approver.Id, tokenHash, now);
        Version++;
        return invitation;
    }

    public string ChangeBusinessRoles(IdentityReference actor, Guid memberId, string action,
        IReadOnlyList<string>? roles, DateTimeOffset now)
    {
        var decisionMaker = RequireBusinessRoleOwner(actor);
        var target = Members.SingleOrDefault(x => x.Id == memberId && x.IsActive)
            ?? throw new GovernanceRuleException("An active member is required.");

        string audit;
        switch (action)
        {
            case "submit":
                if (roles is null) throw new ArgumentException("A business role selection is required.");
                var desired = ExecutionRoles.ValidateSelection(roles);
                var current = Enum.GetValues<ExecutionRoleArea>().Select(target.RoleFor).OfType<string>().ToArray();
                if (current.ToHashSet().SetEquals(desired)) return "business-roles.unchanged";

                if (desired.Except(current).Any())
                {
                    target.ProposeBusinessRoles(desired, decisionMaker.Id, Version + 1, now);
                    audit = "business-roles.requested";
                }
                else
                {
                    target.ApplyBusinessRoles(desired);
                    audit = "business-roles.revoked";
                }
                break;
            case "approve":
                if (target.RoleProposerId == decisionMaker.Id || target.Id == decisionMaker.Id)
                    throw new GovernanceAccessException();
                if (target.ProposedBusinessRoles is not { } proposed || target.RoleProposalVersion != Version ||
                    target.RoleProposalExpiresAtUtc <= now ||
                    !Members.Any(x => x.Id == target.RoleProposerId && x.IsActive && x.Role == GovernanceRoles.Owner))
                    throw new GovernanceRuleException("No current business role request is available.");
                target.ApplyBusinessRoles(proposed);
                audit = "business-roles.approved";
                break;
            case "cancel":
                if (target.ProposedBusinessRoles is null)
                    throw new GovernanceRuleException("No business role request is available.");
                target.ClearProposal();
                audit = "business-roles.cancelled";
                break;
            default:
                throw new ArgumentException("Unknown business role action.");
        }

        Version++;
        return audit;
    }

    private WorkspaceMember RequireBusinessRoleOwner(IdentityReference actor)
    {
        if (IsPersonal) throw new GovernanceRuleException("Personal workspaces are private.");
        return Members.SingleOrDefault(x => x.Matches(actor) && x.IsActive && x.Role == GovernanceRoles.Owner)
            ?? throw new GovernanceAccessException();
    }
}
