using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Domain;

namespace Nexora.Organization.Application;

public sealed class GovernanceUseCases(IWorkspaceRepository workspaces, AccountMapping accounts,
    IApplicationAuthorization authorization, IInvitationTokens tokens, TimeProvider clock,
    IBillingRepository billing, IBillingCounters counters, BillingEntitlements entitlements)
{
    public async Task<GovernanceOutcome<InvitationCreatedResult>> InviteAsync(CreateInvitation command, CancellationToken cancellationToken)
    {
        var workspace = await AuthorizedAsync(command.WorkspaceId, command.Actor, WorkspacePermissions.Invite, cancellationToken);
        CheckVersion(workspace, command.ExpectedVersion);
        await EnforceSeatQuotaAsync(workspace, cancellationToken);
        var (token, hash) = tokens.Create();
        var invitation = workspace.Invite(Identity(command.Actor), command.OperationId, new(command.Email), command.Role, hash,
            clock.GetUtcNow(), command.BusinessRoles);
        var pending = invitation.State == "PendingApproval";
        return new(new(View(workspace, invitation, clock.GetUtcNow()), pending ? "" : token, workspace.Version),
            workspace.TenantId, workspace.Id, workspace.Version, pending ? "invitation.approval.requested" : "invitation.issued", invitation.Id);
    }

    public async Task<GovernanceOutcome<InvitationCreatedResult>> ApproveInvitationAsync(ApproveWorkspaceInvitation command, CancellationToken ct)
    {
        var workspace = await AuthorizedAsync(command.WorkspaceId, command.Actor, WorkspacePermissions.Invite, ct);
        CheckVersion(workspace, command.ExpectedVersion);
        var pending = workspace.Invitations.SingleOrDefault(x => x.Id == command.InvitationId) ?? throw new ResourceNotFoundException();
        await authorization.DemandAsync(new(pending.InviterIssuer, pending.InviterSubject), new(workspace.TenantId, workspace.Id),
            WorkspacePermissions.Invite, ct);
        var (token, hash) = tokens.Create();
        var invitation = workspace.ApproveInvitation(Identity(command.Actor), command.InvitationId, hash, clock.GetUtcNow());
        return new(new(View(workspace, invitation, clock.GetUtcNow()), token, workspace.Version),
            workspace.TenantId, workspace.Id, workspace.Version, "invitation.approved", invitation.Id);
    }

    public async Task<GovernanceOutcome<GovernanceMutationResult>> RedeemAsync(RedeemInvitation command, CancellationToken cancellationToken)
    {
        // Only signed, verified claims may establish the invitation binding. Email never identifies an existing account.
        if (!command.Actor.EmailVerified || string.IsNullOrWhiteSpace(command.Actor.Email)) throw new AccessDeniedException();
        var hash = tokens.Hash(command.Token);
        var workspace = await workspaces.FindInvitationAsync(command.InvitationId, cancellationToken) ?? throw new ResourceNotFoundException();
        var invitation = workspace.Invitations.Single(x => x.Id == command.InvitationId);
        await authorization.DemandAsync(new(invitation.InviterIssuer, invitation.InviterSubject), new(workspace.TenantId, workspace.Id), WorkspacePermissions.Invite, cancellationToken);
        if (invitation.ApproverMemberId is { } approverId)
            await DemandOwnerAsync(workspace, approverId, cancellationToken);
        await accounts.EnsureAsync(command.Actor, cancellationToken);
        var member = workspace.AcceptInvitation(command.InvitationId, hash, Identity(command.Actor), new(command.Actor.Email), clock.GetUtcNow());
        return new(new(workspace.Id, workspace.Version), workspace.TenantId, workspace.Id, workspace.Version, "invitation.redeemed", member.Id);
    }

    public async Task<GovernanceOutcome<GovernanceMutationResult>> ChangeAsync(ChangeWorkspaceMember command, CancellationToken cancellationToken)
    {
        var workspace = await AuthorizedAsync(command.WorkspaceId, command.Actor, WorkspacePermissions.Assign, cancellationToken);
        CheckVersion(workspace, command.ExpectedVersion);
        var previous = workspace.Version;
        workspace.ChangeMember(Identity(command.Actor), command.MemberId, command.Role, command.IsActive);
        return new(new(workspace.Id, workspace.Version), workspace.TenantId, workspace.Id, workspace.Version,
            "membership.changed", command.MemberId, previous != workspace.Version);
    }

    public async Task<GovernanceOutcome<GovernanceMutationResult>> RevokeAsync(RevokeWorkspaceInvitation command, CancellationToken cancellationToken)
    {
        var workspace = await AuthorizedAsync(command.WorkspaceId, command.Actor, WorkspacePermissions.Revoke, cancellationToken);
        CheckVersion(workspace, command.ExpectedVersion);
        var previous = workspace.Version;
        workspace.RevokeInvitation(Identity(command.Actor), command.InvitationId);
        return new(new(workspace.Id, workspace.Version), workspace.TenantId, workspace.Id, workspace.Version,
            "invitation.revoked", command.InvitationId, previous != workspace.Version);
    }

    public async Task<GovernanceOutcome<GovernanceMutationResult>> ExecutionRoleAsync(ChangeMemberExecutionRole command, CancellationToken ct)
    {
        var workspace = await AuthorizedAsync(command.WorkspaceId, command.Actor, ExecutionRoles.ManagePermission(command.Area), ct);
        CheckVersion(workspace, command.ExpectedVersion);
        var audit = workspace.ChangeExecutionRole(Identity(command.Actor), command.MemberId, command.Area, command.Action, command.Role, clock.GetUtcNow());
        return new(new(workspace.Id, workspace.Version), workspace.TenantId, workspace.Id, workspace.Version, audit, command.MemberId);
    }

    public async Task<GovernanceOutcome<GovernanceMutationResult>> BusinessRolesAsync(ChangeMemberBusinessRoles command, CancellationToken ct)
    {
        var workspace = await AuthorizedAsync(command.WorkspaceId, command.Actor, WorkspacePermissions.BusinessRolesManage, ct);
        CheckVersion(workspace, command.ExpectedVersion);
        if (command.Action == "approve" &&
            workspace.Members.SingleOrDefault(x => x.Id == command.MemberId)?.RoleProposerId is { } proposerId)
            await DemandOwnerAsync(workspace, proposerId, ct);
        var previous = workspace.Version;
        var audit = workspace.ChangeBusinessRoles(Identity(command.Actor), command.MemberId, command.Action, command.BusinessRoles, clock.GetUtcNow());
        return new(new(workspace.Id, workspace.Version), workspace.TenantId, workspace.Id, workspace.Version,
            audit, command.MemberId, previous != workspace.Version);
    }

    private async Task DemandOwnerAsync(Workspace workspace, Guid memberId, CancellationToken ct)
    {
        var member = workspace.Members.SingleOrDefault(x => x.Id == memberId && x.Role == GovernanceRoles.Owner && x.IsActive)
            ?? throw new AccessDeniedException();
        await authorization.DemandAsync(new(member.Issuer, member.Subject), new(workspace.TenantId, workspace.Id), WorkspacePermissions.Invite, ct);
    }

    public async Task<AccessView> AccessAsync(Guid id, ActorContext actor, CancellationToken cancellationToken)
    {
        var workspace = await AuthorizedAsync(id, actor, WorkspacePermissions.Read, cancellationToken);
        var identity = Identity(actor);
        var member = workspace.Members.Single(x => x.Matches(identity));
        var scoped = workspace.ActiveRoleGrants(member).Where(grant => grant.Scope != CustomRolePolicy.Company)
            .SelectMany(grant => grant.Permissions.Select(permission => new ScopedPermission(permission,
                grant.Scope == CustomRolePolicy.Department ? grant.ScopeId : null,
                grant.Scope == CustomRolePolicy.Warehouse ? grant.ScopeId : null,
                grant.Scope == CustomRolePolicy.Period ? grant.StartsOn : null,
                grant.Scope == CustomRolePolicy.Period ? grant.EndsOn : null))).Distinct().ToArray();
        return new(id, workspace.TenantId, workspace.Version, WorkspacePermissions.All.Where(p => workspace.AllowsGovernanceOperation(identity, p)).ToArray(),
            member.Role, workspace.IsPersonal, member.Id, scoped, workspace.Departments.Select(department => department.Id).ToArray());
    }
    public async Task<IReadOnlyList<MemberView>> MembersAsync(Guid id, ActorContext actor, CancellationToken cancellationToken)
    {
        await AuthorizedAsync(id, actor, WorkspacePermissions.MembersRead, cancellationToken);
        return await workspaces.ListMembersAsync(id, cancellationToken);
    }
    public async Task<IReadOnlyList<InvitationView>> InvitationsAsync(Guid id, ActorContext actor, CancellationToken cancellationToken)
    {
        var workspace = await AuthorizedAsync(id, actor, WorkspacePermissions.Invite, cancellationToken);
        var now = clock.GetUtcNow();
        return workspace.Invitations.Select(x => View(workspace, x, now)).ToArray();
    }
    private async Task EnforceSeatQuotaAsync(Workspace workspace, CancellationToken cancellationToken)
    {
        var subscription = await billing.FindSubscriptionAsync(BillingEntitlements.Owner(workspace), cancellationToken);
        var plan = entitlements.Effective(subscription, clock.GetUtcNow());
        var seats = await counters.CountWorkspaceSeatsAsync(workspace.Id, cancellationToken);
        entitlements.EnsureMemberQuota(plan, seats, 1);
    }
    private async Task<Workspace> AuthorizedAsync(Guid id, ActorContext actor, string permission, CancellationToken cancellationToken)
    {
        var workspace = await workspaces.FindAsync(id, cancellationToken) ?? throw new ResourceNotFoundException();
        await authorization.DemandAsync(actor, new(workspace.TenantId, id), permission, cancellationToken);
        return workspace;
    }
    private static IdentityReference Identity(ActorContext actor) => new(actor.Issuer, actor.Subject);
    private static void CheckVersion(Workspace workspace, long expected)
    { if (workspace.Version != expected) throw new BusinessConflictException("Authorization version changed; reload the workspace."); }
    private static InvitationView View(Workspace workspace, WorkspaceInvitation invitation, DateTimeOffset now) =>
        new(invitation.Id, invitation.Email, invitation.Role,
            (invitation.State is "Pending" or "PendingApproval") && invitation.ExpiresAtUtc <= now ? "Expired" : invitation.State,
            invitation.ExpiresAtUtc, invitation.BusinessRoles, workspace.Members.SingleOrDefault(x =>
                x.Issuer == invitation.InviterIssuer && x.Subject == invitation.InviterSubject)?.Id);
}
