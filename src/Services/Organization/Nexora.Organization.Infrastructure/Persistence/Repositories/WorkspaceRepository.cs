using Microsoft.EntityFrameworkCore;
using Nexora.Organization.Application;
using Nexora.Organization.Domain;

namespace Nexora.Organization.Infrastructure;

public sealed class WorkspaceRepository(OrganizationDbContext db) : IWorkspaceRepository
{
    public Task<Workspace?> FindAsync(Guid id, CancellationToken cancellationToken) =>
        Aggregate().SingleOrDefaultAsync(x => x.Id == id, cancellationToken);

    public Task<Workspace?> FindOperationAsync(IdentityReference actor, Guid operationId, CancellationToken cancellationToken) =>
        Aggregate().SingleOrDefaultAsync(x => x.OperationId == operationId && x.OwnerIssuer == actor.Issuer && x.OwnerSubject == actor.Subject, cancellationToken);

    public async Task<IReadOnlyList<WorkspaceView>> ListAccessibleAsync(IdentityReference actor, CancellationToken cancellationToken) =>
        await db.Workspaces.AsNoTracking().Where(x => x.Members.Any(m => m.Issuer == actor.Issuer && m.Subject == actor.Subject && m.IsActive))
            .OrderBy(x => x.CreatedAtUtc).Select(x => new WorkspaceView(x.Id, x.TenantId, x.Name, x.CountryCode, x.BaseCurrency, x.Version, x.IsPersonal))
            .ToListAsync(cancellationToken);

    public void Add(Workspace workspace) => db.Workspaces.Add(workspace);
    private IQueryable<Workspace> Aggregate() => db.Workspaces.Include(x => x.Members).Include(x => x.Invitations)
        .Include(x => x.CustomRoles).Include(x => x.RoleGrants).Include(x => x.Departments).AsSplitQuery();
    public Task<Workspace?> FindInvitationAsync(Guid invitationId, CancellationToken cancellationToken) =>
        Aggregate().SingleOrDefaultAsync(x => x.Invitations.Any(i => i.Id == invitationId), cancellationToken);
    public async Task<IReadOnlyList<MemberView>> ListMembersAsync(Guid workspaceId, CancellationToken cancellationToken)
    {
        var rows = await (from m in db.Members.AsNoTracking()
               join u in db.Accounts.AsNoTracking() on new { m.Issuer, m.Subject } equals new { u.Issuer, u.Subject }
               where m.WorkspaceId == workspaceId
               orderby m.JoinedAtUtc
               select new { Member = m, UserId = u.Id, u.VerifiedEmail }).ToListAsync(cancellationToken);
        return rows.Select(row =>
        {
            var m = row.Member;
            var finance = FinanceRoles.Known(m.ProposedRole);
            var purchase = PurchaseRoles.Known(m.ProposedRole);
            var sales = SalesRoles.Known(m.ProposedRole);
            return new MemberView(m.Id, row.UserId, m.Subject, row.VerifiedEmail, m.Role, m.IsActive, m.JoinedAtUtc,
                m.FinanceRole, finance ? m.ProposedRole : null, finance ? m.RoleProposalVersion : null,
                m.PurchaseRole, purchase ? m.ProposedRole : null, purchase ? m.RoleProposalVersion : null,
                m.SalesRole, sales ? m.ProposedRole : null, sales ? m.RoleProposalVersion : null,
                m.ProposedBusinessRoles, m.RoleProposerId, m.RoleProposalVersion, m.RoleProposalExpiresAtUtc);
        }).ToArray();
    }
}
