using Nexora.MasterData.Contracts;

namespace Nexora.MasterData.Application;

public sealed record CatalogMutation(Guid Id, long Version);

public sealed record CatalogOutcome(CatalogMutation Result, MasterDataChangedV1? Change);

public sealed record CatalogReceipt(Guid Id, Guid TenantId, Guid WorkspaceId, string Issuer, string Subject,
    Guid OperationId, string Action, string Fingerprint, Guid ResourceId, long ResourceVersion, DateTimeOffset OccurredAtUtc);

public sealed record DefinitionView(Guid Id, string Kind, string Code, string Name, bool IsActive, long Version);

public sealed record ItemView(Guid Id, string Code, string Name, string Kind, bool TracksInventory,
    Guid CategoryId, Guid UnitId, bool IsActive, long Version);

public sealed record ItemPage(IReadOnlyList<ItemView> Items, bool HasMore);

public sealed record CatalogView(IReadOnlyList<DefinitionView> Definitions, ItemPage Page, bool CanManage);

public sealed record ItemReference(ItemView Item, DefinitionView Category, DefinitionView Unit);

public sealed record ChangeStamp(Guid EventId, DateTimeOffset OccurredAtUtc);
