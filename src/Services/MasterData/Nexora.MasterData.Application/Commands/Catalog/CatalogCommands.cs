using Nexora.MasterData.Domain;

namespace Nexora.MasterData.Application;

public sealed record AddDefinition(Guid WorkspaceId, Guid OperationId, DefinitionKind Kind, string Code, string Name);

public sealed record ReviseDefinition(Guid WorkspaceId, Guid OperationId, Guid DefinitionId, long ExpectedVersion, string Name, bool IsActive);

public sealed record AddItem(Guid WorkspaceId, Guid OperationId, string Code, string Name,
    ItemKind Kind, bool TracksInventory, Guid CategoryId, Guid UnitId);

public sealed record ReviseItem(Guid WorkspaceId, Guid OperationId, Guid ItemId, long ExpectedVersion,
    string Name, Guid CategoryId, bool IsActive);
