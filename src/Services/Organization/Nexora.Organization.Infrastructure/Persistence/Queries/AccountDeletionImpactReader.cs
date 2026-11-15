using Microsoft.EntityFrameworkCore;
using Nexora.Organization.Application;
using Nexora.Organization.Domain;

namespace Nexora.Organization.Infrastructure;

public sealed class AccountDeletionImpactReader(OrganizationDbContext db) : IAccountDeletionImpactReader
{
    public async Task<AccountDeletionImpact> ReadAsync(IdentityReference identity, CancellationToken ct)
    {
        var memberships = db.Members.AsNoTracking().Where(x => x.IsActive);
        var actorMemberships = memberships.Where(x => x.Issuer == identity.Issuer && x.Subject == identity.Subject);
        var workspaces = await db.Workspaces.AsNoTracking()
            .Where(x => actorMemberships.Any(m => m.WorkspaceId == x.Id && (m.Role == GovernanceRoles.Owner || m.Role == GovernanceRoles.Administrator)))
            .OrderBy(x => x.Name).ThenBy(x => x.Id)
            .Select(x => new DeletionWorkspace(x.Id, x.Name, x.IsPersonal,
                actorMemberships.Any(m => m.WorkspaceId == x.Id && m.Role == GovernanceRoles.Owner),
                actorMemberships.Any(m => m.WorkspaceId == x.Id && (m.Role == GovernanceRoles.Owner || m.Role == GovernanceRoles.Administrator))
                && !memberships.Any(m => m.WorkspaceId == x.Id && (m.Issuer != identity.Issuer || m.Subject != identity.Subject)
                    && (m.Role == GovernanceRoles.Owner || m.Role == GovernanceRoles.Administrator))))
            .ToArrayAsync(ct);
        var links = await db.WorkspaceLinks.AsNoTracking().CountAsync(x => x.IsActive
            && x.Issuer == identity.Issuer && x.Subject == identity.Subject, ct);
        return new(workspaces, links);
    }
}
