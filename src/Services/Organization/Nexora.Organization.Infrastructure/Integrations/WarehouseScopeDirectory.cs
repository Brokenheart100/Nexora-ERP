using Microsoft.AspNetCore.Http;
using Nexora.BuildingBlocks.Application;
using Nexora.BuildingBlocks.Grpc;
using Nexora.Inventory.Contracts.Grpc;
using Nexora.Organization.Application;

namespace Nexora.Organization.Infrastructure;

public sealed class WarehouseScopeDirectory(IHttpContextAccessor accessor, IInventoryGrpc inventory) : IWarehouseScopeDirectory
{
    public async Task DemandWarehouseAsync(ResourceScope scope, Guid id, CancellationToken ct)
    {
        Func<string, Exception> failure = detail => new HttpRequestException(detail);
        var reply = await GrpcErrorMapper.CallAsync(
            () => inventory.GetWarehouseReferenceAsync(
                new WarehouseReferenceRequest { WorkspaceId = scope.WorkspaceId, WarehouseId = id },
                GrpcCallContext.Forward(accessor, ct)),
            ct,
            failure,
            failure);
        if (reply.Id != id) throw new ResourceNotFoundException();
    }
}
