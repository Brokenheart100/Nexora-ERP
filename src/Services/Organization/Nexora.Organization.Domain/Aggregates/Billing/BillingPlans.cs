namespace Nexora.Organization.Domain;

public sealed record PlanLimits(int Workspaces, int Members, int DocumentsPerMonth);

public sealed record BillingPlan(string Code, string Name, int MonthlyPriceCents, string Currency, PlanLimits Limits, IReadOnlyList<string> Modules)
{
    public bool Includes(string module) => Modules.Contains(module, StringComparer.OrdinalIgnoreCase);
}

public static class BillingModules
{
    public const string Company = "company";
    public const string Book = "book";
    public const string Reports = "reports";
    public const string Aging = "aging";
    public const string Partners = "partners";
    public const string Catalog = "catalog";
    public const string Inventory = "inventory";
    public const string Purchasing = "purchasing";
    public const string Sales = "sales";
    public const string Receivables = "receivables";
    public const string Audit = "audit";
    public const string Assistant = "assistant";
}

public static class BillingPlans
{
    public const string Free = "free";
    public const string Standard = "standard";
    public const string Pro = "pro";

    private static readonly string[] FreeModules = [BillingModules.Company, BillingModules.Book, BillingModules.Reports,
        BillingModules.Aging, BillingModules.Partners, BillingModules.Catalog];
    private static readonly string[] StandardModules = [.. FreeModules, BillingModules.Inventory, BillingModules.Purchasing, BillingModules.Sales];
    private static readonly string[] ProModules = [.. StandardModules, BillingModules.Receivables, BillingModules.Audit, BillingModules.Assistant];

    public static readonly BillingPlan FreePlan = new(Free, "免费版", 0, "CNY", new(1, 3, 500), Array.AsReadOnly(FreeModules));
    public static readonly BillingPlan StandardPlan = new(Standard, "标准版", 9900, "CNY", new(10, 50, 20000), Array.AsReadOnly(StandardModules));
    public static readonly BillingPlan ProPlan = new(Pro, "专业版", 29900, "CNY", new(1000, 500, 1000000), Array.AsReadOnly(ProModules));

    public static readonly IReadOnlyList<BillingPlan> All = Array.AsReadOnly(new[] { FreePlan, StandardPlan, ProPlan });

    public static BillingPlan? Find(string? code) => code is null ? null
        : All.FirstOrDefault(plan => string.Equals(plan.Code, code, StringComparison.OrdinalIgnoreCase));
}
