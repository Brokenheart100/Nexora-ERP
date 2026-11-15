using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Domain;

namespace Nexora.Organization.Application;

public sealed class AccountMapping(IUserAccountRepository repository)
{
    public async Task<UserAccount> EnsureAsync(ActorContext actor, CancellationToken cancellationToken)
    {
        var identity = new IdentityReference(actor.Issuer, actor.Subject);
        var existing = await repository.FindAsync(identity, cancellationToken);
        if (existing is not null)
        {
            if (!existing.IsActive) throw new AccessDeniedException();
            if (actor.EmailVerified && actor.Email is not null) existing.ObserveVerifiedEmail(actor.Email);
            return existing;
        }
        var account = UserAccount.Register(identity, actor.EmailVerified ? actor.Email : null);
        repository.Add(account);
        return account;
    }
}
