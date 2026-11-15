using Nexora.Organization.Domain;

namespace Nexora.Organization.Application;

public interface IBillingCounters
{
    Task<int> CountOwnedWorkspacesAsync(IdentityReference owner, CancellationToken cancellationToken);
    Task<int> CountWorkspaceSeatsAsync(Guid workspaceId, CancellationToken cancellationToken);
    Task<int> CountDocumentsAsync(Guid billingAccountId, DateOnly periodMonth, CancellationToken cancellationToken);
}
