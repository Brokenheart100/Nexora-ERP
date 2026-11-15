namespace Nexora.MasterData.Api;

public sealed record AddDefinitionRequest(Guid OperationId, string Kind, string Code, string Name);

public sealed record ReviseDefinitionRequest(Guid OperationId, long ExpectedVersion, string Name, bool? IsActive);

public sealed record AddItemRequest(Guid OperationId, string Code, string Name, string Kind,
    bool? TracksInventory, Guid CategoryId, Guid UnitId);

public sealed record ReviseItemRequest(Guid OperationId, long ExpectedVersion, string Name, Guid CategoryId, bool? IsActive);
