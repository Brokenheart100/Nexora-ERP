using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Domain;

namespace Nexora.Organization.Application;

public sealed class BillingQueries(IWorkspaceRepository workspaces, IApplicationAuthorization authorization, BillingEntitlements entitlements)
{
    public async Task<EntitlementsView> EntitlementsAsync(Guid workspaceId, ActorContext actor, CancellationToken cancellationToken)
    {
        var workspace = await workspaces.FindAsync(workspaceId, cancellationToken) ?? throw new ResourceNotFoundException();
        await authorization.DemandAsync(actor, new(workspace.TenantId, workspace.Id), WorkspacePermissions.Read, cancellationToken);
        return await entitlements.ReadAsync(workspace, cancellationToken);
    }
}
