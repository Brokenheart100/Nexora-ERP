using Nexora.BuildingBlocks.Application;
using Nexora.Purchasing.Domain;

namespace Nexora.Purchasing.Application;

public static class PurchasePermissions
{
    public const string OwnRead = "purchasing.order.read-own";
    public const string Read = "purchasing.order.read";
    public const string Create = "purchasing.order.create";
    public const string Submit = "purchasing.order.submit";
    public const string Approve = "purchasing.order.approve";
}

public sealed record PurchaseAccess(ResourceScope Scope, PurchaseActor Actor, IReadOnlyList<string> Permissions,
    IReadOnlyList<ScopedPermission>? ScopedPermissions = null, IReadOnlyList<Guid>? DepartmentIds = null)
{
    public bool Allows(string permission) => Permissions.Contains(permission, StringComparer.Ordinal);
    public Guid[] DepartmentsFor(string permission) => ScopedPermissions?.Where(grant =>
        grant.Permission == permission && grant.WarehouseId is null && grant.DepartmentId.HasValue)
        .Select(grant => grant.DepartmentId!.Value).Distinct().ToArray() ?? [];
    public bool HasPermission(string permission) => Allows(permission) || DepartmentsFor(permission).Length > 0;
    public bool Allows(string permission, Guid? departmentId) =>
        Allows(permission) || departmentId is { } id && DepartmentsFor(permission).Contains(id);
    public bool CanRead(PurchaseOrder order) => Allows(PurchasePermissions.Read, order.DepartmentId)
        || order.MadeBy(Actor) && Allows(PurchasePermissions.OwnRead, order.DepartmentId);
    public void Demand(string permission)
    {
        if (!Allows(permission)) throw new AccessDeniedException();
    }
}
