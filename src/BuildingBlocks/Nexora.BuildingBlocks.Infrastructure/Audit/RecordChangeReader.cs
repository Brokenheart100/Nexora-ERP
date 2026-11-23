using Nexora.BuildingBlocks.Application;
using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;

namespace Nexora.BuildingBlocks.Infrastructure;

public sealed class RecordChangeReader<TContext>(TContext context) : IRecordChangeReader
    where TContext : DbContext
{
    private const int MaxExportRows = 5000;

    public async Task<RecordChangePage> ReadAsync(ResourceScope scope, RecordChangeQuery query,
        CancellationToken cancellationToken)
    {
        var rows = await Query(scope, query)
            .OrderByDescending(change => change.OccurredAtUtc)
            .ThenByDescending(change => change.Id)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize + 1)
            .ToArrayAsync(cancellationToken);
        var hasMore = rows.Length > query.PageSize;
        return new RecordChangePage(rows.Take(query.PageSize).Select(Map).ToArray(), hasMore);
    }

    public async Task<string> ExportCsvAsync(ResourceScope scope, RecordChangeQuery query,
        CancellationToken cancellationToken)
    {
        var rows = await Query(scope, query)
            .OrderByDescending(change => change.OccurredAtUtc)
            .ThenByDescending(change => change.Id)
            .Take(MaxExportRows)
            .ToArrayAsync(cancellationToken);
        var builder = new StringBuilder();
        builder.AppendLine("occurredAtUtc,service,entityName,entityId,operation,actorIssuer,actorSubject,changedProperties,beforeJson,afterJson");
        foreach (var row in rows.Select(Map))
        {
            builder.Append(Escape(row.OccurredAtUtc.ToString("O", CultureInfo.InvariantCulture))).Append(',')
                .Append(Escape(row.Service)).Append(',')
                .Append(Escape(row.EntityName)).Append(',')
                .Append(Escape(row.EntityId)).Append(',')
                .Append(Escape(row.Operation)).Append(',')
                .Append(Escape(row.ActorIssuer)).Append(',')
                .Append(Escape(row.ActorSubject)).Append(',')
                .Append(Escape(row.ChangedProperties ?? string.Empty)).Append(',')
                .Append(Escape(row.BeforeJson ?? string.Empty)).Append(',')
                .Append(Escape(row.AfterJson ?? string.Empty))
                .AppendLine();
        }

        return builder.ToString();
    }

    private IQueryable<RecordChange> Query(ResourceScope scope, RecordChangeQuery query)
    {
        var rows = context.Set<RecordChange>()
            .Where(change => change.TenantId == scope.TenantId && change.WorkspaceId == scope.WorkspaceId);
        if (query.From is { } from) rows = rows.Where(change => change.OccurredAtUtc >= from);
        if (query.Through is { } through) rows = rows.Where(change => change.OccurredAtUtc <= through);
        if (query.EntityName is { } entityName) rows = rows.Where(change => change.EntityName == entityName);
        if (query.Operation is { } operation) rows = rows.Where(change => change.Operation == operation);
        if (query.EntityId is { } entityId) rows = rows.Where(change => change.EntityId == entityId.ToString());
        if (query.Actor is { } actor)
            rows = rows.Where(change => change.ActorSubject == actor || change.ActorIssuer == actor);
        return rows;
    }

    private static RecordChangeView Map(RecordChange change) => new(change.Id, change.Service, change.EntityName,
        change.EntityId, change.Operation, change.TenantId, change.WorkspaceId, change.ActorIssuer, change.ActorSubject,
        change.OccurredAtUtc, RecordChangeRedaction.ChangedProperties(change.ChangedProperties),
        RecordChangeRedaction.Snapshot(change.BeforeJson), RecordChangeRedaction.Snapshot(change.AfterJson));

    private static string Escape(string value)
    {
        if (value.StartsWith('\t') || value.StartsWith('\r') || value.StartsWith('\n') ||
            value.TrimStart().FirstOrDefault() is '=' or '+' or '-' or '@') value = "'" + value;
        if (!value.Contains(',') && !value.Contains('"') && !value.Contains('\n') && !value.Contains('\r')) return value;
        return '"' + value.Replace("\"", "\"\"", StringComparison.Ordinal) + '"';
    }
}
