using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Nexora.BuildingBlocks.Application;
using Nexora.BuildingBlocks.Grpc;
using Nexora.Inventory.Application;
using Nexora.Organization.Contracts.Grpc;

namespace Nexora.Inventory.Infrastructure;

public sealed class InventoryAuthority(IHttpContextAccessor accessor, IOrganizationGrpc organization) : IInventoryAuthority
{
    public async Task<InventoryAccess> AccessAsync(Guid workspaceId, CancellationToken ct)
    {
        var http = accessor.HttpContext;
        var issuer = http?.User.FindFirstValue("iss");
        var subject = http?.User.FindFirstValue("sub");
        if (http?.User.Identity?.IsAuthenticated != true || string.IsNullOrWhiteSpace(issuer) || issuer.Length > 500
            || string.IsNullOrWhiteSpace(subject) || subject.Length > 200) throw new AccessDeniedException();
        var access = await GrpcErrorMapper.CallAsync(
            () => organization.GetWorkspaceAccessAsync(new WorkspaceAccessRequest { WorkspaceId = workspaceId },
                GrpcCallContext.RequireBearer(accessor, ct)),
            ct,
            Unavailable,
            Unavailable);
        if (access.WorkspaceId != workspaceId || access.TenantId == Guid.Empty || access.MemberId == Guid.Empty
            || access.Permissions is null) throw new InventoryAuthorityUnavailableException();
        if (access.IsPersonal || !access.Permissions.Contains("organization.workspace.read", StringComparer.Ordinal))
            throw new AccessDeniedException();
        return new(new(access.TenantId, workspaceId), new(issuer, subject), access.MemberId,
            access.Permissions.Contains("inventory.warehouse.manage", StringComparer.Ordinal),
            access.Permissions.Contains("purchasing.order.approve", StringComparer.Ordinal),
            access.Permissions.Contains("sales.order.approve", StringComparer.Ordinal),
            access.Permissions.Contains("inventory.stock.read", StringComparer.Ordinal),
            access.ScopedPermissions.Where(grant => grant.Permission == "inventory.stock.read" &&
                grant.DepartmentId == Guid.Empty && grant.WarehouseId != Guid.Empty)
                .Select(grant => grant.WarehouseId).Distinct().ToArray(),
            access.Permissions.Contains("organization.audit.read", StringComparer.Ordinal));
    }

    public async Task DemandActiveMemberAsync(Guid workspaceId, Guid memberId, CancellationToken ct)
    {
        var reply = await GrpcErrorMapper.CallAsync(
            () => organization.GetWorkspaceMembersAsync(new WorkspaceMembersRequest { WorkspaceId = workspaceId },
                GrpcCallContext.RequireBearer(accessor, ct)),
            ct,
            Unavailable,
            Unavailable);
        if (reply.Members is null) throw new InventoryAuthorityUnavailableException();
        if (!reply.Members.Any(x => x.Id == memberId && x.IsActive)) throw new ResourceNotFoundException();
    }

    private static Exception Unavailable(string detail) => new InventoryAuthorityUnavailableException();
}
