using Microsoft.AspNetCore.Http;
using Nexora.BuildingBlocks.Application;
using Nexora.BuildingBlocks.Grpc;
using Nexora.Finance.Application;
using Nexora.Inventory.Contracts.Grpc;
using Nexora.MasterData.Contracts.Grpc;
using Nexora.Organization.Contracts.Grpc;

namespace Nexora.Finance.Infrastructure;

public sealed class OpeningReferences(IHttpContextAccessor accessor, IMasterDataGrpc masterData, IOrganizationGrpc organization,
    IInventoryGrpc inventory) : IOpeningReferences
{
    public async Task DemandWarehouseManagementAsync(Guid workspaceId, CancellationToken ct)
    {
        var reply = await GrpcErrorMapper.CallAsync(() => organization.CheckWorkspacePermissionAsync(
            new WorkspacePermissionRequest { WorkspaceId = workspaceId, Permission = "inventory.warehouse.manage" },
            GrpcCallContext.RequireBearer(accessor, ct)), ct, _ => new BookAuthorityUnavailableException());
        if (!reply.Allowed) throw new AccessDeniedException();
    }

    public async Task DemandWarehouseAsync(Guid workspaceId, Guid id, CancellationToken ct)
    {
        var reply = await GrpcErrorMapper.CallAsync(() => inventory.GetWarehouseReferenceAsync(
            new WarehouseReferenceRequest { WorkspaceId = workspaceId, WarehouseId = id },
            GrpcCallContext.RequireBearer(accessor, ct)), ct, _ => new BookAuthorityUnavailableException());
        if (reply.Id != id || reply.Version < 1) throw new ResourceNotFoundException();
    }

    public async Task<(Guid UnitId, string Name)> ItemAsync(Guid workspaceId, Guid id, CancellationToken ct)
    {
        var reply = await GrpcErrorMapper.CallAsync(() => masterData.GetItemReferenceAsync(
            new ItemReferenceRequest { WorkspaceId = workspaceId, ItemId = id, Inventory = true },
            GrpcCallContext.RequireBearer(accessor, ct)), ct, _ => new BookAuthorityUnavailableException(),
            _ => new BusinessConflictException("商品不再适用于库存期初。"));
        if (reply.ItemId != id || reply.UnitId == Guid.Empty || !reply.IsActive || !reply.TracksInventory)
            throw new BusinessConflictException("商品不再适用于库存期初。");
        return (reply.UnitId, reply.Name);
    }

    public async Task<string> PartnerAsync(Guid workspaceId, Guid id, string role, CancellationToken ct)
    {
        var reply = await GrpcErrorMapper.CallAsync(() => masterData.GetPartnerProfileAsync(
            new PartnerProfileRequest { WorkspaceId = workspaceId, PartnerId = id },
            GrpcCallContext.RequireBearer(accessor, ct)), ct, _ => new BookAuthorityUnavailableException(),
            _ => new BusinessConflictException("往来单位已停用。"));
        if (reply.Id != id || !reply.IsActive || !reply.Roles.Contains(role, StringComparer.Ordinal))
            throw new BusinessConflictException("往来单位已停用或缺少该业务身份。");
        return reply.Name;
    }
}
