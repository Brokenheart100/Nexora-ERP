using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Application;
using Nexora.Organization.Contracts;
using Wolverine.Attributes;

namespace Nexora.Organization.Infrastructure.Messaging;

public static class GovernanceHandler
{
    [Transactional]
    public static async Task<(InvitationCreatedResult, WorkspaceAuthorizationChangedV1?)> Handle(CreateInvitation command,
        OrganizationDbContext db, GovernanceUseCases useCases, TimeProvider clock, CancellationToken cancellationToken) =>
        Commit(await useCases.InviteAsync(command, cancellationToken), command.Actor, db, clock);

    [Transactional]
    public static async Task<(InvitationCreatedResult, WorkspaceAuthorizationChangedV1?)> Handle(ApproveWorkspaceInvitation command,
        OrganizationDbContext db, GovernanceUseCases useCases, TimeProvider clock, CancellationToken ct) =>
        Commit(await useCases.ApproveInvitationAsync(command, ct), command.Actor, db, clock);

    [Transactional]
    public static async Task<(GovernanceMutationResult, WorkspaceAuthorizationChangedV1?)> Handle(ChangeMemberBusinessRoles command,
        OrganizationDbContext db, GovernanceUseCases useCases, TimeProvider clock, CancellationToken ct) =>
        Commit(await useCases.BusinessRolesAsync(command, ct), command.Actor, db, clock);

    [Transactional]
    public static async Task<(GovernanceMutationResult, WorkspaceAuthorizationChangedV1?)> Handle(RedeemInvitation command,
        OrganizationDbContext db, GovernanceUseCases useCases, TimeProvider clock, CancellationToken cancellationToken) =>
        Commit(await useCases.RedeemAsync(command, cancellationToken), command.Actor, db, clock);

    [Transactional]
    public static async Task<(GovernanceMutationResult, WorkspaceAuthorizationChangedV1?)> Handle(ChangeWorkspaceMember command,
        OrganizationDbContext db, GovernanceUseCases useCases, TimeProvider clock, CancellationToken cancellationToken) =>
        Commit(await useCases.ChangeAsync(command, cancellationToken), command.Actor, db, clock);

    [Transactional]
    public static async Task<(GovernanceMutationResult, WorkspaceAuthorizationChangedV1?)> Handle(RevokeWorkspaceInvitation command,
        OrganizationDbContext db, GovernanceUseCases useCases, TimeProvider clock, CancellationToken cancellationToken) =>
        Commit(await useCases.RevokeAsync(command, cancellationToken), command.Actor, db, clock);

    [Transactional]
    public static async Task<(GovernanceMutationResult, WorkspaceAuthorizationChangedV1?)> Handle(ChangeMemberExecutionRole command,
        OrganizationDbContext db, GovernanceUseCases useCases, TimeProvider clock, CancellationToken ct) =>
        Commit(await useCases.ExecutionRoleAsync(command, ct), command.Actor, db, clock);

    [Transactional]
    public static async Task<(CustomRoleView, WorkspaceAuthorizationChangedV1?)> Handle(SaveCustomRole command,
        OrganizationDbContext db, CustomRoleUseCases useCases, TimeProvider clock, CancellationToken ct) =>
        Commit(await useCases.SaveAsync(command, ct), command.Actor, db, clock);

    [Transactional]
    public static async Task<(DepartmentView, WorkspaceAuthorizationChangedV1?)> Handle(CreateDepartment command,
        OrganizationDbContext db, CustomRoleUseCases useCases, TimeProvider clock, CancellationToken ct) =>
        Commit(await useCases.AddAsync(command, ct), command.Actor, db, clock);

    [Transactional]
    public static async Task<(RoleGrantView, WorkspaceAuthorizationChangedV1?)> Handle(RequestCustomRole command,
        OrganizationDbContext db, CustomRoleUseCases useCases, TimeProvider clock, CancellationToken ct) =>
        Commit(await useCases.RequestAsync(command, ct), command.Actor, db, clock);

    [Transactional]
    public static async Task<(RoleGrantView, WorkspaceAuthorizationChangedV1?)> Handle(DecideCustomRole command,
        OrganizationDbContext db, CustomRoleUseCases useCases, TimeProvider clock, CancellationToken ct) =>
        Commit(await useCases.DecideAsync(command, ct), command.Actor, db, clock);

    private static (T, WorkspaceAuthorizationChangedV1?) Commit<T>(GovernanceOutcome<T> outcome, ActorContext actor, OrganizationDbContext db, TimeProvider clock)
    {
        if (!outcome.Changed) return (outcome.Result, null);
        var eventId = Guid.CreateVersion7(); var now = clock.GetUtcNow();
        db.Audits.Add(new(eventId, outcome.TenantId, outcome.WorkspaceId, outcome.Action, actor.Issuer, actor.Subject, now, outcome.TargetId, outcome.Version));
        return (outcome.Result, new(eventId, outcome.TenantId, outcome.WorkspaceId, outcome.Version, now));
    }
}
