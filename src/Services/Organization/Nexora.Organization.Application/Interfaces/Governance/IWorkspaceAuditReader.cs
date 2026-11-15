using Nexora.BuildingBlocks.Application;

namespace Nexora.Organization.Application;

public interface IWorkspaceAuditReader
{
    Task<AuditPage> ReadAsync(ResourceScope scope, AuditQuery query, CancellationToken cancellationToken);
}
