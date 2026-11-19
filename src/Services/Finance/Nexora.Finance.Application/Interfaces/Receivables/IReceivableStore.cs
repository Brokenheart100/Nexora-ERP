using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public interface IReceivableStore
{
    Task<ReceivableSetup?> SetupAsync(ResourceScope scope, CancellationToken ct);
    Task<CustomerDocument?> FindAsync(ResourceScope scope, Guid id, CancellationToken ct);
    Task<CustomerDocument[]> ListAsync(ResourceScope scope, int page, CancellationToken ct, bool postedInvoicesOnly = false);
    Task<long> LastSequenceAsync(ResourceScope scope, int fiscalYear, CancellationToken ct);
    Task<bool> NumberExistsAsync(ResourceScope scope, string number, CancellationToken ct);
    Task<bool> HasUnnumberedInvoicesAsync(ResourceScope scope, CancellationToken ct);
    Task<CustomerDocument[]> CreditsAsync(ResourceScope scope, Guid invoiceId, CancellationToken ct);
    Task<ReceiptAccrual[]> ShipmentsAsync(ResourceScope scope, int page, CancellationToken ct);
    void Add(ReceivableSetup setup);
    void Add(CustomerDocument document);
}
