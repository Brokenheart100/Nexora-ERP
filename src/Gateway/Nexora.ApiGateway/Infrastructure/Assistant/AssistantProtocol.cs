namespace Nexora.ApiGateway.Infrastructure.Assistant;

internal static class AssistantProtocol
{
    public const string RateLimitPolicy = "assistant";
    public const string HttpFinanceClient = "assistant-finance";
    public const string HttpOrganizationClient = "assistant-organization";
    public const string HttpOpenAiClient = "assistant-openai";
    public const string ProviderStub = "stub";
    public const string ProviderOpenAi = "openai";
    public const int DefaultChunkDelayMs = 60;
    public const int DefaultSessionTtlMinutes = 1440;
    public const int MaxMessageLength = 4000;
    public const int MaxHistoryLimit = 50;
    public static readonly System.Text.Json.JsonSerializerOptions Json = new(System.Text.Json.JsonSerializerDefaults.Web);
}

internal sealed class AssistantOptions
{
    public string Provider { get; set; } = AssistantProtocol.ProviderStub;
    public string Model { get; set; } = "nexora-stub";
    public string? Endpoint { get; set; }
    public string? ApiKey { get; set; }
    public int ChunkDelayMs { get; set; } = AssistantProtocol.DefaultChunkDelayMs;
    public int SessionTtlMinutes { get; set; } = AssistantProtocol.DefaultSessionTtlMinutes;
}
