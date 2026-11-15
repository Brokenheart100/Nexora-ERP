using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Sales.Application;

namespace Nexora.Sales.Infrastructure;

public sealed class SalesAuditReader(SalesDbContext db) : ISalesAuditReader
{
    public async Task<AuditPage> ReadAsync(ResourceScope scope, AuditQuery query, CancellationToken cancellationToken)
    {
        var rows = db.Audit.AsNoTracking()
            .Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId);
        if (query.From is { } from) rows = rows.Where(x => x.OccurredAtUtc >= from);
        if (query.Through is { } through) rows = rows.Where(x => x.OccurredAtUtc <= through);
        if (query.Actor is { Length: > 0 } actor) rows = rows.Where(x => x.Issuer.Contains(actor) || x.Subject.Contains(actor));
        if (query.Action is { Length: > 0 } action) rows = rows.Where(x => x.Action == action);
        if (query.TargetId is { } target) rows = rows.Where(x => x.TargetId == target || x.OrderId == target);
        var page = await rows.OrderByDescending(x => x.OccurredAtUtc).ThenByDescending(x => x.Id)
            .Skip((query.Page - 1) * query.PageSize).Take(query.PageSize + 1).ToArrayAsync(cancellationToken);
        return new(page.Take(query.PageSize).Select(x => new AuditEntry(x.Id, AuditSources.Sales, x.Action, x.Issuer,
            x.Subject, x.TargetId ?? x.OrderId, x.ResultVersion, x.OperationId, x.OccurredAtUtc)).ToArray(), page.Length > query.PageSize);
    }
}
