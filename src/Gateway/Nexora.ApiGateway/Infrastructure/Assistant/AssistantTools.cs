using System.Text.Json;

namespace Nexora.ApiGateway.Infrastructure.Assistant;

internal sealed class AssistantTools
{
    public const string TrialBalance = "finance_trial_balance";
    public const string SessionNote = "session_note";

    public static readonly IReadOnlyList<AssistantToolDescriptor> Catalog =
    [
        new(TrialBalance, "读取工作区指定日期的试算平衡（只读，使用调用者权限）。", false),
        new(SessionNote, "在会话中记录一条备注（写操作，需人工审批后才执行）。", true)
    ];

    private readonly IHttpClientFactory _factory;

    public AssistantTools(IHttpClientFactory factory) => _factory = factory;

    public static bool RequiresApproval(string name) => name == SessionNote;

    public async Task<AssistantToolResult> ExecuteAsync(string name, string arguments, Guid workspaceId, string bearer, CancellationToken cancellationToken)
    {
        return name switch
        {
            TrialBalance => await TrialBalanceAsync(arguments, workspaceId, bearer, cancellationToken),
            SessionNote => SessionNoteResult(arguments),
            _ => new AssistantToolResult("failed", null, "Unknown assistant tool.")
        };
    }

    private async Task<AssistantToolResult> TrialBalanceAsync(string arguments, Guid workspaceId, string bearer, CancellationToken cancellationToken)
    {
        var through = ReadArgument(arguments, "through") ?? DateOnly.FromDateTime(DateTime.UtcNow).ToString("yyyy-MM-dd");
        var client = _factory.CreateClient(AssistantProtocol.HttpFinanceClient);
        using var request = new HttpRequestMessage(HttpMethod.Get, $"api/finance/workspaces/{workspaceId}/ledger/trial-balance/{through}");
        request.Headers.TryAddWithoutValidation("Authorization", "Bearer " + bearer);
        using var response = await client.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
            return new AssistantToolResult("failed", null, $"Finance returned HTTP {(int)response.StatusCode}.");
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        try
        {
            using var document = JsonDocument.Parse(body);
            var root = document.RootElement;
            var currency = root.TryGetProperty("currency", out var currencyElement) ? currencyElement.GetString() : null;
            var debit = ReadDecimal(root, "debit");
            var credit = ReadDecimal(root, "credit");
            var accounts = root.TryGetProperty("accounts", out var accountsElement) && accountsElement.ValueKind == JsonValueKind.Array
                ? accountsElement.GetArrayLength()
                : 0;
            return new AssistantToolResult(
                "executed",
                $"试算平衡（{through}，{currency ?? "未知币种"}）：借方 {debit:0.00}，贷方 {credit:0.00}，科目 {accounts} 个。",
                null);
        }
        catch (JsonException)
        {
            return new AssistantToolResult("failed", null, "Finance returned an unexpected trial balance payload.");
        }
    }

    private static AssistantToolResult SessionNoteResult(string arguments)
    {
        var note = ReadArgument(arguments, "note") ?? string.Empty;
        return new AssistantToolResult("executed", "会话备注已记录：" + note, null);
    }

    private static string? ReadArgument(string arguments, string name)
    {
        try
        {
            using var document = JsonDocument.Parse(arguments);
            return document.RootElement.ValueKind == JsonValueKind.Object && document.RootElement.TryGetProperty(name, out var value)
                ? value.GetString()
                : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static decimal ReadDecimal(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var value)) return 0;
        if (value.ValueKind == JsonValueKind.String && decimal.TryParse(value.GetString(), out var parsed)) return parsed;
        if (value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var number)) return number;
        return 0;
    }
}
