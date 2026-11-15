using Microsoft.EntityFrameworkCore;
using Nexora.Organization.Application;
using Nexora.Organization.Domain;

namespace Nexora.Organization.Infrastructure;

public sealed class UserAccountRepository(OrganizationDbContext db) : IUserAccountRepository
{
    public Task<UserAccount?> FindAsync(IdentityReference identity, CancellationToken cancellationToken) =>
        db.Accounts.SingleOrDefaultAsync(x => x.Issuer == identity.Issuer && x.Subject == identity.Subject, cancellationToken);
    public void Add(UserAccount account) => db.Accounts.Add(account);
}
