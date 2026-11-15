using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Domain;

namespace Nexora.Organization.Application;

// These are authenticated user intents, exclusively invoked locally by a validated boundary.
public interface IUserGovernanceCommand { ActorContext Actor { get; } }

public sealed record CreateInvitation(Guid WorkspaceId, long ExpectedVersion, Guid OperationId, string Email, string Role, ActorContext Actor,
    string[]? BusinessRoles = null) : IUserGovernanceCommand;

public sealed record ApproveWorkspaceInvitation(Guid WorkspaceId, long ExpectedVersion, Guid InvitationId, ActorContext Actor) : IUserGovernanceCommand;

public sealed record ChangeMemberBusinessRoles(Guid WorkspaceId, long ExpectedVersion, Guid MemberId, string Action,
    string[]? BusinessRoles, ActorContext Actor) : IUserGovernanceCommand;

public sealed record RedeemInvitation(Guid InvitationId, string Token, ActorContext Actor) : IUserGovernanceCommand
{
    public override string ToString() => "RedeemInvitation (credentials redacted)";
}

public sealed record ChangeWorkspaceMember(Guid WorkspaceId, long ExpectedVersion, Guid MemberId, string Role, bool IsActive, ActorContext Actor) : IUserGovernanceCommand;

public sealed record RevokeWorkspaceInvitation(Guid WorkspaceId, long ExpectedVersion, Guid InvitationId, ActorContext Actor) : IUserGovernanceCommand;

public sealed record ChangeMemberExecutionRole(Guid WorkspaceId, long ExpectedVersion, Guid MemberId,
    ExecutionRoleArea Area, string Action, string? Role, ActorContext Actor) : IUserGovernanceCommand;
