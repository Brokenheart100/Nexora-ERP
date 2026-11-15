namespace Nexora.Organization.Domain;

public sealed record IdentityReference
{
    public string Issuer { get; }
    public string Subject { get; }

    public IdentityReference(string issuer, string subject)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(issuer);
        ArgumentException.ThrowIfNullOrWhiteSpace(subject);
        if (issuer.Length > 500 || subject.Length > 200) throw new ArgumentException("Identity reference is too long.");
        Issuer = issuer;
        Subject = subject;
    }
}
