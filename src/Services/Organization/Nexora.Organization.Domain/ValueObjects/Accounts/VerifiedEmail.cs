namespace Nexora.Organization.Domain;

public sealed record VerifiedEmail
{
    public string Value { get; }
    public VerifiedEmail(string value)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(value);
        var normalized = value.Trim().ToLowerInvariant();
        if (normalized.Length > 254 || !System.Net.Mail.MailAddress.TryCreate(normalized, out var address)
            || address.Address != normalized || !normalized.Contains('@')) throw new ArgumentException("Invalid email address.");
        Value = normalized;
    }
}
