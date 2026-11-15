using System.Text.Json;
using Microsoft.Extensions.Options;
using Nexora.ApiGateway.Infrastructure.Authorization;

namespace Nexora.ApiGateway.Infrastructure.Assistant;

internal static class AssistantEndpoints
{
    private const string Root = "/api/assistant/workspaces/{workspaceId:guid}";
    private const string LoggerName = "Nexora.ApiGateway.Assistant";

    public static void AddAssistant(this WebApplicationBuilder builder)
    {
        builder.Services.Configure<AssistantOptions>(builder.Configuration.GetSection("Ai"));
        builder.Services.AddHttpClient(AssistantProtocol.HttpFinanceClient, client =>
        {
            client.BaseAddress = new Uri("https+http://finance");
            client.Timeout = TimeSpan.FromSeconds(15);
        });
        builder.Services.AddHttpClient(AssistantProtocol.HttpOrganizationClient, client =>
        {
            client.BaseAddress = new Uri("https+http://organization");
            client.Timeout = TimeSpan.FromSeconds(10);
        });
        builder.Services.AddHttpClient(AssistantProtocol.HttpOpenAiClient, (services, client) =>
        {
            var options = services.GetRequiredService<IOptions<AssistantOptions>>().Value;
            if (!string.IsNullOrWhiteSpace(options.Endpoint)) client.BaseAddress = new Uri(options.Endpoint.TrimEnd('/') + "/");
            client.Timeout = TimeSpan.FromMinutes(2);
        });
        builder.Services.AddSingleton<AssistantTools>();
        builder.Services.AddSingleton<AssistantStore>();
        builder.Services.AddSingleton<IAssistantModel>(services =>
        {
            var options = services.GetRequiredService<IOptions<AssistantOptions>>().Value;
            return string.Equals(options.Provider, AssistantProtocol.ProviderOpenAi, StringComparison.OrdinalIgnoreCase)
                ? new OpenAiAssistantModel(services.GetRequiredService<IHttpClientFactory>(), options)
                : new StubAssistantModel(options);
        });
    }

    public static void MapAssistantEndpoints(this WebApplication app)
    {
        app.MapPost(Root + "/runs", RunAsync)
            .RequireAuthorization(CliAuthorization.WebOnlyPolicy)
            .RequireRateLimiting(AssistantProtocol.RateLimitPolicy)
            .WithName("assistant-runs");
        app.MapPost(Root + "/executions/{executionId:guid}/cancel", CancelAsync)
            .RequireAuthorization(CliAuthorization.WebOnlyPolicy)
            .WithName("assistant-cancel");
        app.MapPost(Root + "/executions/{executionId:guid}/resume", ResumeAsync)
            .RequireAuthorization(CliAuthorization.WebOnlyPolicy)
            .WithName("assistant-resume");
        app.MapPost(Root + "/executions/{executionId:guid}/approve", ApproveAsync)
            .RequireAuthorization(CliAuthorization.WebOnlyPolicy)
            .WithName("assistant-approve");
        app.MapPost(Root + "/executions/{executionId:guid}/reject", RejectAsync)
            .RequireAuthorization(CliAuthorization.WebOnlyPolicy)
            .WithName("assistant-reject");
        app.MapGet(Root + "/sessions", ListAsync)
            .RequireAuthorization(CliAuthorization.WebOnlyPolicy)
            .WithName("assistant-sessions");
        app.MapGet(Root + "/sessions/{sessionId:guid}", GetAsync)
            .RequireAuthorization(CliAuthorization.WebOnlyPolicy)
            .WithName("assistant-session");
        app.MapGet(Root + "/capabilities", Capabilities)
            .RequireAuthorization(CliAuthorization.WebOnlyPolicy)
            .WithName("assistant-capabilities");
    }

