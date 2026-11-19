using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public interface IInvoiceDispatches
{
    Task<InvoiceDispatch?> FindAsync(ResourceScope scope, Guid id, CancellationToken ct);
    Task<InvoiceDispatch[]> ListAsync(ResourceScope scope, Guid documentId, bool isDonation, CancellationToken ct);
    void Add(InvoiceDispatch dispatch);
}

public interface IInvoiceMail
{
    string ChannelStatus { get; }
    Task<DispatchOutcome> SendAsync(Guid id, int attempt, string recipient, string documentLabel, InvoicePdf pdf, CancellationToken ct);
}
