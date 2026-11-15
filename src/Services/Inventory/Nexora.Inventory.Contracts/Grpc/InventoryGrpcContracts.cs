using System.Runtime.Serialization;
using System.ServiceModel;
using ProtoBuf.Grpc;

namespace Nexora.Inventory.Contracts.Grpc;

// Code-first gRPC surface for the Inventory owner service: warehouse references used by
// organization governance and by purchasing/sales document entry.
[ServiceContract]
public interface IInventoryGrpc
{
    Task<WarehouseReferenceReply> GetWarehouseReferenceAsync(WarehouseReferenceRequest request, CallContext context = default);
}

[DataContract]
public sealed class WarehouseReferenceRequest
{
    [DataMember(Order = 1)] public Guid WorkspaceId { get; set; }
    [DataMember(Order = 2)] public Guid WarehouseId { get; set; }
}

[DataContract]
public sealed class WarehouseReferenceReply
{
    [DataMember(Order = 1)] public Guid Id { get; set; }
    [DataMember(Order = 2)] public string Code { get; set; } = string.Empty;
    [DataMember(Order = 3)] public string Name { get; set; } = string.Empty;
    [DataMember(Order = 4)] public long Version { get; set; }
}
