namespace Nexora.ApiGateway.Infrastructure.Mcp;

internal sealed record McpToolDefinition(string Name, string Description, string InputSchema);

internal static class McpToolCatalog
{
    public const string ListAccounts = "finance_list_accounts";
    public const string TrialBalance = "finance_trial_balance";
    public const string FinancialReport = "finance_financial_report";
    public const string ListJournals = "finance_list_journals";

    public static IReadOnlySet<string> ReportKinds { get; } = new HashSet<string>(StringComparer.Ordinal)
    {
        "trial-balance", "profit-and-loss", "balance-sheet", "cash-flow"
    };

    public static IReadOnlyList<McpToolDefinition> Tools { get; } =
    [
        new(ListAccounts,
            "Read the chart of accounts of a workspace the caller may access. Returns account codes, names, categories and versions.",
            """
            {
              "type": "object",
              "properties": {
                "workspaceId": { "type": "string", "format": "uuid", "description": "Workspace the caller is allowed to read." }
              },
              "required": ["workspaceId"],
              "additionalProperties": false
            }
            """),
        new(TrialBalance,
            "Read the trial balance of a workspace as of a date. Amounts use the workspace currency and minor units.",
            """
            {
              "type": "object",
              "properties": {
                "workspaceId": { "type": "string", "format": "uuid", "description": "Workspace the caller is allowed to read." },
                "through": { "type": "string", "format": "date", "description": "Balance date in yyyy-MM-dd format." }
              },
              "required": ["workspaceId", "through"],
              "additionalProperties": false
            }
            """),
        new(FinancialReport,
            "Read a financial statement (trial balance, profit and loss, balance sheet or cash flow) for a period. Amounts use the workspace currency and minor units.",
            """
            {
              "type": "object",
              "properties": {
                "workspaceId": { "type": "string", "format": "uuid", "description": "Workspace the caller is allowed to read." },
                "kind": { "type": "string", "enum": ["trial-balance", "profit-and-loss", "balance-sheet", "cash-flow"], "description": "Statement kind." },
                "from": { "type": "string", "format": "date", "description": "Period start in yyyy-MM-dd format." },
                "through": { "type": "string", "format": "date", "description": "Period end in yyyy-MM-dd format." },
                "compare": { "type": "boolean", "description": "Include the previous period comparison." },
                "basis": { "type": "string", "enum": ["accrual", "cash"], "description": "Accounting basis; cash flow reports use cash." }
              },
              "required": ["workspaceId", "kind", "from", "through"],
              "additionalProperties": false
            }
            """),
        new(ListJournals,
            "List journal entries of a workspace, newest first, with paging. Use month to restrict to a single fiscal month.",
            """
            {
              "type": "object",
              "properties": {
                "workspaceId": { "type": "string", "format": "uuid", "description": "Workspace the caller is allowed to read." },
                "month": { "type": "string", "pattern": "^\\d{4}-\\d{2}$", "description": "Optional month in yyyy-MM format." },
                "page": { "type": "integer", "minimum": 1, "maximum": 100, "description": "Page number, starting at 1." },
                "postedOnly": { "type": "boolean", "description": "Only return posted journals." }
              },
              "required": ["workspaceId"],
              "additionalProperties": false
            }
            """)
    ];

    public static bool IsKnown(string name) => Tools.Any(tool => tool.Name == name);
}
