using Nexora.Organization.Domain;

namespace Nexora.Organization.Application;

public interface IUserAccountRepository
{
    Task<UserAccount?> FindAsync(IdentityReference identity, CancellationToken cancellationToken);
    void Add(UserAccount account);
}

public interface IInvitationTokens
{
    (string Token, string Hash) Create();
    string Hash(string token);
}
