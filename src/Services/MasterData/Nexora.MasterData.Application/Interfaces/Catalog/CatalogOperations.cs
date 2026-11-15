using Nexora.BuildingBlocks.Application;
using Nexora.MasterData.Domain;

namespace Nexora.MasterData.Application;

public interface ICatalogAccess
{
    Task<CatalogAccess> DemandAsync(Guid workspaceId, string permission, CancellationToken cancellationToken);
}

public interface ICatalogRepository
{
    Task<CatalogReceipt?> FindReceiptAsync(CatalogAccess access, Guid operationId, CancellationToken cancellationToken);
    Task<CatalogDefinition?> FindDefinitionForUpdateAsync(ResourceScope scope, Guid id, CancellationToken cancellationToken);
    Task<CatalogItem?> FindItemAsync(ResourceScope scope, Guid id, CancellationToken cancellationToken);
    void Add(CatalogDefinition definition);
    void Add(CatalogItem item);
    void Add(CatalogReceipt receipt);
}

public interface ICatalogReader
{
    Task<IReadOnlyList<DefinitionView>> DefinitionsAsync(ResourceScope scope, CancellationToken cancellationToken);
    Task<DefinitionView?> DefinitionAsync(ResourceScope scope, Guid id, CancellationToken cancellationToken);
    Task<ItemPage> ItemsAsync(ResourceScope scope, PageWindow page, CancellationToken cancellationToken);
    Task<ItemView?> ItemAsync(ResourceScope scope, Guid id, CancellationToken cancellationToken);
    Task<ItemReference?> ReferenceAsync(ResourceScope scope, Guid id, CancellationToken cancellationToken);
}
