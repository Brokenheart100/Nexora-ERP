using System.Globalization;
using Microsoft.Net.Http.Headers;
using Nexora.Sales.Application;

namespace Nexora.Sales.Api;

internal static class SalesOrderHeaders
{
    public const string IdempotencyKey = "Idempotency-Key";

    public static Guid OperationId(HttpRequest request, Guid? bodyValue)
    {
        if (!request.Headers.TryGetValue(IdempotencyKey, out var header))
            return bodyValue is { } operation && operation != Guid.Empty
                ? operation : throw new ArgumentException("Provide Idempotency-Key or operationId.");

        var raw = header.Count == 1 ? header[0]?.Trim() : null;
        if (raw is { Length: 38 } && raw[0] == '"' && raw[^1] == '"') raw = raw[1..^1];
        if (raw is not { Length: 36 } || !Guid.TryParseExact(raw, "D", out var key) || key == Guid.Empty)
            throw new ArgumentException("Idempotency-Key must contain one non-empty UUID.");
        if (bodyValue is { } legacy && legacy != key)
            throw new ArgumentException("Idempotency-Key and operationId must identify the same operation.");
        return key;
    }

    public static (long Version, SalesOrderCondition? Condition) Version(HttpRequest request, Guid orderId, long? bodyValue)
    {
        if (bodyValue is <= 0) throw new ArgumentException("expectedVersion must be positive.");
        if (!request.Headers.TryGetValue(HeaderNames.IfMatch, out var header))
            return (bodyValue ?? throw new ArgumentException("Provide If-Match or expectedVersion."), null);

        if (!EntityTagHeaderValue.TryParseStrictList(header.Select(value => value ?? "").ToArray(), out var tags) || tags.Count == 0)
            throw new ArgumentException("If-Match must contain valid entity tags or *.");

        if (tags.Contains(EntityTagHeaderValue.Any))
        {
            if (tags.Count != 1) throw new ArgumentException("If-Match * must appear alone.");
            return (bodyValue ?? 0, new(true, []));
        }

        var revisions = new List<SalesOrderRevision>();
        var prefix = TagPrefix(orderId);
        foreach (var tag in tags)
        {
            var text = tag.Tag.Value;
            if (tag.IsWeak || text is null || !text.StartsWith(prefix, StringComparison.Ordinal) || text.Length <= prefix.Length + 3)
                continue;
            if (!long.TryParse(text.AsSpan(prefix.Length, text.Length - prefix.Length - 3), NumberStyles.None,
                    CultureInfo.InvariantCulture, out var version) || version <= 0)
                continue;
            var revision = new SalesOrderRevision(version, text[^2] == 'm');
            if (text == Format(orderId, revision)) revisions.Add(revision);
        }

        var distinct = revisions.Distinct().OrderBy(x => x.Version).ThenBy(x => x.IsMaker).ToArray();
        var single = distinct.Length > 0 && distinct[0].Version == distinct[^1].Version ? distinct[0].Version : 0;
        return (bodyValue ?? single, new(false, distinct));
    }

    public static EntityTagHeaderValue ETag(SalesDetail order) =>
        new(Format(order.Order.Id, new(order.Order.Version, order.IsMaker)));

    private static string TagPrefix(Guid id) => $"\"sales-order-1-{id:N}-";

    private static string Format(Guid id, SalesOrderRevision revision) =>
        $"{TagPrefix(id)}{revision.Version.ToString(CultureInfo.InvariantCulture)}-{(revision.IsMaker ? 'm' : 'r')}\"";
}
