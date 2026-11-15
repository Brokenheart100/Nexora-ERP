using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public interface IInvoiceRenderer
{
    Task<InvoicePdf> RenderAsync(CustomerTerms invoice, bool preview, CancellationToken ct);
}

public interface IInvoiceShares
{
    Task<InvoiceShare?> FindAsync(ResourceScope scope, Guid id, CancellationToken ct);
    Task<InvoiceShare?> FindTokenAsync(string hash, CancellationToken ct);
    Task<InvoiceShare[]> ListAsync(ResourceScope scope, Guid invoiceId, CancellationToken ct);
    void Add(InvoiceShare share);
}
