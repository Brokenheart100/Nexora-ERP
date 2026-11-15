namespace Nexora.ApiGateway.Infrastructure.Assistant;

internal sealed class AssistantSession
{
    public Guid Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public string Issuer { get; set; } = string.Empty;
    public string Subject { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public DateTimeOffset CreatedAtUtc { get; set; }
    public DateTimeOffset UpdatedAtUtc { get; set; }
    public List<AssistantMessage> Messages { get; set; } = [];

    public AssistantMessage AddUserMessage(string content, DateTimeOffset now)
    {
        var message = new AssistantMessage
        {
            Id = Guid.NewGuid(),
            Role = "user",
            Content = content,
            Status = "complete",
            AtUtc = now
        };
        Messages.Add(message);
        UpdatedAtUtc = now;
        return message;
    }

    public AssistantMessage AddAssistantMessage(DateTimeOffset now)
    {
        var message = new AssistantMessage
        {
            Id = Guid.NewGuid(),
            Role = "assistant",
            Content = string.Empty,
            Status = "streaming",
            AtUtc = now
        };
        Messages.Add(message);
        UpdatedAtUtc = now;
        return message;
    }

    public void AddToolMessage(string content, string status, DateTimeOffset now)
    {
        Messages.Add(new AssistantMessage
        {
            Id = Guid.NewGuid(),
            Role = "tool",
            Content = content,
            Status = status,
            AtUtc = now
        });
        UpdatedAtUtc = now;
    }

    public AssistantMessage? FindExecution(Guid executionId) => Messages.FirstOrDefault(message => message.Id == executionId);

    public void Touch(DateTimeOffset now) => UpdatedAtUtc = now;
}

internal sealed class AssistantMessage
{
    public Guid Id { get; set; }
    public string Role { get; set; } = "user";
    public string Content { get; set; } = string.Empty;
    public string Status { get; set; } = "complete";
    public DateTimeOffset AtUtc { get; set; }
    public AssistantToolCall? Tool { get; set; }
}

internal sealed class AssistantToolCall
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Arguments { get; set; } = "{}";
    public string Status { get; set; } = "pending";
    public bool RequiresApproval { get; set; }
    public string? Result { get; set; }
}
