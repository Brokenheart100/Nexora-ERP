using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;

namespace Nexora.ApiGateway.Infrastructure.Mcp;

internal enum McpToolStatus
{
    Ok,
    InvalidArguments,
    Denied,
    NotFound,
    Conflict,
    Unavailable
}

internal sealed record McpToolOutcome(McpToolStatus Status, string? Payload, string Message, string? WorkspaceId, string? Detail)
{
    public static McpToolOutcome Ok(string payload, string workspaceId) => new(McpToolStatus.Ok, payload, "", workspaceId, null);

    public static McpToolOutcome Invalid(string message) => new(McpToolStatus.InvalidArguments, null, message, null, null);

    public static McpToolOutcome Failure(McpToolStatus status, string message, string workspaceId, string detail) =>
        new(status, null, message, workspaceId, detail);
}

internal sealed class McpFinanceTools(IHttpClientFactory clients)
{
    public const string ClientName = "finance-mcp";
    public const string MasterDataClientName = "masterdata-mcp";
    private const int MaxDetailLength = 300;

    public async Task<McpToolOutcome> CallAsync(string name, JsonElement arguments, string bearer, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(bearer)) return McpToolOutcome.Invalid("The caller token is missing.");
        if (arguments.ValueKind is not (JsonValueKind.Object or JsonValueKind.Undefined))
            return McpToolOutcome.Invalid("Tool arguments must be a JSON object.");
        if (!TryWorkspace(arguments, out var workspaceId, out var workspaceError))
            return McpToolOutcome.Invalid(workspaceError);
        var workspace = workspaceId.ToString("D");

        string path;
        var clientName = ClientName;
        switch (name)
        {
            case McpToolCatalog.ListAccounts:
                path = "/api/finance/workspaces/" + workspace + "/chart";
                break;
            case McpToolCatalog.TrialBalance:
                if (!TryDate(arguments, "through", out var through, out var throughError))
                    return McpToolOutcome.Invalid(throughError);
                path = "/api/finance/workspaces/" + workspace + "/ledger/trial-balance/" + Date(through);
                break;
            case McpToolCatalog.FinancialReport:
                if (!TryString(arguments, "kind", out var kind, out var kindError))
                    return McpToolOutcome.Invalid(kindError);
                if (!McpToolCatalog.ReportKinds.Contains(kind))
                    return McpToolOutcome.Invalid("kind must be one of trial-balance, profit-and-loss, balance-sheet or cash-flow.");
                if (!TryDate(arguments, "from", out var from, out var fromError))
                    return McpToolOutcome.Invalid(fromError);
                if (!TryDate(arguments, "through", out var throughDate, out var throughDateError))
                    return McpToolOutcome.Invalid(throughDateError);
                var query = new List<string> { "from=" + Date(from), "through=" + Date(throughDate) };
                if (TryBoolean(arguments, "compare", out var compare))
                    query.Add("compare=" + (compare ? "true" : "false"));
                if (TryString(arguments, "basis", out var basis, out _))
                {
                    if (basis is not ("accrual" or "cash"))
                        return McpToolOutcome.Invalid("basis must be accrual or cash.");
                    query.Add("basis=" + basis);
                }
                path = "/api/finance/workspaces/" + workspace + "/reports/" + kind + "?" + string.Join('&', query);
                break;
            case McpToolCatalog.ListJournals:
                var parameters = new List<string>();
                if (TryString(arguments, "month", out var month, out _))
                {
                    if (!DateOnly.TryParseExact(month + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var monthStart))
                        return McpToolOutcome.Invalid("month must use the yyyy-MM format.");
                    parameters.Add("month=" + Date(monthStart));
                }
                var page = 1;
                if (TryInteger(arguments, "page", out var requestedPage))
                {
                    if (requestedPage is < 1 or > 100) return McpToolOutcome.Invalid("page must be between 1 and 100.");
                    page = requestedPage;
                }
                parameters.Add("page=" + page.ToString(CultureInfo.InvariantCulture));
                if (TryBoolean(arguments, "postedOnly", out var postedOnly))
                    parameters.Add("postedOnly=" + (postedOnly ? "true" : "false"));
                path = "/api/finance/workspaces/" + workspace + "/ledger/journals?" + string.Join('&', parameters);
                break;
            case McpToolCatalog.ListBanks or McpToolCatalog.ListCustomers or McpToolCatalog.ListSuppliers
                or McpToolCatalog.ListInvoices or McpToolCatalog.ListBills:
                if (arguments.EnumerateObject().Any(x => x.Name is not ("workspaceId" or "page")))
                    return McpToolOutcome.Invalid("Only workspaceId and page are accepted.");
                var number = 1;
                if (arguments.TryGetProperty("page", out _) && (!TryInteger(arguments, "page", out number) || number is < 1 or > 100))
                    return McpToolOutcome.Invalid("page must be an integer between 1 and 100.");
                var finance = "/api/finance/workspaces/" + workspace;
                var masterData = "/api/masterdata/workspaces/" + workspace + "/partners?pageSize=50&";
                if (name is McpToolCatalog.ListCustomers or McpToolCatalog.ListSuppliers) clientName = MasterDataClientName;
                path = name switch
                {
                    McpToolCatalog.ListBanks => finance + "/trade/banks?",
                    McpToolCatalog.ListInvoices => finance + "/receivables/invoices?",
                    McpToolCatalog.ListBills => finance + "/trade/bills?",
                    McpToolCatalog.ListCustomers => masterData + "role=customer&",
                    _ => masterData + "role=supplier&"
                };
                path += "page=" + number.ToString(CultureInfo.InvariantCulture);
                break;
            default:
                return McpToolOutcome.Invalid("Unknown tool '" + name + "'.");
        }