    private static async Task RunAsync(
        HttpContext http,
        Guid workspaceId,
        AssistantRunRequest request,
        IAssistantModel model,
        AssistantStore store,
        AssistantTools tools,
        IHttpClientFactory factory,
        ILoggerFactory loggers,
        CancellationToken cancellationToken)
    {
        var logger = loggers.CreateLogger(LoggerName);
        var actor = ActorOf(http);
        if (actor is null)
        {
            await ProblemAsync(http, StatusCodes.Status401Unauthorized, "unauthenticated", "Authentication is required.", cancellationToken);
            return;
        }

        var message = (request.Message ?? string.Empty).Trim();
        if (message.Length == 0 || message.Length > AssistantProtocol.MaxMessageLength)
        {
            await ProblemAsync(http, StatusCodes.Status400BadRequest, "invalid_message", $"Message must be 1-{AssistantProtocol.MaxMessageLength} characters.", cancellationToken);
            return;
        }
        if (!await HasWorkspaceAccessAsync(factory, http, workspaceId, cancellationToken))
        {
            await ProblemAsync(http, StatusCodes.Status403Forbidden, "workspace_forbidden", "Workspace access is required.", cancellationToken);
            return;
        }

        AssistantSession? session = null;
        if (request.SessionId is { } sessionId)
        {
            session = await store.FindAsync(workspaceId, actor.Value.Subject, sessionId, cancellationToken);
            if (session is null)
            {
                await ProblemAsync(http, StatusCodes.Status404NotFound, "session_not_found", "Assistant session was not found.", cancellationToken);
                return;
            }
        }
        session ??= await store.CreateAsync(workspaceId, actor.Value.Issuer, actor.Value.Subject, message.Length <= 24 ? message : message[..24], cancellationToken);
        var now = DateTimeOffset.UtcNow;
        session.AddUserMessage(message, now);
        var assistant = session.AddAssistantMessage(now);
        await store.SaveAsync(session, cancellationToken);

        StartStream(http);
        await SseAsync(http, "session", new { sessionId = session.Id, executionId = assistant.Id, provider = model.Provider, model = model.Model }, cancellationToken);

        var plan = model.SelectTool(message, workspaceId);
        if (plan is not null)
        {
            assistant.Tool = new AssistantToolCall
            {
                Id = Guid.NewGuid().ToString("N"),
                Name = plan.Name,
                Arguments = plan.Arguments,
                Status = "pending",
                RequiresApproval = plan.RequiresApproval
            };
            await SseAsync(http, "tool_call", new { executionId = assistant.Id, tool = assistant.Tool }, cancellationToken);
            if (plan.RequiresApproval)
            {
                assistant.Status = "pending_approval";
                session.Touch(DateTimeOffset.UtcNow);
                await store.SaveAsync(session, cancellationToken);
                await SseAsync(http, "approval_required", new { executionId = assistant.Id, tool = assistant.Tool }, cancellationToken);
                await SseAsync(http, "done", new { status = assistant.Status }, cancellationToken);
                logger.LogInformation("Assistant tool {Tool} requires approval workspace={WorkspaceId} subject={Subject}", plan.Name, workspaceId, actor.Value.Subject);
                return;
            }

            var outcome = await tools.ExecuteAsync(plan.Name, plan.Arguments, workspaceId, Bearer(http), cancellationToken);
            assistant.Tool.Status = outcome.Status;
            assistant.Tool.Result = outcome.Summary;
            assistant.Status = outcome.Status == "executed" ? "complete" : "failed";
            assistant.Content = outcome.Summary ?? "工具执行失败。";
            session.AddToolMessage(outcome.Summary ?? string.Empty, outcome.Status, DateTimeOffset.UtcNow);
            await store.SaveAsync(session, cancellationToken);
            await SseAsync(http, "tool_result", new { executionId = assistant.Id, tool = assistant.Tool, summary = outcome.Summary }, cancellationToken);
            await SseAsync(http, "done", new { status = assistant.Status }, cancellationToken);
            logger.LogInformation("Assistant tool {Tool} executed workspace={WorkspaceId} subject={Subject} status={Status}", plan.Name, workspaceId, actor.Value.Subject, outcome.Status);
            return;
        }

        try
        {
            await foreach (var chunk in model.StreamAsync(new AssistantModelPrompt(BuildTurns(session), string.Empty), cancellationToken))
            {
                if (await store.IsCanceledAsync(assistant.Id))
                {
                    assistant.Status = "canceled";
                    session.Touch(DateTimeOffset.UtcNow);
                    await store.SaveAsync(session, cancellationToken);
                    await SseAsync(http, "canceled", new { executionId = assistant.Id, content = assistant.Content }, CancellationToken.None);
                    logger.LogInformation("Assistant run {ExecutionId} canceled", assistant.Id);
                    return;
                }
                assistant.Content += chunk.Text;
                await SseAsync(http, "delta", new { executionId = assistant.Id, text = chunk.Text }, cancellationToken);
            }
            assistant.Status = "complete";
            session.Touch(DateTimeOffset.UtcNow);
            await store.SaveAsync(session, cancellationToken);
            await SseAsync(http, "done", new { status = assistant.Status, content = assistant.Content }, cancellationToken);
            logger.LogInformation("Assistant run {ExecutionId} completed workspace={WorkspaceId} subject={Subject}", assistant.Id, workspaceId, actor.Value.Subject);
        }
        catch (OperationCanceledException)
        {
            assistant.Status = "canceled";
            session.Touch(DateTimeOffset.UtcNow);
            await store.SaveAsync(session, CancellationToken.None);
            logger.LogInformation("Assistant run {ExecutionId} disconnected", assistant.Id);
        }
    }

