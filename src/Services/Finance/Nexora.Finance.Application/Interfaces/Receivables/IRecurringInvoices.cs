using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public interface IRecurringInvoices
{
    Task<InvoiceSchedule?> FindAsync(ResourceScope scope, Guid id, CancellationToken ct);
    Task<InvoiceSchedule[]> ListAsync(ResourceScope scope, int page, CancellationToken ct);
    Task<InvoiceOccurrence[]> HistoryAsync(ResourceScope scope, Guid id, int page, CancellationToken ct);
    Task<InvoiceOccurrence?> FindOccurrenceAsync(ResourceScope scope, Guid id, DateOnly on, CancellationToken ct);
    void Add(InvoiceSchedule schedule);
    void Add(InvoiceOccurrence occurrence);
}
