using Microsoft.EntityFrameworkCore;
using Nexora.Organization.Contracts;
using Wolverine.Attributes;

namespace Nexora.Reporting.Infrastructure;

public static class WorkspaceCreatedHandler
{
    [Transactional]
    public static async Task Handle(WorkspaceAuthorizationChangedV1 fact, ReportingDbContext db, CancellationToken cancellationToken)
    {
        if (fact.WorkspaceId == Guid.Empty || fact.TenantId == Guid.Empty || fact.EventId == Guid.Empty || fact.AuthorizationVersion < 2)
            throw new InvalidOperationException("Invalid workspace authorization fact.");
        var existing = await db.AuthorizationVersions.SingleOrDefaultAsync(x => x.WorkspaceId == fact.WorkspaceId, cancellationToken);
        if (existing is null) db.AuthorizationVersions.Add(new(fact.WorkspaceId, fact.TenantId, fact.AuthorizationVersion, fact.EventId));
        else
        {
            if (existing.TenantId != fact.TenantId) throw new InvalidOperationException("Conflicting workspace authorization scope.");
            if (fact.AuthorizationVersion > existing.Version)
                db.Entry(existing).CurrentValues.SetValues(new WorkspaceAuthorizationWatermark(fact.WorkspaceId, fact.TenantId, fact.AuthorizationVersion, fact.EventId));
        }
    }

    [Transactional]
    public static async Task Handle(WorkspaceCreatedV1 fact, ReportingDbContext db, CancellationToken cancellationToken)
    {
        if (WorkspaceCreatedV1.SchemaVersion != 1 || fact.TenantId == Guid.Empty || fact.WorkspaceId == Guid.Empty || fact.EventId == Guid.Empty || fact.Version != 1)
            throw new InvalidOperationException("Invalid workspace-created fact.");
        // A fresh transport MessageId must not duplicate the underlying business fact.
        // The database key resolves concurrent duplicates even across consumer instances.
        var current = await db.Workspaces.SingleOrDefaultAsync(x => x.WorkspaceId == fact.WorkspaceId, cancellationToken);
        if (current is not null)
        {
            if (current.TenantId != fact.TenantId || current.LastEventId != fact.EventId || current.Name != fact.Name
                || current.CountryCode != fact.CountryCode || current.BaseCurrency != fact.BaseCurrency || current.Version != fact.Version)
                throw new InvalidOperationException("Conflicting creation fact.");
            return;
        }
        db.Workspaces.Add(new(fact.WorkspaceId, fact.TenantId, fact.Name, fact.CountryCode,
            fact.BaseCurrency, fact.Version, fact.EventId, DateTimeOffset.UtcNow));
    }
}
