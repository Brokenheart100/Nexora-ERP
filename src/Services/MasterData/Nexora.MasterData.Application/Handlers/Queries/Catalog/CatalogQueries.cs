using Nexora.BuildingBlocks.Application;
using Nexora.MasterData.Domain;

namespace Nexora.MasterData.Application;

public sealed class CatalogQueries(ICatalogAccess access, ICatalogReader reader)
{
    public async Task<CatalogView> ListAsync(Guid workspaceId, PageWindow page, CancellationToken cancellationToken)
    {
        var current = await access.DemandAsync(workspaceId, CatalogPermissions.Read, cancellationToken);
        var definitions = await reader.DefinitionsAsync(current.Scope, cancellationToken);
        var items = await reader.ItemsAsync(current.Scope, page, cancellationToken);
        return new(definitions, items, current.Allows(CatalogPermissions.Manage));
    }

    public async Task<ItemView> GetAsync(Guid workspaceId, Guid itemId, CancellationToken cancellationToken)
    {
        var current = await access.DemandAsync(workspaceId, CatalogPermissions.Read, cancellationToken);
        return await reader.ItemAsync(current.Scope, itemId, cancellationToken) ?? throw new ResourceNotFoundException();
    }

    public async Task<DefinitionView> GetDefinitionAsync(Guid workspaceId, Guid id, CancellationToken ct)
    {
        var current = await access.DemandAsync(workspaceId, CatalogPermissions.Read, ct);
        return await reader.DefinitionAsync(current.Scope, id, ct) ?? throw new ResourceNotFoundException();
    }

    public async Task<ItemReference> ReferenceAsync(Guid workspaceId, Guid itemId, bool inventory, CancellationToken ct)
    {
        var current = await access.DemandAsync(workspaceId, CatalogPermissions.Read, ct);
        var reference = await reader.ReferenceAsync(current.Scope, itemId, ct) ?? throw new ResourceNotFoundException();
        if (!reference.Item.IsActive || !reference.Category.IsActive || !reference.Unit.IsActive
            || (inventory && (reference.Item.Kind != "product" || !reference.Item.TracksInventory)))
            throw new BusinessConflictException("The item is not eligible for the requested use.");
        return reference;
    }
}
