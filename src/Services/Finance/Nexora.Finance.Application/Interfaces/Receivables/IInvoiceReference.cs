using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public interface IInvoiceReference
{
    Task<InvoiceBrand> BrandAsync(Guid workspaceId, CancellationToken ct);
    Task<InvoiceCustomer> CustomerAsync(Guid workspaceId, Guid customerId, CancellationToken ct);
    Task<ServiceReference> ServiceAsync(Guid workspaceId, Guid itemId, CancellationToken ct);
}
