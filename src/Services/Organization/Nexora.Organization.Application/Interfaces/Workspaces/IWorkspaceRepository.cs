using Nexora.Organization.Domain;
using Nexora.BuildingBlocks.Application;

namespace Nexora.Organization.Application;

public interface IWorkspaceRepository
{
    Task<Workspace?> FindAsync(Guid id, CancellationToken cancellationToken);
    Task<Workspace?> FindOperationAsync(IdentityReference actor, Guid operationId, CancellationToken cancellationToken);
    Task<IReadOnlyList<WorkspaceView>> ListAccessibleAsync(IdentityReference actor, CancellationToken cancellationToken);
    Task<Workspace?> FindInvitationAsync(Guid invitationId, CancellationToken cancellationToken);
    Task<IReadOnlyList<MemberView>> ListMembersAsync(Guid workspaceId, CancellationToken cancellationToken, PageWindow? page = null);
    void Add(Workspace workspace);
}
