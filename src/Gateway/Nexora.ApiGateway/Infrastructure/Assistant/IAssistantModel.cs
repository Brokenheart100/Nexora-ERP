using System.Runtime.CompilerServices;
using System.Text.Json;

namespace Nexora.ApiGateway.Infrastructure.Assistant;

internal interface IAssistantModel
{
    string Provider { get; }
    string Model { get; }
    bool IsConfigured { get; }
    AssistantToolPlan? SelectTool(string message, Guid workspaceId);
    IAsyncEnumerable<AssistantModelChunk> StreamAsync(AssistantModelPrompt prompt, CancellationToken cancellationToken);
}

internal sealed class StubAssistantModel : IAssistantModel
{
    private readonly AssistantOptions _options;

    public StubAssistantModel(AssistantOptions options) => _options = options;

    public string Provider => AssistantProtocol.ProviderStub;
    public string Model => _options.Model;
    public bool IsConfigured => true;

    public AssistantToolPlan? SelectTool(string message, Guid workspaceId)
    {
        if (message.Contains("试算", StringComparison.Ordinal) || message.Contains("trial", StringComparison.OrdinalIgnoreCase))
            return new AssistantToolPlan(
                AssistantTools.TrialBalance,
                JsonSerializer.Serialize(new { through = DateOnly.FromDateTime(DateTime.UtcNow).ToString("yyyy-MM-dd") }),
                false);
        if (message.Contains("备注", StringComparison.Ordinal) || message.Contains("note", StringComparison.OrdinalIgnoreCase))
            return new AssistantToolPlan(
                AssistantTools.SessionNote,
                JsonSerializer.Serialize(new { note = message.Length <= 200 ? message : message[..200] }),
                true);
        return null;
    }

    public async IAsyncEnumerable<AssistantModelChunk> StreamAsync(AssistantModelPrompt prompt, [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var full = Compose(prompt.Turns);
        var start = prompt.Partial.Length <= full.Length && full.StartsWith(prompt.Partial, StringComparison.Ordinal)
            ? prompt.Partial.Length
            : 0;
        for (var index = start; index < full.Length; index += 6)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (_options.ChunkDelayMs > 0) await Task.Delay(_options.ChunkDelayMs, cancellationToken);
            yield return new AssistantModelChunk(full.Substring(index, Math.Min(6, full.Length - index)));
        }
    }

    internal static string Compose(IReadOnlyList<AssistantTurn> turns)
    {
        var last = turns.LastOrDefault(turn => turn.Role == "user")?.Content ?? string.Empty;
        var trimmed = last.Length <= 60 ? last : last[..60];
        return $"已收到你的请求：「{trimmed}」。这是本地确定性测试模型生成的流式回复，用于验证会话隔离、流式输出、取消与恢复以及工具审批链路。" +
               $"当前会话共 {turns.Count} 条上下文消息；你可以在生成过程中取消，随后点击恢复继续生成，内容会从断点处续写。" +
               "若要查看工作区试算平衡，请发送包含「试算」的消息；若要记录会话备注，请发送包含「备注」的消息，该工具需要人工审批后才会执行。";
    }
}
