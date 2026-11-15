namespace Nexora.Organization.Api;

public sealed record InviteMemberRequest(Guid OperationId, long ExpectedVersion, string Email, string Role, string[]? BusinessRoles = null);

public sealed record ApproveInvitationRequest(long ExpectedVersion);

public sealed record ChangeBusinessRolesRequest(long ExpectedVersion, string Action, string[]? BusinessRoles);

public sealed record RedeemInvitationRequest(string Token);

public sealed record ChangeMemberRequest(long ExpectedVersion, string Role, bool? IsActive);

public sealed record RevokeInvitationRequest(long ExpectedVersion);

public sealed record ChangeExecutionRoleRequest(long ExpectedVersion, string Action, string? Role);
