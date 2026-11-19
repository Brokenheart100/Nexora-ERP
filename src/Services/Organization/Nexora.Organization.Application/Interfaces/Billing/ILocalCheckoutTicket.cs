using Nexora.Organization.Domain;

namespace Nexora.Organization.Application;

public interface ILocalCheckoutTicket
{
    string Sign(BillingInvoice invoice);
    bool Valid(BillingInvoice invoice, string? ticket);
}
