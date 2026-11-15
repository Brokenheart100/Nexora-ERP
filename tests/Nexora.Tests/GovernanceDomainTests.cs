using Nexora.Organization.Domain;

namespace Nexora.Tests;

public sealed class GovernanceDomainTests
{
    private static readonly IdentityReference Alice = new("https://id.example/erp", "alice");
    private static readonly IdentityReference Bob = new(Alice.Issuer, "bob");
    private static readonly DateTimeOffset Now = new(2026, 11, 6, 0, 0, 0, TimeSpan.Zero);
    private static readonly string Hash = new('a', 64);
    private static Workspace NewWorkspace() => Workspace.Open(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), "测试商贸", Alice, Now);
    private static WorkspaceInvitation Invite(Workspace workspace, string role = GovernanceRoles.Reader) =>
        workspace.Invite(Alice, Guid.NewGuid(), new("Bob@example.com"), role, Hash, Now);

    [Fact]
    public void Governance_roles_never_grant_finance_or_unknown_operations()
    {
        foreach (var role in new[] { GovernanceRoles.Owner, GovernanceRoles.Administrator, GovernanceRoles.Reader })
        {
            Assert.False(WorkspacePermissions.Allows(role, "finance.journal.post"));
            Assert.False(WorkspacePermissions.Allows(role, "organization.members.magic"));
        }
        Assert.False(WorkspacePermissions.Allows("keycloak-admin", WorkspacePermissions.Assign));
    }

    [Theory]
    [InlineData("wrong-email")]
    [InlineData("wrong-issuer")]
    [InlineData("wrong-token")]
    [InlineData("expired")]
    public void Invitation_binding_rejects_invalid_recipient_token_and_expiry(string failure)
    {
        var workspace = NewWorkspace(); var invitation = Invite(workspace);
        var identity = failure == "wrong-issuer" ? new IdentityReference("https://another.example/erp", Bob.Subject) : Bob;
        Assert.Throws<GovernanceRuleException>(() => workspace.AcceptInvitation(invitation.Id,
            failure == "wrong-token" ? new('b', 64) : Hash, identity,
            new(failure == "wrong-email" ? "other@example.com" : "bob@example.com"),
            failure == "expired" ? Now.AddHours(24) : Now));
        Assert.Single(workspace.Members);
        Assert.Equal("Pending", invitation.State);
    }

    [Fact]
    public void Invitation_is_single_use_and_cannot_reactivate_suspended_members()
    {
        var workspace = NewWorkspace(); var invitation = Invite(workspace);
        var member = workspace.AcceptInvitation(invitation.Id, Hash, Bob, new("bob@example.com"), Now);
        Assert.Equal(3, workspace.Version);
        Assert.Throws<GovernanceRuleException>(() => workspace.AcceptInvitation(invitation.Id, Hash, Bob, new("bob@example.com"), Now));
        workspace.ChangeMember(Alice, member.Id, member.Role, false);
        var next = Invite(workspace);
        Assert.Throws<GovernanceRuleException>(() => workspace.AcceptInvitation(next.Id, Hash, Bob, new("bob@example.com"), Now));
        Assert.False(workspace.AllowsGovernanceOperation(Bob, WorkspacePermissions.Read));
    }

    [Fact]
    public void Revocation_duplicate_invites_and_last_owner_are_protected()
    {
        var workspace = NewWorkspace(); var invitation = Invite(workspace);
        Assert.Throws<GovernanceRuleException>(() => Invite(workspace));
        workspace.RevokeInvitation(Alice, invitation.Id);
        Assert.Throws<GovernanceRuleException>(() => workspace.AcceptInvitation(invitation.Id, Hash, Bob, new("bob@example.com"), Now));
        var owner = workspace.Members.Single(); var version = workspace.Version;
        Assert.Throws<GovernanceRuleException>(() => workspace.ChangeMember(Alice, owner.Id, GovernanceRoles.Reader, true));
        Assert.Throws<GovernanceRuleException>(() => workspace.ChangeMember(Alice, owner.Id, GovernanceRoles.Owner, false));
        Assert.Equal(version, workspace.Version);
    }

    [Fact]
    public void Administrators_cannot_promote_themselves_or_issue_administrative_grants()
    {
        var workspace = NewWorkspace(); var invitation = Invite(workspace, GovernanceRoles.Administrator);
        var admin = workspace.AcceptInvitation(invitation.Id, Hash, Bob, new("bob@example.com"), Now);
        Assert.Throws<GovernanceAccessException>(() => workspace.ChangeMember(Bob, admin.Id, GovernanceRoles.Owner, true));
        Assert.Throws<GovernanceAccessException>(() => workspace.Invite(Bob, Guid.NewGuid(), new("eve@example.com"), GovernanceRoles.Owner, Hash, Now));
        workspace.ChangeMember(Alice, admin.Id, GovernanceRoles.Reader, true);
        Assert.False(workspace.AllowsGovernanceOperation(Bob, WorkspacePermissions.Invite));
    }

    [Fact]
    public void Pending_invitation_does_not_preserve_the_inviters_revoked_authority()
    {
        var workspace = NewWorkspace(); var invitation = Invite(workspace, GovernanceRoles.Administrator);
        var admin = workspace.AcceptInvitation(invitation.Id, Hash, Bob, new("bob@example.com"), Now);
        var proposal = workspace.Invite(Bob, Guid.NewGuid(), new("eve@example.com"), GovernanceRoles.Reader, Hash, Now);
        workspace.ChangeMember(Alice, admin.Id, GovernanceRoles.Reader, true);
        Assert.Throws<GovernanceAccessException>(() => workspace.AcceptInvitation(proposal.Id, Hash,
            new(Alice.Issuer, "eve"), new("eve@example.com"), Now));
    }
}
