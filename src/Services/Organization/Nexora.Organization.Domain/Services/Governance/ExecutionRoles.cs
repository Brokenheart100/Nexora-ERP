namespace Nexora.Organization.Domain;

public static class FinanceRoles
{
    public const string Accountant = "Accountant";
    public const string Reviewer = "FinanceReviewer";
    public static bool Known(string? role) => role is Accountant or Reviewer;
    public static bool Allows(string? role, string permission) => role switch
    {
        Accountant => permission is WorkspacePermissions.LedgerRead or WorkspacePermissions.JournalDraft,
        Reviewer => permission is WorkspacePermissions.LedgerRead or WorkspacePermissions.JournalPost
            or WorkspacePermissions.JournalReverse or WorkspacePermissions.PeriodManage,
        _ => false
    };
}

public static class PurchaseRoles
{
    public const string Operator = "PurchasingOperator";
    public const string Approver = "PurchasingApprover";
    public static bool Known(string? role) => role is Operator or Approver;
    public static bool Allows(string? role, string permission) => role switch
    {
        Operator => permission is WorkspacePermissions.PurchaseOwnRead or WorkspacePermissions.PurchaseCreate or WorkspacePermissions.PurchaseSubmit,
        Approver => permission is WorkspacePermissions.PurchaseRead or WorkspacePermissions.PurchaseApprove,
        _ => false
    };
}

public static class SalesRoles
{
    public const string Operator = "SalesOperator";
    public const string Approver = "SalesApprover";
    public static bool Known(string? role) => role is Operator or Approver;
    public static bool Allows(string? role, string permission) => role switch
    {
        Operator => permission is WorkspacePermissions.SalesOwnRead or WorkspacePermissions.SalesCreate or WorkspacePermissions.SalesSubmit,
        Approver => permission is WorkspacePermissions.SalesRead or WorkspacePermissions.SalesApprove,
        _ => false
    };
}

public static class ExecutionRoles
{
    public static IReadOnlyList<string> All { get; } = Array.AsReadOnly(new[]
    {
        FinanceRoles.Accountant, FinanceRoles.Reviewer, PurchaseRoles.Operator, PurchaseRoles.Approver,
        SalesRoles.Operator, SalesRoles.Approver
    });

    public static ExecutionRoleArea AreaOf(string role) =>
        Enum.GetValues<ExecutionRoleArea>().Single(area => Known(area, role));

    public static bool Allows(string role, string permission) =>
        FinanceRoles.Allows(role, permission) || PurchaseRoles.Allows(role, permission) || SalesRoles.Allows(role, permission);

    internal static string[] ValidateSelection(IReadOnlyList<string> roles)
    {
        if (roles.Any(role => !All.Contains(role)) || roles.GroupBy(AreaOf).Any(group => group.Count() > 1))
            throw new ArgumentException("Select at most one known business role per area.");
        return All.Where(roles.Contains).ToArray();
    }

    public static string ManagePermission(ExecutionRoleArea area) => area switch
    {
        ExecutionRoleArea.Finance => WorkspacePermissions.FinanceRolesManage,
        ExecutionRoleArea.Purchasing => WorkspacePermissions.PurchaseRolesManage,
        ExecutionRoleArea.Sales => WorkspacePermissions.SalesRolesManage,
        _ => throw new ArgumentOutOfRangeException(nameof(area))
    };
    public static bool Known(ExecutionRoleArea area, string? role) => area switch
    {
        ExecutionRoleArea.Finance => FinanceRoles.Known(role),
        ExecutionRoleArea.Purchasing => PurchaseRoles.Known(role),
        ExecutionRoleArea.Sales => SalesRoles.Known(role),
        _ => false
    };
}