        using var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearer);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        try
        {
            using var response = await clients.CreateClient(clientName).SendAsync(request, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (response.IsSuccessStatusCode) return McpToolOutcome.Ok(body, workspace);
            return response.StatusCode switch
            {
                HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden => McpToolOutcome.Failure(McpToolStatus.Denied,
                    "The caller is not allowed to read this workspace's finance data.", workspace, Detail(body)),
                HttpStatusCode.NotFound => McpToolOutcome.Failure(McpToolStatus.NotFound,
                    "The workspace or its finance book was not found.", workspace, Detail(body)),
                HttpStatusCode.Conflict => McpToolOutcome.Failure(McpToolStatus.Conflict,
                    "Finance rejected the request because the resource changed. Retry with fresh data.", workspace, Detail(body)),
                HttpStatusCode.BadRequest or HttpStatusCode.UnprocessableEntity => McpToolOutcome.Failure(McpToolStatus.InvalidArguments,
                    "Finance rejected the request parameters.", workspace, Detail(body)),
                _ => McpToolOutcome.Failure(McpToolStatus.Unavailable,
                    "Finance is temporarily unavailable. Retry later.", workspace, Detail(body)),
            };
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException)
        {
            return McpToolOutcome.Failure(McpToolStatus.Unavailable, "Finance is temporarily unavailable. Retry later.", workspace, exception.Message);
        }
    }

    private static bool TryWorkspace(JsonElement arguments, out Guid workspaceId, out string error)
    {
        workspaceId = Guid.Empty;
        error = "workspaceId is required.";
        if (arguments.ValueKind != JsonValueKind.Object || !arguments.TryGetProperty("workspaceId", out var element)) return false;
        if (element.ValueKind != JsonValueKind.String || !Guid.TryParse(element.GetString(), out workspaceId)) return false;
        error = "";
        return true;
    }

    private static bool TryString(JsonElement arguments, string name, out string value, out string error)
    {
        value = "";
        error = name + " must be a string.";
        if (arguments.ValueKind != JsonValueKind.Object || !arguments.TryGetProperty(name, out var element)) return false;
        if (element.ValueKind != JsonValueKind.String) return false;
        var text = element.GetString();
        if (string.IsNullOrWhiteSpace(text)) return false;
        value = text;
        error = "";
        return true;
    }

    private static bool TryDate(JsonElement arguments, string name, out DateOnly value, out string error)
    {
        value = default;
        error = name + " must use the yyyy-MM-dd format.";
        if (!TryString(arguments, name, out var text, out _)) return false;
        return DateOnly.TryParseExact(text, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out value);
    }

    private static bool TryInteger(JsonElement arguments, string name, out int value)
    {
        value = 0;
        if (arguments.ValueKind != JsonValueKind.Object || !arguments.TryGetProperty(name, out var element)) return false;
        return element.ValueKind == JsonValueKind.Number && element.TryGetInt32(out value);
    }

    private static bool TryBoolean(JsonElement arguments, string name, out bool value)
    {
        value = false;
        if (arguments.ValueKind != JsonValueKind.Object || !arguments.TryGetProperty(name, out var element)) return false;
        if (element.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) return false;
        value = element.GetBoolean();
        return true;
    }

    private static string Date(DateOnly value) => value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static string Detail(string body) =>
        body.Length <= MaxDetailLength ? body : body[..MaxDetailLength];
}
