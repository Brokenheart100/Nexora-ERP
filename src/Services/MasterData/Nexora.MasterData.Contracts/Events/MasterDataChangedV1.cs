namespace Nexora.MasterData.Contracts;

public sealed record MasterDataChangedV1(Guid EventId, Guid TenantId, Guid WorkspaceId,
    string ResourceKind, Guid ResourceId, long Version, string Code, string Name, bool IsActive,
    DateTimeOffset OccurredAtUtc, ItemAttributesV1? Item = null, IReadOnlyList<string>? PartnerRoles = null);

public sealed record ItemAttributesV1(string Kind, bool TracksInventory, Guid CategoryId, Guid UnitId);
