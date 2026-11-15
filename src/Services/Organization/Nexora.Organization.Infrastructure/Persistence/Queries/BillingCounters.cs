using Microsoft.EntityFrameworkCore;
using Nexora.Organization.Application;
using Nexora.Organization.Domain;

namespace Nexora.Organization.Infrastructure;

public sealed class BillingCounters(OrganizationDbContext db) : IBillingCounters
{
    public Task<int> CountOwnedWorkspacesAsync(IdentityReference owner, CancellationToken cancellationToken) =>
        db.Workspaces.CountAsync(x => x.OwnerIssuer == owner.Issuer && x.OwnerSubject == owner.Subject && !x.IsPersonal, cancellationToken);

    public async Task<int> CountWorkspaceSeatsAsync(Guid workspaceId, CancellationToken cancellationToken)
    {
        var members = await db.Members.CountAsync(x => x.WorkspaceId == workspaceId && x.IsActive, cancellationToken);
        var pending = await db.Invitations.CountAsync(x => x.WorkspaceId == workspaceId
            && (x.State == "Pending" || x.State == "PendingApproval"), cancellationToken);
        return members + pending;
    }

    public Task<int> CountDocumentsAsync(Guid billingAccountId, DateOnly periodMonth, CancellationToken cancellationToken) =>
        db.BillingUsage.Where(x => x.BillingAccountId == billingAccountId && x.PeriodMonth == periodMonth)
            .Select(x => x.Documents).SingleOrDefaultAsync(cancellationToken);
}
