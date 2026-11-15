using Nexora.Inventory.Application;
using Nexora.Inventory.Contracts.Grpc;

namespace Nexora.Inventory.Api.Grpc;

// Ordinary Wolverine handler behind the generated code-first gRPC service.
public static class InventoryGrpcHandler
{
    public static async Task<WarehouseReferenceReply> Handle(WarehouseReferenceRequest request,
        InventoryUseCases inventory, CancellationToken cancellationToken)
    {
        var warehouse = await inventory.ReferenceAsync(request.WorkspaceId, request.WarehouseId, cancellationToken);
        return new WarehouseReferenceReply
        {
            Id = warehouse.Id,
            Code = warehouse.Code,
            Name = warehouse.Name,
            Version = warehouse.Version
        };
    }
}
