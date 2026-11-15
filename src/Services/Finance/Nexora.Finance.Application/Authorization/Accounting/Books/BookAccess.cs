using Nexora.BuildingBlocks.Application;

namespace Nexora.Finance.Application;

public sealed record BookAccess(ResourceScope Scope, ActorContext Actor, bool IsPersonal, bool CanInitialize,
    IReadOnlyList<string>? Permissions = null, IReadOnlyList<ScopedPermission>? ScopedPermissions = null)
{
    public bool Allows(string permission) => Permissions?.Contains(permission, StringComparer.Ordinal) == true;

    public void Demand(string permission)
    {
        if (!Allows(permission)) throw new AccessDeniedException();
    }

    public bool AllowsAny(string permission) => Allows(permission) || Scoped(permission).Length != 0;

    public void DemandAny(string permission)
    {
        if (!AllowsAny(permission)) throw new AccessDeniedException();
    }

    public bool AllowsOn(string permission, DateOnly date) =>
        Allows(permission) || Scoped(permission).Any(grant => Within(grant, date));

    public void DemandOn(string permission, DateOnly date)
    {
        if (!AllowsOn(permission, date)) throw new AccessDeniedException();
    }

    /// <summary>Unrestricted access returns null; otherwise the yyyyMM keys covered by scoped grants.</summary>
    public int[]? MonthKeys(string permission)
    {
        if (Allows(permission)) return null;
        return Scoped(permission)
            .Where(grant => grant.StartsOn is not null && grant.EndsOn is not null)
            .SelectMany(grant => Months(grant.StartsOn!.Value, grant.EndsOn!.Value))
            .Distinct().Order().ToArray();
    }

    private ScopedPermission[] Scoped(string permission) =>
        ScopedPermissions?.Where(grant => grant.Permission == permission).ToArray() ?? [];

    private static bool Within(ScopedPermission grant, DateOnly date) =>
        (grant.StartsOn is null || date >= grant.StartsOn) && (grant.EndsOn is null || date <= grant.EndsOn);

    private static IEnumerable<int> Months(DateOnly start, DateOnly end)
    {
        var month = new DateOnly(start.Year, start.Month, 1);
        var last = new DateOnly(end.Year, end.Month, 1);
        while (month <= last)
        {
            yield return month.Year * 100 + month.Month;
            month = month.AddMonths(1);
        }
    }
}
