using Nexora.BuildingBlocks.Application;

namespace Nexora.MasterData.Application;

public static class CatalogPermissions
{
    public const string Read = "masterdata.catalog.read";
    public const string Manage = "masterdata.item.manage";
}

public sealed record CatalogAccess(ResourceScope Scope, ActorContext Actor, IReadOnlyList<string> Permissions)
{
    public bool Allows(string permission) => Permissions.Contains(permission, StringComparer.Ordinal);
}
