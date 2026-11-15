using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Application;

namespace Nexora.Finance.Infrastructure;

public sealed class FinanceAuditReader(FinanceDbContext db) : IFinanceAuditReader
{
    public async Task<AuditPage> ReadAsync(ResourceScope scope, AuditQuery query, CancellationToken cancellationToken)
    {
        var rows = db.Audit.AsNoTracking()
            .Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId);
        if (query.From is { } from) rows = rows.Where(x => x.OccurredAtUtc >= from);
        if (query.Through is { } through) rows = rows.Where(x => x.OccurredAtUtc <= through);
        if (query.Actor is { Length: > 0 } actor) rows = rows.Where(x => x.Issuer.Contains(actor) || x.Subject.Contains(actor));
        if (query.Action is { Length: > 0 } action) rows = rows.Where(x => x.Action == action);
        if (query.TargetId is { } target) rows = rows.Where(x => x.TargetId == target);
        var page = await rows.OrderByDescending(x => x.OccurredAtUtc).ThenByDescending(x => x.Id)
            .Skip((query.Page - 1) * query.PageSize).Take(query.PageSize + 1).ToArrayAsync(cancellationToken);
        return new(page.Take(query.PageSize).Select(x => new AuditEntry(x.Id, AuditSources.Finance, x.Action, x.Issuer,
            x.Subject, x.TargetId, x.ResultVersion, x.OperationId, x.OccurredAtUtc)).ToArray(), page.Length > query.PageSize);
    }
}
