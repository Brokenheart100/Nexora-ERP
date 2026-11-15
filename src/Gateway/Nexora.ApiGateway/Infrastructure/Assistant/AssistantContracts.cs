namespace Nexora.ApiGateway.Infrastructure.Assistant;

internal sealed record AssistantRunRequest(Guid? SessionId, string? Message);

internal sealed record AssistantSessionSummary(Guid Id, string Title, DateTimeOffset CreatedAtUtc, DateTimeOffset UpdatedAtUtc, int MessageCount, string LastMessage);

internal sealed record AssistantMessageView(Guid Id, string Role, string Content, string Status, DateTimeOffset AtUtc, AssistantToolCall? Tool);

internal sealed record AssistantSessionView(Guid Id, string Title, DateTimeOffset CreatedAtUtc, DateTimeOffset UpdatedAtUtc, IReadOnlyList<AssistantMessageView> Messages);

internal sealed record AssistantToolDescriptor(string Name, string Description, bool RequiresApproval);

internal sealed record AssistantCapabilities(string Provider, string Model, bool Configured, IReadOnlyList<AssistantToolDescriptor> Tools);

internal sealed record AssistantToolResult(string Status, string? Summary, string? Detail);

internal sealed record AssistantToolPlan(string Name, string Arguments, bool RequiresApproval);

internal sealed record AssistantTurn(string Role, string Content);

internal sealed record AssistantModelPrompt(IReadOnlyList<AssistantTurn> Turns, string Partial);

internal sealed record AssistantModelChunk(string Text);
