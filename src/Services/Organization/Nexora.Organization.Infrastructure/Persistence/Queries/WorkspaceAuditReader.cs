using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Application;

namespace Nexora.Organization.Infrastructure;

public sealed class WorkspaceAuditReader(OrganizationDbContext db) : IWorkspaceAuditReader
{
    public async Task<AuditPage> ReadAsync(ResourceScope scope, AuditQuery query, CancellationToken cancellationToken)
    {
        var rows = db.Audits.AsNoTracking()
            .Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId);
        if (query.From is { } from) rows = rows.Where(x => x.OccurredAtUtc >= from);
        if (query.Through is { } through) rows = rows.Where(x => x.OccurredAtUtc <= through);
        if (query.Actor is { Length: > 0 } actor)
            rows = rows.Where(x => x.ActorIssuer.Contains(actor) || x.ActorSubject.Contains(actor));
        if (query.Action is { Length: > 0 } action) rows = rows.Where(x => x.Action == action);
        if (query.TargetId is { } target) rows = rows.Where(x => x.TargetId == target);
        var page = await rows.OrderByDescending(x => x.OccurredAtUtc).ThenByDescending(x => x.Id)
            .Skip((query.Page - 1) * query.PageSize).Take(query.PageSize + 1).ToArrayAsync(cancellationToken);
        return new(page.Take(query.PageSize).Select(x => new AuditEntry(x.Id, AuditSources.Organization, x.Action,
            x.ActorIssuer, x.ActorSubject, x.TargetId, x.AuthorizationVersion, null, x.OccurredAtUtc)).ToArray(),
            page.Length > query.PageSize);
    }
}
