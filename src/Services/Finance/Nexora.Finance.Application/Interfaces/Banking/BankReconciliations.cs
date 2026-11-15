using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public interface IReconciliationStore
{
    Task<ReconciliationInput> InputsAsync(ResourceScope scope, BankAccount bank, DateOnly through, CancellationToken ct);
    Task<BankReconciliation?> FindAsync(ResourceScope scope, Guid id, CancellationToken ct);
    Task<BankReconciliation[]> ListAsync(ResourceScope scope, Guid bankId, CancellationToken ct);
    Task<DateOnly?> ClosedThroughAsync(ResourceScope scope, Guid bankId, CancellationToken ct);
    Task<bool> AnyClosedAccountAsync(ResourceScope scope, Guid[] accounts, DateOnly on, CancellationToken ct);
    void Add(BankReconciliation reconciliation);
}

public interface IReconciliationRenderer
{
    Task<InvoicePdf> RenderAsync(ReconciliationView reconciliation, string account, string currency, int minorUnits, CancellationToken ct);
}
