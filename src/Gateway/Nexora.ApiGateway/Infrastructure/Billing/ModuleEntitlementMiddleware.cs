using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Nexora.ApiGateway.Infrastructure.Billing;

internal static class BillingGate
{
    public const string HttpClientName = "billing-organization";
    public const string RejectionCode = "module.not_in_plan";

    public static void AddBillingGate(this WebApplicationBuilder builder)
    {
        builder.Services.AddHttpClient(HttpClientName, client =>
        {
            client.BaseAddress = new Uri("https+http://organization");
            client.Timeout = TimeSpan.FromSeconds(5);
        });
    }

    public static void MapBillingGate(this WebApplication app) =>
        app.UseMiddleware<ModuleEntitlementMiddleware>();

    internal static async Task<(EntitlementSnapshot? Snapshot, HttpStatusCode Status)> ReadEntitlementsAsync(
        IHttpClientFactory clients, Guid workspaceId, string authorization, CancellationToken cancellationToken)
    {
        var client = clients.CreateClient(HttpClientName);
        using var request = new HttpRequestMessage(HttpMethod.Get, $"api/workspaces/{workspaceId}/billing/entitlements");
        request.Headers.TryAddWithoutValidation("Authorization", authorization);
        using var response = await client.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode) return (null, response.StatusCode);

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        var root = document.RootElement;
        if (root.ValueKind != JsonValueKind.Object) throw new JsonException("Invalid workspace entitlement response.");
        var plan = root.TryGetProperty("effectivePlanCode", out var planElement) ? planElement.GetString() ?? "" : "";
        var modules = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (root.TryGetProperty("modules", out var modulesElement) && modulesElement.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in modulesElement.EnumerateArray())
            {
                if (item.GetString() is { Length: > 0 } code) modules.Add(code);
            }
        }

        return (new EntitlementSnapshot(plan, modules), response.StatusCode);
    }

    internal sealed record EntitlementSnapshot(string PlanCode, IReadOnlySet<string> Modules);
}

internal sealed partial class ModuleEntitlementMiddleware(
    RequestDelegate next,
    IHttpClientFactory clients,
    ILogger<ModuleEntitlementMiddleware> logger)
{
    [GeneratedRegex("^/api/(finance|sales|purchasing|inventory|reports|masterdata|assistant)/workspaces/([0-9a-fA-F-]{36})(?:/(.*))?$", RegexOptions.IgnoreCase)]
    private static partial Regex WorkspaceRoute();

    public async Task InvokeAsync(HttpContext context)
    {
        if (!TryResolve(context.Request.Path.Value, out var workspaceId, out var module))
        {
            await next(context);
            return;
        }

        var authorization = context.Request.Headers.Authorization.ToString();
        if (string.IsNullOrWhiteSpace(authorization))
        {
            await next(context);
            return;
        }

        var snapshot = await AllowedAsync(workspaceId, authorization, context.RequestAborted);
        if (snapshot is null || snapshot.Modules.Contains(module))
        {
            await next(context);
            return;
        }

        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        await context.Response.WriteAsJsonAsync(new
        {
            code = BillingGate.RejectionCode,
            module,
            plan = snapshot.PlanCode,
            message = $"当前套餐不包含「{module}」模块，请升级套餐后重试。",
        }, context.RequestAborted);
    }

    private async Task<BillingGate.EntitlementSnapshot?> AllowedAsync(Guid workspaceId, string authorization, CancellationToken cancellationToken)
    {
        try
        {
            var (snapshot, status) = await BillingGate.ReadEntitlementsAsync(clients, workspaceId, authorization, cancellationToken);
            if (snapshot is null)
                logger.LogWarning("Billing entitlement lookup returned {Status} for workspace {WorkspaceId}; allowing request.", (int)status, workspaceId);
            return snapshot;
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException)
        {
            logger.LogWarning(exception, "Billing entitlement lookup failed for workspace {WorkspaceId}; allowing request.", workspaceId);
            return null;
        }
    }

    internal static bool TryResolve(string? path, out Guid workspaceId, out string module)
    {
        workspaceId = Guid.Empty;
        module = "";
        if (string.IsNullOrEmpty(path)) return false;
        var match = WorkspaceRoute().Match(path);
        if (!match.Success || !Guid.TryParse(match.Groups[2].Value, out workspaceId)) return false;
        var service = match.Groups[1].Value.ToLowerInvariant();
        var tail = match.Groups[3].Success ? match.Groups[3].Value : "";
        var segment = tail.Split('/', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault()?.ToLowerInvariant() ?? "";
        module = (service, segment) switch
        {
            ("finance", "book") => "book",
            ("finance", "chart") => "book",
            ("finance", "ledger") => "book",
            ("finance", "tax") => "book",
            ("finance", "trade") => "book",
            ("finance", "receivables") => "receivables",
            ("finance", "reports") => "reports",
            ("finance", "report-exports") => "reports",
            ("finance", "reporting") => "aging",
            ("finance", "audit") => "audit",
            ("finance", "capabilities") => "",
            ("masterdata", "catalog") => "catalog",
            ("masterdata", "items") => "catalog",
            ("masterdata", "definitions") => "catalog",
            ("masterdata", "partners") => "partners",
            ("reports", _) => "reports",
            ("sales", _) => "sales",
            ("purchasing", _) => "purchasing",
            ("inventory", _) => "inventory",
            ("assistant", _) => "assistant",
            _ => "",
        };
        return module.Length > 0;
    }
}
