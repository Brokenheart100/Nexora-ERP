using Nexora.ServiceDefaults.Http;
using FluentValidation;
using Microsoft.AspNetCore.Authorization;
using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Application;
using Nexora.Organization.Domain;
using Wolverine;
using Wolverine.Http;
using Microsoft.AspNetCore.RateLimiting;

namespace Nexora.Organization.Api;

public static class GovernanceEndpoints
{
    [Authorize, WolverineGet("/api/workspaces/{id:guid}/access")]
    public static Task<AccessView> Access(Guid id, GovernanceUseCases useCases, ICurrentActor actor, CancellationToken cancellationToken) =>
        useCases.AccessAsync(id, actor.GetRequired(), cancellationToken);

    [Authorize, WolverineGet("/api/workspaces/{id:guid}/authorization/{permission}")]
    public static async Task<IResult> Check(Guid id, string permission, GovernanceUseCases useCases, IApplicationAuthorization authorization,
        ICurrentActor actor, CancellationToken cancellationToken)
    {
        var current = actor.GetRequired(); var access = await useCases.AccessAsync(id, current, cancellationToken);
        var decision = await authorization.CheckAsync(current, new(access.TenantId, id), permission, cancellationToken);
        return decision.Allowed ? Results.Ok(access) : Results.Forbid();
    }

    [RequireWorkspacePermission(WorkspacePermissions.MembersRead), WolverineGet("/api/workspaces/{id:guid}/members")]
    public static Task<IReadOnlyList<MemberView>> Members(Guid id, GovernanceUseCases useCases, ICurrentActor actor, CancellationToken cancellationToken) =>
        useCases.MembersAsync(id, actor.GetRequired(), cancellationToken);

    [RequireWorkspacePermission(WorkspacePermissions.Assign), WolverineGet("/api/workspaces/{id:guid}/roles")]
    public static IReadOnlyList<RoleView> Roles() => new[] { GovernanceRoles.Owner, GovernanceRoles.Administrator, GovernanceRoles.Reader }
        .Select(role => new RoleView(role, null, WorkspacePermissions.All.Where(p => WorkspacePermissions.Allows(role, p)).ToArray()))
        .Concat(ExecutionRoles.All.Select(role => new RoleView(role, ExecutionRoles.AreaOf(role).ToString(),
            WorkspacePermissions.All.Where(p => ExecutionRoles.Allows(role, p)).ToArray()))).ToArray();

    [RequireWorkspacePermission(WorkspacePermissions.Invite), WolverineGet("/api/workspaces/{id:guid}/invitations")]
    public static Task<IReadOnlyList<InvitationView>> Invitations(Guid id, GovernanceUseCases useCases, ICurrentActor actor, CancellationToken cancellationToken) =>
        useCases.InvitationsAsync(id, actor.GetRequired(), cancellationToken);

    [IdempotentWrite]
    [RequireWorkspacePermission(WorkspacePermissions.Invite), WolverinePost("/api/workspaces/{id:guid}/invitations")]
    public static async Task<InvitationCreatedResult> Invite(Guid id, InviteMemberRequest request, ICurrentActor actor,
        IMessageBus bus, IWorkspaceInvitationMail mail, CancellationToken cancellationToken)
    {
        var invitation = await bus.InvokeAsync<InvitationCreatedResult>(new CreateInvitation(id, request.ExpectedVersion,
            request.OperationId, request.Email, request.Role, actor.GetRequired(), request.BusinessRoles), cancellationToken);
        return invitation.Token.Length == 0 ? invitation : invitation with { MailStatus = await mail.SendAsync(invitation, cancellationToken) };
    }

    [RequireWorkspacePermission(WorkspacePermissions.BusinessRolesManage), WolverinePost("/api/workspaces/{id:guid}/invitations/{invitationId:guid}/approve")]
    public static async Task<InvitationCreatedResult> ApproveInvitation(Guid id, Guid invitationId, ApproveInvitationRequest request,
        ICurrentActor actor, IMessageBus bus, IWorkspaceInvitationMail mail, CancellationToken ct)
    {
        var invitation = await bus.InvokeAsync<InvitationCreatedResult>(
            new ApproveWorkspaceInvitation(id, request.ExpectedVersion, invitationId, actor.GetRequired()), ct);
        return invitation with { MailStatus = await mail.SendAsync(invitation, ct) };
    }

