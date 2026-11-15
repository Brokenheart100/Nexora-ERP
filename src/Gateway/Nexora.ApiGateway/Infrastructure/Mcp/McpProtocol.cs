using System.Text.Json;

namespace Nexora.ApiGateway.Infrastructure.Mcp;

internal static class McpProtocol
{
    public const string Path = "/mcp";
    public const string ProtocolVersion = "2025-06-18";
    public const string ServerName = "nexora-finance-mcp";
    public const string ServerVersion = "1.0.0";
    public const string RateLimitPolicy = "mcp";

    public const int ParseError = -32700;
    public const int InvalidRequest = -32600;
    public const int MethodNotFound = -32601;
    public const int InvalidParams = -32602;
    public const int InternalError = -32603;

    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
}
