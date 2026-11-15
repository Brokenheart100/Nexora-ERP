using Nexora.Organization.Domain;

namespace Nexora.Tests;

public sealed class CustomRolePolicyTests
{
    private static readonly IdentityReference Owner = new("https://id.example/erp", "alice");
    private static readonly IdentityReference Reviewer = new(Owner.Issuer, "bob");
    private static readonly IdentityReference SecondReviewer = new(Owner.Issuer, "carol");
    private static readonly IdentityReference Operator = new(Owner.Issuer, "dave");
    private static readonly DateTimeOffset Now = new(2026, 11, 15, 0, 0, 0, TimeSpan.Zero);
    private static readonly string Hash = new('a', 64);

    private static (Workspace Workspace, WorkspaceMember Operator) NewWorkspace()
    {
        var workspace = Workspace.Open(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), "测试商贸", Owner, Now);
        AddMember(workspace, Reviewer, "bob@example.com", GovernanceRoles.Owner);
        AddMember(workspace, SecondReviewer, "carol@example.com", GovernanceRoles.Owner);
        return (workspace, AddMember(workspace, Operator, "dave@example.com", GovernanceRoles.Reader));
    }

    private static WorkspaceMember AddMember(Workspace workspace, IdentityReference identity, string email, string role)
    {
        var invitation = workspace.Invite(Owner, Guid.NewGuid(), new(email), role, Hash, Now);
        return workspace.AcceptInvitation(invitation.Id, Hash, identity, new(email), Now);
    }

    private static WorkspaceCustomRole LedgerRole(Workspace workspace, params string[] permissions) =>
        workspace.SaveCustomRole(Owner, null, "财务期间角色", permissions);

    [Fact]
    public void Financial_period_grants_require_an_explicit_bounded_date_range()
    {
        var (workspace, member) = NewWorkspace();
        var role = LedgerRole(workspace, WorkspacePermissions.LedgerRead);
        Assert.Throws<ArgumentException>(() => workspace.RequestCustomRole(Owner, member.Id, role.Id, role.Revision,
            CustomRolePolicy.Period, null, null, null, 1, Now));
        Assert.Throws<ArgumentException>(() => workspace.RequestCustomRole(Owner, member.Id, role.Id, role.Revision,
            CustomRolePolicy.Period, null, new DateOnly(2026, 1, 1), new DateOnly(2031, 1, 1), 1, Now));
        Assert.Throws<ArgumentException>(() => workspace.RequestCustomRole(Owner, member.Id, role.Id, role.Revision,
            CustomRolePolicy.Period, null, new DateOnly(2027, 1, 1), new DateOnly(2026, 1, 1), 1, Now));
        Assert.Throws<ArgumentException>(() => workspace.RequestCustomRole(Owner, member.Id, role.Id, role.Revision,
            CustomRolePolicy.Period, null, new DateOnly(2020, 1, 1), new DateOnly(2026, 1, 1), 1, Now));

        var grant = workspace.RequestCustomRole(Owner, member.Id, role.Id, role.Revision, CustomRolePolicy.Period,
            null, new DateOnly(2026, 1, 1), new DateOnly(2026, 12, 31), 1, Now);
        Assert.Equal(new DateOnly(2026, 1, 1), grant.StartsOn);
        Assert.Equal(new DateOnly(2026, 12, 31), grant.EndsOn);
        Assert.Equal(0, grant.ApprovalCount);
        Assert.Equal("Pending", grant.State);
    }

    [Fact]
    public void Period_scope_rejects_unsupported_permissions_and_company_grants_reject_dates()
    {
        var (workspace, member) = NewWorkspace();
        var purchasing = workspace.SaveCustomRole(Owner, null, "采购角色", [WorkspacePermissions.PurchaseRead]);
        Assert.Throws<ArgumentException>(() => workspace.RequestCustomRole(Owner, member.Id, purchasing.Id,
            purchasing.Revision, CustomRolePolicy.Period, null, new DateOnly(2026, 1, 1), new DateOnly(2026, 12, 31), 1, Now));

        var ledger = LedgerRole(workspace, WorkspacePermissions.LedgerRead);
        Assert.Throws<ArgumentException>(() => workspace.RequestCustomRole(Owner, member.Id, ledger.Id,
            ledger.Revision, CustomRolePolicy.Company, null, new DateOnly(2026, 1, 1), new DateOnly(2026, 12, 31), 1, Now));
    }

    [Fact]
    public void Single_approval_activates_the_grant_and_dual_approval_requires_a_second_owner()
    {
        var (workspace, member) = NewWorkspace();
        var role = LedgerRole(workspace, WorkspacePermissions.LedgerRead);

        var single = workspace.RequestCustomRole(Owner, member.Id, role.Id, role.Revision, CustomRolePolicy.Period,
            null, new DateOnly(2026, 1, 1), new DateOnly(2026, 12, 31), 1, Now);
        workspace.ApproveCustomRole(Reviewer, single, Now);
        Assert.Equal("Active", single.State);
        Assert.Equal(1, single.ApprovalCount);
        Assert.Equal(1, single.RequiredApprovals);

        var dual = workspace.RequestCustomRole(Owner, member.Id, role.Id, role.Revision, CustomRolePolicy.Company,
            null, null, null, 2, Now);
        workspace.ApproveCustomRole(Reviewer, dual, Now);
        Assert.Equal(1, dual.ApprovalCount);
        Assert.Equal("Pending", dual.State);
        Assert.Throws<GovernanceAccessException>(() => workspace.ApproveCustomRole(Reviewer, dual, Now));
        workspace.ApproveCustomRole(SecondReviewer, dual, Now);
        Assert.Equal(2, dual.ApprovalCount);
        Assert.Equal("Active", dual.State);
    }

    [Fact]
    public void Role_grant_approval_policy_is_bounded_to_one_or_two_owners()
    {
        var (workspace, member) = NewWorkspace();
        var role = LedgerRole(workspace, WorkspacePermissions.LedgerRead);
        Assert.Throws<ArgumentException>(() => workspace.RequestCustomRole(Owner, member.Id, role.Id, role.Revision,
            CustomRolePolicy.Company, null, null, null, 3, Now));
        Assert.Throws<ArgumentException>(() => workspace.RequestCustomRole(Owner, member.Id, role.Id, role.Revision,
            CustomRolePolicy.Company, null, null, null, 0, Now));

        var preferences = new WorkspacePreferences(Guid.NewGuid(), Guid.NewGuid());
        Assert.Equal(1, preferences.RoleGrantApprovals);
        Assert.Throws<ArgumentException>(() => preferences.Revise(Presentation(), roleGrantApprovals: 3));
        preferences.Revise(Presentation(), roleGrantApprovals: 2);
        Assert.Equal(2, preferences.RoleGrantApprovals);
        preferences.Revise(Presentation());
        Assert.Equal(2, preferences.RoleGrantApprovals);
    }

    private static CompanyPresentation Presentation() => new("测试商贸", "测试商贸", "#274580", "yyyy-MM-dd", "Asia/Shanghai", null);
}
