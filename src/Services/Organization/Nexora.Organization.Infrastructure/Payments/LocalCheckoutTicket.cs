using System.Security.Cryptography;
using System.Text;
using Nexora.Organization.Application;
using Nexora.Organization.Domain;

namespace Nexora.Organization.Infrastructure;

public sealed class LocalCheckoutTicket : ILocalCheckoutTicket
{
    private readonly byte[] _key = RandomNumberGenerator.GetBytes(32);

    public string Sign(BillingInvoice invoice) => Convert.ToHexString(Signature(invoice));

    public bool Valid(BillingInvoice invoice, string? ticket)
    {
        if (ticket is not { Length: 64 } || ticket.Any(x => !Uri.IsHexDigit(x))) return false;
        return CryptographicOperations.FixedTimeEquals(Signature(invoice), Convert.FromHexString(ticket));
    }

    private byte[] Signature(BillingInvoice invoice) => HMACSHA256.HashData(_key, Encoding.UTF8.GetBytes(
        FormattableString.Invariant($"{invoice.WorkspaceId:N}:{invoice.BillingAccountId:N}:{invoice.Id:N}:{invoice.AmountCents}:{invoice.Currency}")));
}
