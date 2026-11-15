using Nexora.Organization.Domain;

namespace Nexora.Organization.Application;

public interface IAccountDeletionImpactReader
{
    Task<AccountDeletionImpact> ReadAsync(IdentityReference identity, CancellationToken ct);
}
