using Microsoft.AspNetCore.Authorization;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text.Json;

namespace Nexora.ApiGateway.Infrastructure.Authorization;

internal static class CliAuthorization
{
    public const string PurposeClaim = "nexora.purpose";
    public const string PurposeContainerClaim = "nexora";
    public const string PurposeProperty = "purpose";
    public const string CliPurposeValue = "cli";
    public const string McpPurposeValue = "mcp";
    public const string CliOnlyPolicy = "CliOnly";
    public const string McpOnlyPolicy = "McpOnly";
    public const string WebOnlyPolicy = "WebOnly";

    public static string? PurposeOf(ClaimsPrincipal user)
    {
        var flat = user.FindFirst(PurposeClaim)?.Value;
        if (!string.IsNullOrEmpty(flat)) return flat;
        var container = user.FindFirst(PurposeContainerClaim)?.Value;
        if (string.IsNullOrEmpty(container)) return null;
        try
        {
            using var document = JsonDocument.Parse(container);
            return document.RootElement.ValueKind == JsonValueKind.Object
                && document.RootElement.TryGetProperty(PurposeProperty, out var purpose)
                && purpose.ValueKind == JsonValueKind.String
                ? purpose.GetString()
                : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    public static bool IsCliPurpose(ClaimsPrincipal user) => PurposeOf(user) == CliPurposeValue;

    public static bool IsMcpPurpose(ClaimsPrincipal user) => PurposeOf(user) == McpPurposeValue;

    public static void AddCliAuthorization(this WebApplicationBuilder builder)
    {
        var authority = builder.Configuration["Authentication:Authority"]
            ?? throw new InvalidOperationException("Authentication authority is required.");
        builder.Services.AddHttpClient(CliTokenValidator.ClientName, client =>
        {
            client.BaseAddress = new Uri(authority.TrimEnd('/') + "/");
            client.Timeout = TimeSpan.FromSeconds(5);
        }).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
        {
            ServerCertificateCustomValidationCallback = builder.Environment.IsDevelopment()
                ? HttpClientHandler.DangerousAcceptAnyServerCertificateValidator
                : null,
        });
        builder.Services.AddHttpContextAccessor();
        builder.Services.AddSingleton<ICliTokenValidator, CliTokenValidator>();
        builder.Services.AddAuthorization(options =>
        {
            options.AddPolicy(CliOnlyPolicy, policy => policy
                .RequireAuthenticatedUser()
                .AddRequirements(new CliPurposeRequirement()));
            options.AddPolicy(McpOnlyPolicy, policy => policy
                .RequireAuthenticatedUser()
                .AddRequirements(new McpPurposeRequirement()));
            options.AddPolicy(WebOnlyPolicy, policy => policy
                .RequireAuthenticatedUser()
                .AddRequirements(new WebPurposeRequirement()));
        });
        builder.Services.AddSingleton<IAuthorizationHandler, CliPurposeHandler>();
        builder.Services.AddSingleton<IAuthorizationHandler, McpPurposeHandler>();
        builder.Services.AddSingleton<IAuthorizationHandler, WebPurposeHandler>();
    }
}

internal sealed class CliPurposeRequirement : IAuthorizationRequirement
{
}

internal sealed class McpPurposeRequirement : IAuthorizationRequirement
{
}

internal sealed class WebPurposeRequirement : IAuthorizationRequirement
{
}

internal interface ICliTokenValidator
{
    Task<bool> IsActiveAsync(string accessToken, CancellationToken cancellationToken);
}

internal sealed class CliTokenValidator(IHttpClientFactory clients) : ICliTokenValidator
{
    public const string ClientName = "identity-userinfo";

    public async Task<bool> IsActiveAsync(string accessToken, CancellationToken cancellationToken)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, "protocol/openid-connect/userinfo");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            using var response = await clients.CreateClient(ClientName).SendAsync(request, cancellationToken);
            return response.IsSuccessStatusCode;
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException)
        {
            return false;
        }
    }
}

internal sealed class CliPurposeHandler(ICliTokenValidator validator, IHttpContextAccessor accessor) : AuthorizationHandler<CliPurposeRequirement>
{
    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context, CliPurposeRequirement requirement)
    {
        if (!CliAuthorization.IsCliPurpose(context.User)) return;
        if (accessor.HttpContext is not { } http) return;
        var header = http.Request.Headers.Authorization.ToString();
        if (!header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) return;
        if (await validator.IsActiveAsync(header["Bearer ".Length..].Trim(), http.RequestAborted))
            context.Succeed(requirement);
    }
}

internal sealed class McpPurposeHandler(ICliTokenValidator validator, IHttpContextAccessor accessor) : AuthorizationHandler<McpPurposeRequirement>
{
    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context, McpPurposeRequirement requirement)
    {
        if (!CliAuthorization.IsMcpPurpose(context.User)) return;
        if (accessor.HttpContext is not { } http) return;
        var header = http.Request.Headers.Authorization.ToString();
        if (!header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) return;
        if (await validator.IsActiveAsync(header["Bearer ".Length..].Trim(), http.RequestAborted))
            context.Succeed(requirement);
    }
}

internal sealed class WebPurposeHandler : AuthorizationHandler<WebPurposeRequirement>
{
    protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, WebPurposeRequirement requirement)
    {
        if (CliAuthorization.PurposeOf(context.User) is null)
            context.Succeed(requirement);
        return Task.CompletedTask;
    }
}
