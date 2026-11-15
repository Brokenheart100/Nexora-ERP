using Nexora.BuildingBlocks.Application;
using Nexora.Sales.Domain;

namespace Nexora.Sales.Application;

public static class SalesPermissions
{
    public const string OwnRead = "sales.order.read-own";
    public const string Read = "sales.order.read";
    public const string Create = "sales.order.create";
    public const string Submit = "sales.order.submit";
    public const string Approve = "sales.order.approve";
}

public sealed record SalesAccess(ResourceScope Scope, SalesActor Actor, IReadOnlyList<string> Permissions,
    IReadOnlyList<ScopedPermission>? ScopedPermissions = null, IReadOnlyList<Guid>? DepartmentIds = null)
{
    public bool Allows(string permission) => Permissions.Contains(permission, StringComparer.Ordinal);
    public Guid[] DepartmentsFor(string permission) => ScopedPermissions?.Where(grant =>
        grant.Permission == permission && grant.WarehouseId is null && grant.DepartmentId.HasValue)
        .Select(grant => grant.DepartmentId!.Value).Distinct().ToArray() ?? [];
    public bool HasPermission(string permission) => Allows(permission) || DepartmentsFor(permission).Length > 0;
    public bool Allows(string permission, Guid? departmentId) =>
        Allows(permission) || departmentId is { } id && DepartmentsFor(permission).Contains(id);
    public bool CanRead(SalesOrder order) => Allows(SalesPermissions.Read, order.DepartmentId)
        || order.MadeBy(Actor) && Allows(SalesPermissions.OwnRead, order.DepartmentId);
    public void Demand(string permission)
    {
        if (!Allows(permission)) throw new AccessDeniedException();
    }
}
