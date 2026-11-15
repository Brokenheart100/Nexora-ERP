using System.Security.Cryptography;
using System.Text;
using Nexora.Organization.Application;

namespace Nexora.Organization.Infrastructure;

public sealed class InvitationTokens : IInvitationTokens
{
    public (string Token, string Hash) Create()
    {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        return (token, Hash(token));
    }
    public string Hash(string token)
    {
        ArgumentNullException.ThrowIfNull(token);
        if (token.Length != 64 || !token.All(Uri.IsHexDigit)) throw new ArgumentException("Invalid invitation token format.");
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();
    }
}
