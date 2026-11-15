using System.Text.Json;
using System.Text.Json.Nodes;
using System.Globalization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Net.Http.Headers;

namespace Nexora.ServiceDefaults.Http;

public static class ApiIdempotency
{
    public const string Header = "Idempotency-Key";
    public const string ConditionalRevision = "Nexora.ConditionalRevision";

    public static void UseIdempotencyHeaders(this WebApplication app) => app.Use(async (context, next) =>
    {
        var request = context.Request;
        var contract = context.GetEndpoint()?.Metadata.GetMetadata<IdempotentWriteAttribute>();
        var hasKey = request.Headers.TryGetValue(Header, out var header);
        var hasRevision = request.Headers.TryGetValue(HeaderNames.IfMatch, out var match);
        if (contract is null || (!hasKey && !hasRevision))
        {
            await next(context);
            return;
        }

        Guid key = default;
        if (hasKey && !TryParseKey(header.Count == 1 ? header[0] : null, out key))
        {
            await ApiProblems.Create(context, 400, detail: "Idempotency-Key must contain one non-empty UUID.").ExecuteAsync(context);
            return;
        }

        long revision = default;
        if (hasRevision && (contract.RevisionField is null || !TryParseRevision(match.Count == 1 ? match[0] : null, out revision)))
        {
            await ApiProblems.Create(context, 400, detail: "If-Match requires one strong quoted revision number for this operation.").ExecuteAsync(context);
            return;
        }

        if (!request.HasJsonContentType())
        {
            await ApiProblems.Create(context, 415).ExecuteAsync(context);
            return;
        }

        JsonObject? body;
        try
        {
            body = await JsonNode.ParseAsync(request.Body, cancellationToken: context.RequestAborted) as JsonObject;
        }
        catch (JsonException)
        {
            body = null;
        }

        if (body is null || (hasKey && !NormalizeField(body, "operationId", key, value =>
                value.TryGetValue<string>(out var supplied) && Guid.TryParseExact(supplied, "D", out var legacy) && legacy == key)) ||
            (hasRevision && !NormalizeField(body, contract.RevisionField!, revision, value =>
                value.TryGetValue<long>(out var supplied) && supplied == revision)))
        {
            await ApiProblems.Create(context, 400, detail: "Provide a JSON object and ensure the requested headers agree with the body fields when both are supplied.")
                .ExecuteAsync(context);
            return;
        }

        // Let the normal endpoint binder and validator consume the original contract.
        var original = request.Body;
        var length = request.ContentLength;
        using var normalized = new MemoryStream(JsonSerializer.SerializeToUtf8Bytes(body));
        request.Body = normalized;
        request.ContentLength = normalized.Length;
        if (hasRevision) context.Items[ConditionalRevision] = true;
        try
        {
            await next(context);
        }
        finally
        {
            request.Body = original;
            request.ContentLength = length;
        }
    });

    public static void SetRevision(HttpResponse response, long revision) =>
        response.Headers.ETag = $"\"{revision.ToString(CultureInfo.InvariantCulture)}\"";

    private static bool NormalizeField<T>(JsonObject body, string fieldName, T value, Func<JsonValue, bool> matches)
    {
        // Enumerating the backing JSON object also rejects duplicate property names.
        try
        {
            var names = body.Select(field => field.Key).Where(name => name.Equals(fieldName, StringComparison.OrdinalIgnoreCase)).ToArray();
            if (names.Length > 1) return false;
            if (names.Length == 1)
            {
                if (body[names[0]] is { } supplied && (supplied is not JsonValue json || !matches(json)))
                    return false;
                body.Remove(names[0]);
            }
            body[fieldName] = JsonValue.Create(value);
            return true;
        }
        catch (ArgumentException)
        {
            return false;
        }
    }

    private static bool TryParseKey(string? text, out Guid key)
    {
        key = Guid.Empty;
        var raw = text?.Trim();
        if (raw is { Length: 38 } && raw[0] == '"' && raw[^1] == '"') raw = raw[1..^1];
        return raw is { Length: 36 } && Guid.TryParseExact(raw, "D", out key) && key != Guid.Empty;
    }

    private static bool TryParseRevision(string? text, out long revision)
    {
        revision = 0;
        var raw = text.AsSpan().Trim();
        return raw.Length > 2 && raw[0] == '"' && raw[^1] == '"' &&
            long.TryParse(raw[1..^1], NumberStyles.None, CultureInfo.InvariantCulture, out revision) &&
            raw[1..^1].SequenceEqual(revision.ToString(CultureInfo.InvariantCulture));
    }
}
