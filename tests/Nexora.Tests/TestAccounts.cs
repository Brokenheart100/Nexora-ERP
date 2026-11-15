using Nexora.Organization.Application;
using Nexora.Organization.Domain;

namespace Nexora.Tests;

internal sealed class TestAccounts : IUserAccountRepository
{
    private readonly List<UserAccount> accounts = [];
    public void Add(UserAccount account) => accounts.Add(account);
    public Task<UserAccount?> FindAsync(IdentityReference identity, CancellationToken cancellationToken) =>
        Task.FromResult(accounts.SingleOrDefault(x => x.Issuer == identity.Issuer && x.Subject == identity.Subject));
}
