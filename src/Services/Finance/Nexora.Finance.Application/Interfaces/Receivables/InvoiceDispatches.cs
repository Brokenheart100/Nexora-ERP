using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public interface IInvoiceDispatches
{
    Task<InvoiceDispatch?> FindAsync(ResourceScope scope, Guid id, CancellationToken ct);
    Task<InvoiceDispatch[]> ListAsync(ResourceScope scope, Guid invoiceId, CancellationToken ct);
    void Add(InvoiceDispatch dispatch);
}

public interface IInvoiceMail
{
    string ChannelStatus { get; }
    Task<DispatchOutcome> SendAsync(Guid id, int attempt, string recipient, CustomerTerms invoice, InvoicePdf pdf, CancellationToken ct);
}
