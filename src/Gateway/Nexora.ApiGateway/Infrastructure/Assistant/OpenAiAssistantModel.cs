using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Text.Json;

namespace Nexora.ApiGateway.Infrastructure.Assistant;

internal sealed class OpenAiAssistantModel : IAssistantModel
{
    private readonly IHttpClientFactory _factory;
    private readonly AssistantOptions _options;

    public OpenAiAssistantModel(IHttpClientFactory factory, AssistantOptions options)
    {
        _factory = factory;
        _options = options;
    }

    public string Provider => AssistantProtocol.ProviderOpenAi;
    public string Model => _options.Model;
    public bool IsConfigured => !string.IsNullOrWhiteSpace(_options.Endpoint) && !string.IsNullOrWhiteSpace(_options.ApiKey);

    public AssistantToolPlan? SelectTool(string message, Guid workspaceId) => null;

    public async IAsyncEnumerable<AssistantModelChunk> StreamAsync(AssistantModelPrompt prompt, [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            yield return new AssistantModelChunk("模型 provider 未配置（缺少 Ai:Endpoint 或 Ai:ApiKey）。");
            yield break;
        }

        var messages = prompt.Turns
            .Select(turn => new { role = turn.Role, content = turn.Content })
            .ToList();
        if (prompt.Partial.Length > 0) messages.Add(new { role = "assistant", content = prompt.Partial });

        var client = _factory.CreateClient(AssistantProtocol.HttpOpenAiClient);
        using var request = new HttpRequestMessage(HttpMethod.Post, "chat/completions")
        {
            Content = JsonContent.Create(new { model = Model, stream = true, messages })
        };
        request.Headers.TryAddWithoutValidation("Authorization", "Bearer " + _options.ApiKey);

        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            yield return new AssistantModelChunk($"模型 provider 返回 HTTP {(int)response.StatusCode}，请检查 Ai 配置。");
            yield break;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var reader = new StreamReader(stream);
        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var line = await reader.ReadLineAsync(cancellationToken);
            if (line is null) break;
            if (!line.StartsWith("data: ", StringComparison.Ordinal)) continue;
            var payload = line[6..];
            if (payload == "[DONE]") break;
            string? text = null;
            try
            {
                using var document = JsonDocument.Parse(payload);
                var root = document.RootElement;
                if (root.TryGetProperty("choices", out var choices) && choices.ValueKind == JsonValueKind.Array && choices.GetArrayLength() > 0)
                {
                    var choice = choices[0];
                    if (choice.TryGetProperty("delta", out var delta) && delta.TryGetProperty("content", out var content))
                        text = content.GetString();
                }
            }
            catch (JsonException)
            {
                continue;
            }
            if (!string.IsNullOrEmpty(text)) yield return new AssistantModelChunk(text);
        }
    }
}