    private static async Task<IResult> CancelAsync(HttpContext http, Guid workspaceId, Guid executionId, AssistantStore store, CancellationToken cancellationToken)
    {
        var actor = ActorOf(http);
        if (actor is null) return Results.Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Authentication is required.");
        var session = await store.FindByExecutionAsync(workspaceId, actor.Value.Subject, executionId, cancellationToken);
        var assistant = session?.FindExecution(executionId);
        if (session is null || assistant is null || assistant.Role != "assistant")
            return Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "Assistant execution was not found.");
        await store.MarkCanceledAsync(executionId);
        if (assistant.Status is "streaming" or "canceled")
        {
            assistant.Status = "canceled";
            session.Touch(DateTimeOffset.UtcNow);
            await store.SaveAsync(session, cancellationToken);
        }
        return Results.Ok(new { executionId, status = assistant.Status });
    }

    private static async Task ResumeAsync(
        HttpContext http,
        Guid workspaceId,
        Guid executionId,
        IAssistantModel model,
        AssistantStore store,
        IHttpClientFactory factory,
        ILoggerFactory loggers,
        CancellationToken cancellationToken)
    {
        var actor = ActorOf(http);
        if (actor is null)
        {
            await ProblemAsync(http, StatusCodes.Status401Unauthorized, "unauthenticated", "Authentication is required.", cancellationToken);
            return;
        }
        if (!await HasWorkspaceAccessAsync(factory, http, workspaceId, cancellationToken))
        {
            await ProblemAsync(http, StatusCodes.Status403Forbidden, "workspace_forbidden", "Workspace access is required.", cancellationToken);
            return;
        }
        var session = await store.FindByExecutionAsync(workspaceId, actor.Value.Subject, executionId, cancellationToken);
        var assistant = session?.FindExecution(executionId);
        if (session is null || assistant is null || assistant.Role != "assistant")
        {
            await ProblemAsync(http, StatusCodes.Status404NotFound, "execution_not_found", "Assistant execution was not found.", cancellationToken);
            return;
        }
        if (assistant.Status != "canceled")
        {
            await ProblemAsync(http, StatusCodes.Status409Conflict, "not_resumable", "Only canceled executions can be resumed.", cancellationToken);
            return;
        }

        StartStream(http);
        await SseAsync(http, "session", new { sessionId = session.Id, executionId = assistant.Id, provider = model.Provider, model = model.Model, resumed = true }, cancellationToken);
        try
        {
            await foreach (var chunk in model.StreamAsync(new AssistantModelPrompt(BuildTurns(session), assistant.Content), cancellationToken))
            {
                assistant.Content += chunk.Text;
                await SseAsync(http, "delta", new { executionId = assistant.Id, text = chunk.Text }, cancellationToken);
            }
            assistant.Status = "complete";
            session.Touch(DateTimeOffset.UtcNow);
            await store.SaveAsync(session, cancellationToken);
            await SseAsync(http, "done", new { status = assistant.Status, content = assistant.Content }, cancellationToken);
            loggers.CreateLogger(LoggerName).LogInformation("Assistant run {ExecutionId} resumed", assistant.Id);
        }
        catch (OperationCanceledException)
        {
            session.Touch(DateTimeOffset.UtcNow);
            await store.SaveAsync(session, CancellationToken.None);
        }
    }

    private static async Task<IResult> ApproveAsync(HttpContext http, Guid workspaceId, Guid executionId, AssistantStore store, AssistantTools tools, CancellationToken cancellationToken)
    {
        var actor = ActorOf(http);
        if (actor is null) return Results.Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Authentication is required.");
        var session = await store.FindByExecutionAsync(workspaceId, actor.Value.Subject, executionId, cancellationToken);
        var assistant = session?.FindExecution(executionId);
        if (session is null || assistant?.Tool is null)
            return Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "Assistant tool call was not found.");
        var tool = assistant.Tool;
        if (tool.Status != "pending")
            return Results.Problem(statusCode: StatusCodes.Status409Conflict, title: "Assistant tool call is not pending approval.");

        var outcome = await tools.ExecuteAsync(tool.Name, tool.Arguments, workspaceId, Bearer(http), cancellationToken);
        tool.Status = outcome.Status;
        tool.Result = outcome.Summary;
        assistant.Status = outcome.Status == "executed" ? "complete" : "failed";
        assistant.Content = outcome.Status == "executed"
            ? $"工具 {tool.Name} 已批准并执行。{outcome.Summary}"
            : $"工具 {tool.Name} 执行失败。";
        session.AddToolMessage(outcome.Summary ?? string.Empty, outcome.Status, DateTimeOffset.UtcNow);
        session.Touch(DateTimeOffset.UtcNow);
        await store.SaveAsync(session, cancellationToken);
        return Results.Ok(new { executionId, status = assistant.Status, tool });
    }

    private static async Task<IResult> RejectAsync(HttpContext http, Guid workspaceId, Guid executionId, AssistantStore store, CancellationToken cancellationToken)
    {
        var actor = ActorOf(http);
        if (actor is null) return Results.Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Authentication is required.");
        var session = await store.FindByExecutionAsync(workspaceId, actor.Value.Subject, executionId, cancellationToken);
        var assistant = session?.FindExecution(executionId);
        if (session is null || assistant?.Tool is null)
            return Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "Assistant tool call was not found.");
        if (assistant.Tool.Status != "pending")
            return Results.Problem(statusCode: StatusCodes.Status409Conflict, title: "Assistant tool call is not pending approval.");

        assistant.Tool.Status = "rejected";
        assistant.Status = "complete";
        assistant.Content = "工具调用已被拒绝，未执行任何操作。";
        session.Touch(DateTimeOffset.UtcNow);
        await store.SaveAsync(session, cancellationToken);
        return Results.Ok(new { executionId, status = assistant.Status, tool = assistant.Tool });
    }

    private static async Task<IResult> ListAsync(HttpContext http, Guid workspaceId, int? limit, AssistantStore store, IHttpClientFactory factory, CancellationToken cancellationToken)
    {
        var actor = ActorOf(http);
        if (actor is null) return Results.Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Authentication is required.");
        if (!await HasWorkspaceAccessAsync(factory, http, workspaceId, cancellationToken))
            return Results.Problem(statusCode: StatusCodes.Status403Forbidden, title: "Workspace access is required.");
        var sessions = await store.ListAsync(workspaceId, actor.Value.Subject, Math.Clamp(limit ?? 20, 1, AssistantProtocol.MaxHistoryLimit), cancellationToken);
        var summaries = sessions
            .Select(session => new AssistantSessionSummary(
                session.Id,
                session.Title,
                session.CreatedAtUtc,
                session.UpdatedAtUtc,
                session.Messages.Count,
                LastMessage(session)))
            .ToList();
        return Results.Ok(new { sessions = summaries });
    }

    private static async Task<IResult> GetAsync(HttpContext http, Guid workspaceId, Guid sessionId, AssistantStore store, IHttpClientFactory factory, CancellationToken cancellationToken)
    {
        var actor = ActorOf(http);
        if (actor is null) return Results.Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Authentication is required.");
        if (!await HasWorkspaceAccessAsync(factory, http, workspaceId, cancellationToken))
            return Results.Problem(statusCode: StatusCodes.Status403Forbidden, title: "Workspace access is required.");
        var session = await store.FindAsync(workspaceId, actor.Value.Subject, sessionId, cancellationToken);
        if (session is null) return Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "Assistant session was not found.");
        var view = new AssistantSessionView(
            session.Id,
            session.Title,
            session.CreatedAtUtc,
            session.UpdatedAtUtc,
            session.Messages
                .Select(message => new AssistantMessageView(message.Id, message.Role, message.Content, message.Status, message.AtUtc, message.Tool))
                .ToList());
        return Results.Ok(new { session = view });
    }

    private static IResult Capabilities(IAssistantModel model) =>
        Results.Ok(new AssistantCapabilities(model.Provider, model.Model, model.IsConfigured, AssistantTools.Catalog));

    private static string LastMessage(AssistantSession session)
    {
        var last = session.Messages.LastOrDefault();
        if (last is null) return string.Empty;
        var content = last.Role == "tool" ? last.Content : last.Content;
        return content.Length <= 80 ? content : content[..80];
    }

    private static IReadOnlyList<AssistantTurn> BuildTurns(AssistantSession session) =>
        session.Messages
            .Where(message => message.Role == "user" || (message.Role == "assistant" && message.Status == "complete" && message.Content.Length > 0))
            .Select(message => new AssistantTurn(message.Role, message.Content))
            .ToList();

    private static (string Issuer, string Subject)? ActorOf(HttpContext http)
    {
        var issuer = http.User.FindFirst("iss")?.Value;
        var subject = http.User.FindFirst("sub")?.Value;
        return string.IsNullOrEmpty(issuer) || string.IsNullOrEmpty(subject) ? null : (issuer, subject);
    }

    private static string Bearer(HttpContext http)
    {
        var header = http.Request.Headers.Authorization.ToString();
        return header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ? header[7..] : header;
    }

    private static async Task<bool> HasWorkspaceAccessAsync(IHttpClientFactory factory, HttpContext http, Guid workspaceId, CancellationToken cancellationToken)
    {
        var client = factory.CreateClient(AssistantProtocol.HttpOrganizationClient);
        using var request = new HttpRequestMessage(HttpMethod.Get, $"api/workspaces/{workspaceId}");
        request.Headers.TryAddWithoutValidation("Authorization", "Bearer " + Bearer(http));
        using var response = await client.SendAsync(request, cancellationToken);
        return response.IsSuccessStatusCode;
    }

    private static void StartStream(HttpContext http)
    {
        http.Response.StatusCode = StatusCodes.Status200OK;
        http.Response.ContentType = "text/event-stream; charset=utf-8";
        http.Response.Headers.CacheControl = "no-store";
    }

    private static async Task SseAsync(HttpContext http, string name, object payload, CancellationToken cancellationToken)
    {
        var json = JsonSerializer.Serialize(payload, AssistantProtocol.Json);
        await http.Response.WriteAsync($"event: {name}\ndata: {json}\n\n", cancellationToken);
        await http.Response.Body.FlushAsync(cancellationToken);
    }

    private static async Task ProblemAsync(HttpContext http, int status, string code, string title, CancellationToken cancellationToken)
    {
        http.Response.StatusCode = status;
        http.Response.ContentType = "application/problem+json";
        await http.Response.WriteAsJsonAsync(new { type = "about:blank", title, status, code }, AssistantProtocol.Json, cancellationToken);
    }
}
