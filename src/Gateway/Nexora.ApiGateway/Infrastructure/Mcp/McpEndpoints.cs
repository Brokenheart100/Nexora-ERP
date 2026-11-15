using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.RateLimiting;
using Nexora.ApiGateway.Infrastructure.Authorization;

namespace Nexora.ApiGateway.Infrastructure.Mcp;

internal static class McpEndpoints
{
    private const string LoggerName = "Nexora.ApiGateway.Mcp";

    public static void AddMcpTools(this WebApplicationBuilder builder)
    {
        builder.Services.AddHttpClient(McpFinanceTools.ClientName, client =>
        {
            client.BaseAddress = new Uri("https+http://finance");
            client.Timeout = TimeSpan.FromSeconds(15);
        });
        builder.Services.AddSingleton<McpFinanceTools>();
    }

    public static void MapMcpEndpoints(this WebApplication app)
    {
        app.MapPost(McpProtocol.Path, HandleAsync)
            .RequireAuthorization(CliAuthorization.McpOnlyPolicy)
            .RequireRateLimiting(McpProtocol.RateLimitPolicy)
            .WithName("mcp");
    }

    private static async Task<IResult> HandleAsync(HttpContext http, McpFinanceTools tools, ILoggerFactory loggers, CancellationToken cancellationToken)
    {
        var logger = loggers.CreateLogger(LoggerName);
        JsonDocument document;
        try
        {
            document = await JsonDocument.ParseAsync(http.Request.Body, cancellationToken: cancellationToken);
        }
        catch (JsonException)
        {
            return Error(null, McpProtocol.ParseError, "Invalid JSON payload.", StatusCodes.Status400BadRequest);
        }

        using (document)
        {
            var request = document.RootElement;
            if (request.ValueKind != JsonValueKind.Object)
                return Error(null, McpProtocol.InvalidRequest, "A single JSON-RPC request object is required.", StatusCodes.Status400BadRequest);
            JsonElement? id = request.TryGetProperty("id", out var idElement) ? idElement.Clone() : null;
            if (!request.TryGetProperty("method", out var methodElement) || methodElement.ValueKind != JsonValueKind.String)
                return Error(id, McpProtocol.InvalidRequest, "The JSON-RPC method is required.", StatusCodes.Status400BadRequest);
            var method = methodElement.GetString()!;
            if (id is null) return Results.Accepted();

            switch (method)
            {
                case "initialize":
                    return Result(id, new JsonObject
                    {
                        ["protocolVersion"] = McpProtocol.ProtocolVersion,
                        ["capabilities"] = new JsonObject
                        {
                            ["tools"] = new JsonObject { ["listChanged"] = false }
                        },
                        ["serverInfo"] = new JsonObject
                        {
                            ["name"] = McpProtocol.ServerName,
                            ["version"] = McpProtocol.ServerVersion
                        }
                    });
                case "ping":
                    return Result(id, new JsonObject());
                case "tools/list":
                    return Result(id, new JsonObject { ["tools"] = ToolList() });
                case "tools/call":
                    return await CallToolAsync(http, tools, logger, id, request, cancellationToken);
                default:
                    return Error(id, McpProtocol.MethodNotFound, "Unknown method '" + method + "'.", StatusCodes.Status200OK);
            }
        }
    }

    private static async Task<IResult> CallToolAsync(HttpContext http, McpFinanceTools tools, ILogger logger, JsonElement? id,
        JsonElement request, CancellationToken cancellationToken)
    {
        if (!request.TryGetProperty("params", out var parameters) || parameters.ValueKind != JsonValueKind.Object)
            return Error(id, McpProtocol.InvalidParams, "tools/call requires a params object.", StatusCodes.Status200OK);
        if (!parameters.TryGetProperty("name", out var nameElement) || nameElement.ValueKind != JsonValueKind.String)
            return Error(id, McpProtocol.InvalidParams, "tools/call requires a tool name.", StatusCodes.Status200OK);
        var name = nameElement.GetString()!;
        if (!McpToolCatalog.IsKnown(name))
            return Error(id, McpProtocol.InvalidParams, "Unknown tool '" + name + "'.", StatusCodes.Status200OK);
        var arguments = parameters.TryGetProperty("arguments", out var argumentsElement)
            ? argumentsElement
            : JsonSerializer.SerializeToElement(new Dictionary<string, object?>());

        var header = http.Request.Headers.Authorization.ToString();
        var bearer = header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ? header["Bearer ".Length..].Trim() : "";
        var subject = http.User.FindFirst("sub")?.Value ?? "unknown";
        var started = Stopwatch.GetTimestamp();
        var outcome = await tools.CallAsync(name, arguments, bearer, cancellationToken);
        var elapsed = Stopwatch.GetElapsedTime(started).TotalMilliseconds;
        logger.LogInformation(
            "MCP tool call {Tool} workspace={WorkspaceId} subject={Subject} status={Status} elapsedMs={ElapsedMs:0}",
            name, outcome.WorkspaceId ?? "-", subject, outcome.Status, elapsed);
        if (outcome.Status == McpToolStatus.InvalidArguments)
            return Error(id, McpProtocol.InvalidParams, outcome.Message, StatusCodes.Status200OK);
        if (outcome.Detail is { Length: > 0 } detail)
            logger.LogWarning("MCP tool call {Tool} failed with {Status}: {Detail}", name, outcome.Status, detail);

        var isError = outcome.Status != McpToolStatus.Ok;
        var result = new JsonObject
        {
            ["content"] = new JsonArray(new JsonObject
            {
                ["type"] = "text",
                ["text"] = isError ? outcome.Message : outcome.Payload ?? "{}"
            }),
            ["isError"] = isError
        };
        if (!isError && TryParse(outcome.Payload, out var structured))
            result["structuredContent"] = structured;
        return Result(id, result);
    }

    private static JsonArray ToolList()
    {
        var list = new JsonArray();
        foreach (var tool in McpToolCatalog.Tools)
        {
            list.Add(new JsonObject
            {
                ["name"] = tool.Name,
                ["description"] = tool.Description,
                ["inputSchema"] = JsonNode.Parse(tool.InputSchema)
            });
        }
        return list;
    }

    private static bool TryParse(string? payload, out JsonNode? node)
    {
        node = null;
        if (string.IsNullOrWhiteSpace(payload)) return false;
        try
        {
            node = JsonNode.Parse(payload);
            return node is not null;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static IResult Result(JsonElement? id, JsonNode result) =>
        Results.Json(new JsonObject
        {
            ["jsonrpc"] = "2.0",
            ["id"] = id is { } value ? JsonNode.Parse(value.GetRawText()) : null,
            ["result"] = result
        }, McpProtocol.Json);

    private static IResult Error(JsonElement? id, int code, string message, int statusCode) =>
        Results.Json(new JsonObject
        {
            ["jsonrpc"] = "2.0",
            ["id"] = id is { } value ? JsonNode.Parse(value.GetRawText()) : null,
            ["error"] = new JsonObject { ["code"] = code, ["message"] = message }
        }, McpProtocol.Json, statusCode: statusCode);
}
