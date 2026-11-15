using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Domain;

namespace Nexora.Organization.Application;

public sealed class WorkspaceQueries(IWorkspaceRepository repository, IApplicationAuthorization authorization, IUserAccountRepository accounts)
{
    public async Task<IReadOnlyList<WorkspaceView>> ListAsync(ActorContext actor, CancellationToken cancellationToken)
    {
        if ((await accounts.FindAsync(new(actor.Issuer, actor.Subject), cancellationToken))?.IsActive != true) return [];
        return await repository.ListAccessibleAsync(new(actor.Issuer, actor.Subject), cancellationToken);
    }

    public async Task<WorkspaceView> GetAsync(Guid id, ActorContext actor, CancellationToken cancellationToken)
    {
        var workspace = await repository.FindAsync(id, cancellationToken);
        // Missing and out-of-scope resources are indistinguishable at this query boundary.
        if (workspace is null || !(await authorization.CheckAsync(actor, new(workspace.TenantId, id), WorkspacePermissions.Read, cancellationToken)).Allowed)
            throw new ResourceNotFoundException();
        return OpenWorkspaceUseCase.ToView(workspace);
    }
}
