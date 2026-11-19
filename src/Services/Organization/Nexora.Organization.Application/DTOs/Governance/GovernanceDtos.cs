using Nexora.BuildingBlocks.Application;

namespace Nexora.Organization.Application;

public sealed record MemberView(Guid Id, Guid UserId, string Subject, string? Email, string Role, bool IsActive, DateTimeOffset JoinedAtUtc,
    string? FinanceRole = null, string? ProposedFinanceRole = null, long? FinanceRoleProposalVersion = null,
    string? PurchaseRole = null, string? ProposedPurchaseRole = null, long? PurchaseRoleProposalVersion = null,
    string? SalesRole = null, string? ProposedSalesRole = null, long? SalesRoleProposalVersion = null,
    string[]? ProposedBusinessRoles = null, Guid? BusinessRoleProposerId = null, long? BusinessRoleProposalVersion = null,
    DateTimeOffset? BusinessRoleProposalExpiresAtUtc = null);

public sealed record InvitationView(Guid Id, string Email, string Role, string State, DateTimeOffset ExpiresAtUtc,
    string[]? BusinessRoles = null, Guid? InviterMemberId = null);

public sealed record RoleView(string Code, string? Area, string[] Permissions);

public sealed record AccessView(Guid WorkspaceId, Guid TenantId, long AuthorizationVersion, IReadOnlyList<string> Permissions, string Role,
    bool IsPersonal, Guid MemberId, ScopedPermission[]? ScopedPermissions = null,
    Guid[]? DepartmentIds = null);

public sealed record InvitationCreatedResult(InvitationView Invitation, string Token, long AuthorizationVersion, string? MailStatus = null);

public sealed record GovernanceMutationResult(Guid WorkspaceId, long AuthorizationVersion);

public sealed record GovernanceOutcome<T>(T Result, Guid TenantId, Guid WorkspaceId, long Version, string Action, Guid TargetId, bool Changed = true);
