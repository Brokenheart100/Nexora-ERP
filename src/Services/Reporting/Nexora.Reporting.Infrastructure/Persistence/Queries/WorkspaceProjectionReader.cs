using Microsoft.EntityFrameworkCore;
using Nexora.Reporting.Application;

namespace Nexora.Reporting.Infrastructure;

public sealed class WorkspaceProjectionReader(ReportingDbContext db) : IWorkspaceProjectionReader
{
    public Task<WorkspaceProjection?> FindAsync(Guid id, CancellationToken cancellationToken) =>
        db.Workspaces.AsNoTracking().SingleOrDefaultAsync(x => x.WorkspaceId == id, cancellationToken);
}
