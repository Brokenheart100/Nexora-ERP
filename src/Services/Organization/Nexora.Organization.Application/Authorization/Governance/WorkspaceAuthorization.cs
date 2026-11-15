using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Domain;

namespace Nexora.Organization.Application;

public sealed class WorkspaceAuthorization(IWorkspaceRepository workspaces, IUserAccountRepository accounts) : IApplicationAuthorization
{
    public async Task<AccessDecision> CheckAsync(ActorContext actor, ResourceScope scope, string permission, CancellationToken cancellationToken)
    {
        var identity = new IdentityReference(actor.Issuer, actor.Subject);
        var account = await accounts.FindAsync(identity, cancellationToken);
        var workspace = await workspaces.FindAsync(scope.WorkspaceId, cancellationToken);
        if (account?.IsActive != true || workspace is null || workspace.TenantId != scope.TenantId
            || !workspace.Members.Any(x => x.Matches(identity) && x.IsActive)) return new(false, false, 0);
        return new(true, workspace.AllowsGovernanceOperation(identity, permission), workspace.Version);
    }
}
