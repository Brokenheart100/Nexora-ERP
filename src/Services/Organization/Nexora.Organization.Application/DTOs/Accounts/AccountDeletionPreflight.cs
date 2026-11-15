namespace Nexora.Organization.Application;

public sealed record DeletionWorkspace(Guid WorkspaceId, string Name, bool Personal, bool Owned, bool LastAdministrator);

public sealed record AccountDeletionImpact(DeletionWorkspace[] Workspaces, int PersonalLinks);

public sealed record DeletionBlocker(string Code, Guid? WorkspaceId, string? WorkspaceName);

public sealed record AccountDeletionReview(DeletionBlocker[] Blockers, bool RequiresRetentionReview);
