using Nexora.MasterData.Domain;

namespace Nexora.MasterData.Application;

public static class PartnerPermissions
{
    public const string Read = "masterdata.partner.read";
    public const string Manage = "masterdata.partner.manage";
}

public static class PartnerRoleCodes
{
    private static readonly Dictionary<string, PartnerRoles> Roles = new(StringComparer.Ordinal)
    {
        ["customer"] = PartnerRoles.Customer,
        ["supplier"] = PartnerRoles.Supplier,
        ["donor"] = PartnerRoles.Donor
    };

    public static bool IsKnown(string? code) => code is not null && Roles.ContainsKey(code);

    public static PartnerRoles Parse(string code) => Roles.TryGetValue(code, out var role)
        ? role
        : throw new CatalogRuleException("Invalid partner role.");

    public static string[] List(PartnerRoles roles) => Roles
        .Where(entry => (roles & entry.Value) != 0).Select(entry => entry.Key).ToArray();
}
