using System.Runtime.Serialization;
using System.ServiceModel;
using ProtoBuf.Grpc;

namespace Nexora.MasterData.Contracts.Grpc;

// Code-first gRPC surface for the MasterData owner service (partners and catalog references).
[ServiceContract]
public interface IMasterDataGrpc
{
    Task<PartnerReferenceReply> GetPartnerReferenceAsync(PartnerReferenceRequest request, CallContext context = default);
    Task<PartnerProfileReply> GetPartnerProfileAsync(PartnerProfileRequest request, CallContext context = default);
    Task<ItemReferenceReply> GetItemReferenceAsync(ItemReferenceRequest request, CallContext context = default);
}

[DataContract]
public sealed class PartnerReferenceRequest
{
    [DataMember(Order = 1)] public Guid WorkspaceId { get; set; }
    [DataMember(Order = 2)] public Guid PartnerId { get; set; }
    [DataMember(Order = 3)] public string? Role { get; set; }
}

[DataContract]
public sealed class PartnerReferenceReply
{
    [DataMember(Order = 1)] public Guid Id { get; set; }
    [DataMember(Order = 2)] public string Code { get; set; } = string.Empty;
    [DataMember(Order = 3)] public string Name { get; set; } = string.Empty;
    [DataMember(Order = 4)] public string Role { get; set; } = string.Empty;
    [DataMember(Order = 5)] public long Version { get; set; }
}

[DataContract]
public sealed class PartnerProfileRequest
{
    [DataMember(Order = 1)] public Guid WorkspaceId { get; set; }
    [DataMember(Order = 2)] public Guid PartnerId { get; set; }
}

[DataContract]
public sealed class PartnerProfileReply
{
    [DataMember(Order = 1)] public Guid Id { get; set; }
    [DataMember(Order = 2)] public string Code { get; set; } = string.Empty;
    [DataMember(Order = 3)] public string Name { get; set; } = string.Empty;
    [DataMember(Order = 4)] public bool IsActive { get; set; }
    [DataMember(Order = 5)] public string[] Roles { get; set; } = [];
    [DataMember(Order = 6)] public string[] ContactEmails { get; set; } = [];
    [DataMember(Order = 7)] public long Version { get; set; }
}

[DataContract]
public sealed class ItemReferenceRequest
{
    [DataMember(Order = 1)] public Guid WorkspaceId { get; set; }
    [DataMember(Order = 2)] public Guid ItemId { get; set; }
    [DataMember(Order = 3)] public bool Inventory { get; set; }
}

[DataContract]
public sealed class ItemReferenceReply
{
    [DataMember(Order = 1)] public Guid ItemId { get; set; }
    [DataMember(Order = 2)] public string Code { get; set; } = string.Empty;
    [DataMember(Order = 3)] public string Name { get; set; } = string.Empty;
    [DataMember(Order = 4)] public string Kind { get; set; } = string.Empty;
    [DataMember(Order = 5)] public bool TracksInventory { get; set; }
    [DataMember(Order = 6)] public bool IsActive { get; set; }
    [DataMember(Order = 7)] public long Version { get; set; }
    [DataMember(Order = 8)] public Guid CategoryId { get; set; }
    [DataMember(Order = 9)] public string CategoryCode { get; set; } = string.Empty;
    [DataMember(Order = 10)] public string CategoryName { get; set; } = string.Empty;
    [DataMember(Order = 11)] public long CategoryVersion { get; set; }
    [DataMember(Order = 12)] public Guid UnitId { get; set; }
    [DataMember(Order = 13)] public string UnitCode { get; set; } = string.Empty;
    [DataMember(Order = 14)] public string UnitName { get; set; } = string.Empty;
    [DataMember(Order = 15)] public long UnitVersion { get; set; }
}
