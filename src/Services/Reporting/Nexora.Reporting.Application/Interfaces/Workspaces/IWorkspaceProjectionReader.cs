namespace Nexora.Reporting.Application;

public interface IWorkspaceProjectionReader
{
    Task<WorkspaceProjection?> FindAsync(Guid id, CancellationToken cancellationToken);
}
