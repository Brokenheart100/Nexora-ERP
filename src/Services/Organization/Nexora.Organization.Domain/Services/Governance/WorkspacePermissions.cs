namespace Nexora.Organization.Domain;

public static class GovernanceRoles
{
    public const string Owner = "WorkspaceOwner";
    public const string Administrator = "AccessAdministrator";
    public const string Reader = "WorkspaceReader";
    public static bool Known(string role) => role is Owner or Administrator or Reader;
    public static bool IsAdministrator(string role) => role is Owner or Administrator;
}

public static class WorkspacePermissions
{
    public const string Read = "organization.workspace.read";
    public const string Manage = "organization.workspace.manage";
    public const string MembersRead = "organization.members.read";
    public const string Invite = "organization.members.invite";
    public const string Suspend = "organization.members.suspend";
    public const string Assign = "organization.roles.assign";
    public const string BusinessRolesManage = "organization.business-roles.manage";
    public const string Revoke = "organization.invitations.revoke";
    public const string Audit = "organization.audit.read";
    public const string BillingRead = "organization.billing.read";
    public const string BillingManage = "organization.billing.manage";
    public const string ReportsRead = "reports.workspace.read";
    public const string CatalogRead = "masterdata.catalog.read";
    public const string CatalogManage = "masterdata.item.manage";
    public const string PartnerRead = "masterdata.partner.read";
    public const string PartnerManage = "masterdata.partner.manage";
    public const string AccountsManage = "finance.accounts.manage";
    public const string AccountsImport = "finance.accounts.import";
    public const string AccountsExport = "finance.accounts.export";
    public const string TaxManage = "finance.tax.manage";
    public const string FinanceRolesManage = "organization.finance-roles.manage";
    public const string LedgerRead = "finance.ledger.read";
    public const string JournalDraft = "finance.journal.create";
    public const string JournalPost = "finance.journal.post";
    public const string JournalReverse = "finance.journal.reverse";
    public const string PeriodManage = "finance.period.manage";
    public const string PurchaseRolesManage = "organization.purchase-roles.manage";
    public const string PurchaseOwnRead = "purchasing.order.read-own";
    public const string PurchaseRead = "purchasing.order.read";
    public const string PurchaseCreate = "purchasing.order.create";
    public const string PurchaseSubmit = "purchasing.order.submit";
    public const string PurchaseApprove = "purchasing.order.approve";
    public const string SalesRolesManage = "organization.sales-roles.manage";
    public const string SalesOwnRead = "sales.order.read-own";
    public const string SalesRead = "sales.order.read";
    public const string SalesCreate = "sales.order.create";
    public const string SalesSubmit = "sales.order.submit";
    public const string SalesApprove = "sales.order.approve";
    public const string WarehouseManage = "inventory.warehouse.manage";
    public const string StockRead = "inventory.stock.read";
    private static readonly IReadOnlyList<string> ExecutionOperations = Array.AsReadOnly(new[] { JournalDraft, JournalPost, JournalReverse, PeriodManage,
        PurchaseOwnRead, PurchaseRead, PurchaseCreate, PurchaseSubmit, PurchaseApprove, SalesOwnRead, SalesRead, SalesCreate, SalesSubmit, SalesApprove, StockRead });
    public static readonly IReadOnlyList<string> All = Array.AsReadOnly(new[] { Read, Manage, MembersRead, Invite, Suspend, Assign, BusinessRolesManage, Revoke, Audit, BillingRead, BillingManage, ReportsRead, CatalogRead, CatalogManage, PartnerRead, PartnerManage,
        AccountsManage, AccountsImport, AccountsExport, TaxManage, FinanceRolesManage, LedgerRead,
        JournalDraft, JournalPost, JournalReverse, PeriodManage, PurchaseRolesManage,
        PurchaseOwnRead, PurchaseRead, PurchaseCreate, PurchaseSubmit, PurchaseApprove, WarehouseManage, SalesRolesManage, SalesOwnRead, SalesRead, SalesCreate, SalesSubmit, SalesApprove, StockRead });
    public static bool Allows(string role, string permission) => GovernanceRoles.Known(role) && All.Contains(permission)
        && !ExecutionOperations.Contains(permission)
        && (role == GovernanceRoles.Owner || role == GovernanceRoles.Administrator && permission is not (Manage or BusinessRolesManage or AccountsManage or AccountsImport or AccountsExport or TaxManage or FinanceRolesManage or PurchaseRolesManage or SalesRolesManage or LedgerRead or WarehouseManage or BillingManage)
            || role == GovernanceRoles.Reader && permission is Read or ReportsRead or CatalogRead or PartnerRead);
}
