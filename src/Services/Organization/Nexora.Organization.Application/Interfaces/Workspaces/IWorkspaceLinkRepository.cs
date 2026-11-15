using Nexora.Organization.Domain;

namespace Nexora.Organization.Application;

public interface IWorkspaceLinkRepository
{
    Task<WorkspaceNavigationLink?> FindAsync(Guid companyId, Guid personalId, IdentityReference actor, CancellationToken cancellationToken);
    Task<IReadOnlyList<PersonalLinkView>> ListAsync(Guid companyId, IdentityReference actor, CancellationToken cancellationToken);
    void Add(WorkspaceNavigationLink link);
}
