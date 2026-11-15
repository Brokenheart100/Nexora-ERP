namespace Nexora.Inventory.Application;

public interface IInventoryAuthority
{
    Task<InventoryAccess> AccessAsync(Guid workspaceId, CancellationToken ct);
    Task DemandActiveMemberAsync(Guid workspaceId, Guid memberId, CancellationToken ct);
}
