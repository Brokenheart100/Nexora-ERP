namespace Nexora.Organization.Domain;

public static class CustomRolePolicy
{
    public const string Company = "company";
    public const string Department = "department";
    public const string Warehouse = "warehouse";
    public const string Period = "period";

    public static IReadOnlyList<string> Scopes(string permission) => permission switch
    {
        WorkspacePermissions.PurchaseOwnRead or WorkspacePermissions.PurchaseRead or WorkspacePermissions.PurchaseCreate
            or WorkspacePermissions.PurchaseSubmit or WorkspacePermissions.PurchaseApprove
            or WorkspacePermissions.SalesOwnRead or WorkspacePermissions.SalesRead or WorkspacePermissions.SalesCreate
            or WorkspacePermissions.SalesSubmit or WorkspacePermissions.SalesApprove => [Company, Department],
        WorkspacePermissions.StockRead => [Company, Warehouse],
        WorkspacePermissions.ReportsRead or WorkspacePermissions.CatalogManage or WorkspacePermissions.PartnerManage
            or WorkspacePermissions.AccountsManage or WorkspacePermissions.AccountsImport or WorkspacePermissions.AccountsExport
            or WorkspacePermissions.TaxManage or WorkspacePermissions.PeriodManage => [Company],
        WorkspacePermissions.LedgerRead or WorkspacePermissions.JournalDraft
            or WorkspacePermissions.JournalPost or WorkspacePermissions.JournalReverse => [Company, Period],
        _ => []
    };

    internal static string[] SelectPermissions(IReadOnlyList<string>? permissions)
    {
        if (permissions is not { Count: > 0 } || permissions.Count > WorkspacePermissions.All.Count ||
            permissions.Any(permission => Scopes(permission).Count == 0))
            throw new ArgumentException("Select known, delegable business permissions.");
        return permissions.Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray();
    }

    internal static void ValidateScope(string scope, Guid? scopeId, WorkspaceCustomRole role,
        DateOnly? startsOn = null, DateOnly? endsOn = null)
    {
        if (scope == Period)
        {
            if (scopeId is not null || startsOn is not { } start || endsOn is not { } end || start > end ||
                start.Year is < 1900 or > 9998 || end.Year is < 1900 or > 9998 ||
                (end.Year - start.Year) * 12 + end.Month - start.Month + 1 > 60)
                throw new ArgumentException("Financial period grants require a start and end date within 60 months.");
        }
        else if (startsOn is not null || endsOn is not null)
        {
            throw new ArgumentException("Only financial period grants accept dates.");
        }

        if ((scope == Company ? scopeId is not null : scope == Period ? false : scopeId is null || scopeId == Guid.Empty) ||
            !role.Permissions.All(permission => Scopes(permission).Contains(scope)))
            throw new ArgumentException("The role permissions do not support this scope.");
    }
}
