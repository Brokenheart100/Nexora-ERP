namespace Nexora.Organization.Domain;

public sealed class UserAccount
{
    public Guid Id { get; private set; }
    public string Issuer { get; private set; } = "";
    public string Subject { get; private set; } = "";
    public string? VerifiedEmail { get; private set; }
    public bool IsActive { get; private set; } = true;
    private UserAccount() { }
    public void ObserveVerifiedEmail(string email) => VerifiedEmail = new VerifiedEmail(email).Value;
    public static UserAccount Register(IdentityReference identity, string? verifiedEmail) => new()
    {
        Id = Guid.CreateVersion7(), Issuer = identity.Issuer, Subject = identity.Subject,
        VerifiedEmail = verifiedEmail is null ? null : new VerifiedEmail(verifiedEmail).Value
    };
}
