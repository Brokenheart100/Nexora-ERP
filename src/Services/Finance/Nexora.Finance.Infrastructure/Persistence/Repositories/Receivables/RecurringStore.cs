using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

public sealed class RecurringStore(FinanceDbContext db) : IRecurringInvoices
{
    private IQueryable<InvoiceSchedule> Schedules(ResourceScope scope) =>
        db.Set<InvoiceSchedule>().Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId);
    private IQueryable<InvoiceOccurrence> Occurrences(ResourceScope scope, Guid id) =>
        db.Set<InvoiceOccurrence>().Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId && x.ScheduleId == id);

    public Task<InvoiceSchedule?> FindAsync(ResourceScope scope, Guid id, CancellationToken ct) =>
        Schedules(scope).SingleOrDefaultAsync(x => x.Id == id, ct);
    public Task<InvoiceSchedule[]> ListAsync(ResourceScope scope, int page, CancellationToken ct) =>
        Schedules(scope).AsNoTracking().OrderByDescending(x => x.Id).Skip((page - 1) * 50).Take(50).ToArrayAsync(ct);
    public Task<InvoiceOccurrence[]> HistoryAsync(ResourceScope scope, Guid id, int page, CancellationToken ct) =>
        Occurrences(scope, id).AsNoTracking().OrderByDescending(x => x.On).Skip((page - 1) * 50).Take(50).ToArrayAsync(ct);
    public Task<InvoiceOccurrence?> FindOccurrenceAsync(ResourceScope scope, Guid id, DateOnly on, CancellationToken ct) =>
        Occurrences(scope, id).SingleOrDefaultAsync(x => x.On == on, ct);

    public void Add(InvoiceSchedule schedule) => db.Add(schedule);
    public void Add(InvoiceOccurrence occurrence) => db.Add(occurrence);
}
