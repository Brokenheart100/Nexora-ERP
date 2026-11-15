using Nexora.Organization.Domain;

namespace Nexora.Organization.Application;

public interface IBillingRepository
{
    Task<WorkspaceSubscription?> FindSubscriptionAsync(IdentityReference owner, CancellationToken cancellationToken);
    void AddSubscription(WorkspaceSubscription subscription);
    Task<BillingInvoice?> FindInvoiceAsync(Guid invoiceId, CancellationToken cancellationToken);
    void AddInvoice(BillingInvoice invoice);
    Task<IReadOnlyList<BillingInvoice>> ListInvoicesAsync(Guid billingAccountId, CancellationToken cancellationToken);
    Task<BillingUsageReservation?> FindReservationAsync(Guid operationId, CancellationToken cancellationToken);
    Task<BillingUsageReservation?> TryReserveAsync(BillingUsageReservation reservation, CancellationToken cancellationToken);
    Task<bool> TryIncrementUsageAsync(Guid billingAccountId, DateOnly periodMonth, int count, int limit, CancellationToken cancellationToken);
}
