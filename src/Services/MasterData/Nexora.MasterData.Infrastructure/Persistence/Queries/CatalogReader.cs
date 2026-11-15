using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.MasterData.Application;
using Nexora.MasterData.Domain;

namespace Nexora.MasterData.Infrastructure;

public sealed class CatalogReader(CatalogDbContext db) : ICatalogReader
{
    private static readonly Expression<Func<CatalogItem, ItemView>> ProjectItem = x => new(
        x.Id, x.Code.Value, x.Name, x.Kind == ItemKind.Product ? "product" : "service",
        x.TracksInventory, x.CategoryId, x.UnitId, x.IsActive, x.Version);

    public async Task<IReadOnlyList<DefinitionView>> DefinitionsAsync(ResourceScope scope, CancellationToken ct) =>
        await ScopedDefinitions(scope).OrderBy(x => x.Kind).ThenBy(x => x.Code).Select(ProjectDefinition).ToListAsync(ct);

    public Task<DefinitionView?> DefinitionAsync(ResourceScope scope, Guid id, CancellationToken ct) =>
        ScopedDefinitions(scope).Where(x => x.Id == id).Select(ProjectDefinition).SingleOrDefaultAsync(ct);

    private static readonly Expression<Func<CatalogDefinition, DefinitionView>> ProjectDefinition = x =>
        new(x.Id, x.Kind == DefinitionKind.Category ? "category" : "unit", x.Code.Value, x.Name, x.IsActive, x.Version);

    public async Task<ItemPage> ItemsAsync(ResourceScope scope, PageWindow page, CancellationToken ct)
    {
        var items = await ScopedItems(scope).OrderBy(x => x.Code).ThenBy(x => x.Id).Skip(page.Offset)
            .Take(page.Size + 1).Select(ProjectItem).ToListAsync(ct);
        return new(items.Take(page.Size).ToArray(), items.Count > page.Size);
    }

    public Task<ItemView?> ItemAsync(ResourceScope scope, Guid id, CancellationToken ct) =>
        ScopedItems(scope).Where(x => x.Id == id).Select(ProjectItem).SingleOrDefaultAsync(ct);

    public Task<ItemReference?> ReferenceAsync(ResourceScope scope, Guid id, CancellationToken ct)
    {
        var definitions = ScopedDefinitions(scope);
        return (from item in ScopedItems(scope)
                where item.Id == id
                join category in definitions on item.CategoryId equals category.Id
                join unit in definitions on item.UnitId equals unit.Id
                select new ItemReference(
                    new(item.Id, item.Code.Value, item.Name, item.Kind == ItemKind.Product ? "product" : "service",
                        item.TracksInventory, item.CategoryId, item.UnitId, item.IsActive, item.Version),
                    new(category.Id, "category", category.Code.Value, category.Name, category.IsActive, category.Version),
                    new(unit.Id, "unit", unit.Code.Value, unit.Name, unit.IsActive, unit.Version)))
            .SingleOrDefaultAsync(ct);
    }

    private IQueryable<CatalogItem> ScopedItems(ResourceScope scope) =>
        db.Items.AsNoTracking().Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId);

    private IQueryable<CatalogDefinition> ScopedDefinitions(ResourceScope scope) =>
        db.Definitions.AsNoTracking().Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId);
}