    [RequireWorkspacePermission(WorkspacePermissions.BusinessRolesManage), WolverinePost("/api/workspaces/{id:guid}/members/{memberId:guid}/business-roles")]
    public static Task<GovernanceMutationResult> ChangeBusinessRoles(Guid id, Guid memberId, ChangeBusinessRolesRequest request,
        ICurrentActor actor, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<GovernanceMutationResult>(new ChangeMemberBusinessRoles(id, request.ExpectedVersion, memberId,
            request.Action, request.BusinessRoles, actor.GetRequired()), ct);
    [Authorize, EnableRateLimiting("invitation-redemption"), WolverinePost("/api/invitations/{invitationId:guid}/redeem")]
    public static Task<GovernanceMutationResult> Redeem(Guid invitationId, RedeemInvitationRequest request, ICurrentActor actor, IMessageBus bus, CancellationToken cancellationToken) =>
        bus.InvokeAsync<GovernanceMutationResult>(new RedeemInvitation(invitationId, request.Token, actor.GetRequired()), cancellationToken);

    [RequireWorkspacePermission(WorkspacePermissions.Assign), WolverinePost("/api/workspaces/{id:guid}/members/{memberId:guid}")]
    public static Task<GovernanceMutationResult> Change(Guid id, Guid memberId, ChangeMemberRequest request, ICurrentActor actor, IMessageBus bus, CancellationToken cancellationToken) =>
        bus.InvokeAsync<GovernanceMutationResult>(new ChangeWorkspaceMember(id, request.ExpectedVersion, memberId, request.Role, request.IsActive!.Value, actor.GetRequired()), cancellationToken);

    [Authorize, WolverinePost("/api/workspaces/{id:guid}/members/{memberId:guid}/finance-role")]
    public static Task<GovernanceMutationResult> ChangeFinanceRole(Guid id, Guid memberId, ChangeExecutionRoleRequest request, ICurrentActor actor, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<GovernanceMutationResult>(new ChangeMemberExecutionRole(id, request.ExpectedVersion, memberId,
            ExecutionRoleArea.Finance, request.Action, request.Role, actor.GetRequired()), ct);

    [Authorize, WolverinePost("/api/workspaces/{id:guid}/members/{memberId:guid}/sales-role")]
    public static Task<GovernanceMutationResult> ChangeSalesRole(Guid id, Guid memberId, ChangeExecutionRoleRequest request, ICurrentActor actor, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<GovernanceMutationResult>(new ChangeMemberExecutionRole(id, request.ExpectedVersion, memberId,
            ExecutionRoleArea.Sales, request.Action, request.Role, actor.GetRequired()), ct);

    [Authorize, WolverinePost("/api/workspaces/{id:guid}/members/{memberId:guid}/purchase-role")]
    public static Task<GovernanceMutationResult> ChangePurchaseRole(Guid id, Guid memberId, ChangeExecutionRoleRequest request, ICurrentActor actor, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<GovernanceMutationResult>(new ChangeMemberExecutionRole(id, request.ExpectedVersion, memberId,
            ExecutionRoleArea.Purchasing, request.Action, request.Role, actor.GetRequired()), ct);

    [RequireWorkspacePermission(WorkspacePermissions.Revoke), WolverinePost("/api/workspaces/{id:guid}/invitations/{invitationId:guid}/revoke")]
    public static Task<GovernanceMutationResult> Revoke(Guid id, Guid invitationId, RevokeInvitationRequest request, ICurrentActor actor, IMessageBus bus, CancellationToken cancellationToken) =>
        bus.InvokeAsync<GovernanceMutationResult>(new RevokeWorkspaceInvitation(id, request.ExpectedVersion, invitationId, actor.GetRequired()), cancellationToken);

    [Authorize, WolverineGet("/api/me")]
    public static async Task<IResult> Account(ICurrentActor actor, IUserAccountRepository accounts, CancellationToken cancellationToken)
    {
        var current = actor.GetRequired(); var account = await accounts.FindAsync(new(current.Issuer, current.Subject), cancellationToken);
        return account is null ? Results.NotFound() : Results.Ok(new { account.Id, account.Issuer, account.Subject, account.VerifiedEmail, account.IsActive });
    }
}
