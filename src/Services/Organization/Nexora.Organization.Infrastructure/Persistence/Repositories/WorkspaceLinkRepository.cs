using Microsoft.EntityFrameworkCore;
using Nexora.Organization.Application;
using Nexora.Organization.Domain;

namespace Nexora.Organization.Infrastructure;

public sealed class WorkspaceLinkRepository(OrganizationDbContext db) : IWorkspaceLinkRepository
{
    public Task<WorkspaceNavigationLink?> FindAsync(Guid companyId, Guid personalId, IdentityReference actor, CancellationToken ct) =>
        Scoped(companyId, actor).SingleOrDefaultAsync(x => x.PersonalWorkspaceId == personalId, ct);

    public async Task<IReadOnlyList<PersonalLinkView>> ListAsync(Guid companyId, IdentityReference actor, CancellationToken ct) =>
        await Scoped(companyId, actor).AsNoTracking().Where(x => x.IsActive)
            .Select(x => new PersonalLinkView(x.PersonalWorkspaceId, x.CompanyWorkspaceId, true)).ToListAsync(ct);

    public void Add(WorkspaceNavigationLink link) => db.WorkspaceLinks.Add(link);

    private IQueryable<WorkspaceNavigationLink> Scoped(Guid companyId, IdentityReference actor) =>
        db.WorkspaceLinks.Where(x => x.CompanyWorkspaceId == companyId && x.Issuer == actor.Issuer && x.Subject == actor.Subject);
}
