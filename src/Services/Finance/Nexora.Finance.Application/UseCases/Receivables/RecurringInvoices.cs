using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed partial class ReceivableUseCases
{
    public async Task<ScheduleView[]> SchedulesAsync(Guid workspace, int page, IRecurringInvoices recurring, CancellationToken ct)
    {
        RequirePage(page);
        var (current, _) = await access.ReadAsync(workspace, ct);
        return (await recurring.ListAsync(current.Scope, page, ct)).Select(x => new ScheduleView(x.Id, x.Version, x.Paused,
            x.Terms with { Brand = x.Terms.Brand with { LogoPngBase64 = null } }, x.NextOn, x.LastOn, x.PendingReason, x.Preview(12))).ToArray();
    }

    public async Task<InvoiceOccurrence[]> OccurrencesAsync(Guid workspace, Guid id, int page, IRecurringInvoices recurring, CancellationToken ct)
    {
        RequirePage(page);
        var (current, _) = await access.ReadAsync(workspace, ct);
        await FindScheduleAsync(current.Scope, id, recurring, ct);
        return await recurring.HistoryAsync(current.Scope, id, page, ct);
    }

    public async Task<(ScheduleChange, ScheduleWake?)> SaveScheduleAsync(SaveInvoiceSchedule command, IRecurringInvoices recurring, CancellationToken ct)
    {
        const string action = "receivables.schedule-saved";
        var (current, book) = await access.LockAsync(command.WorkspaceId, LedgerPermissions.Draft, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return (new(replay.TargetId!.Value, replay.ResultVersion), null);
        await SetupAsync(current.Scope, ct);
        var input = command.Input ?? throw new ArgumentException("Schedule terms are required.");
        var actor = Actor(current);
        var existing = command.Id is Guid id ? await FindScheduleAsync(current.Scope, id, recurring, ct) : null;
        if (existing is not null && existing.Version != command.ExpectedVersion)
            throw new RevisionConflictException("The schedule has changed.");
        if (existing is null && command.ExpectedVersion != 0)
            throw new ArgumentException("A new schedule requires version zero.");
        var customer = await references.CustomerAsync(command.WorkspaceId, input.CustomerId, ct);
        var item = await references.ServiceAsync(command.WorkspaceId, input.ServiceId, ct);
        var brand = await references.BrandAsync(command.WorkspaceId, ct);
        var anchor = existing is not null && existing.NextOn == input.NextOn ? existing.Terms.AnchorDay : input.NextOn.Day;
        var terms = new RecurringTerms(customer.Id, customer.Name, item.Id, item.Name, input.Quantity, input.UnitPrice,
            brand, input.IntervalMonths, anchor, input.EndsOn, input.DueDays);
        await TaxAsync(current.Scope, book, input.NextOn, item.Id, customer.Id, input.UnitPrice, input.Quantity, ct);
        var schedule = existing ?? new InvoiceSchedule(book, terms, input.NextOn, actor);
        if (existing is null) recurring.Add(schedule);
        else schedule.Revise(book, terms, input.NextOn, actor);
        mutations.Record(current, command.OperationId, action, command, schedule.Id, schedule.Version);
        return (new(schedule.Id, schedule.Version), Wake(schedule));
    }

    public async Task<(ScheduleChange, ScheduleWake?)> PauseScheduleAsync(PauseInvoiceSchedule command, IRecurringInvoices recurring, CancellationToken ct)
    {
        const string action = "receivables.schedule-paused";
        var (current, _) = await access.LockAsync(command.WorkspaceId, LedgerPermissions.Draft, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return (new(replay.TargetId!.Value, replay.ResultVersion), null);
        var schedule = await FindScheduleAsync(current.Scope, command.Id, recurring, ct);
        if (schedule.Version != command.ExpectedVersion) throw new RevisionConflictException("The schedule has changed.");
        schedule.SetPaused(command.Paused);
        mutations.Record(current, command.OperationId, action, command, schedule.Id, schedule.Version);
        return (new(schedule.Id, schedule.Version), Wake(schedule));
    }

    public async Task<(ScheduleChange, ScheduleWake?)> RunScheduleAsync(RunInvoiceSchedule command, IRecurringInvoices recurring, CancellationToken ct)
    {
        const string action = "receivables.schedule-run";
        var (current, book) = await access.LockAsync(command.WorkspaceId, LedgerPermissions.Draft, ct);
        var schedule = await FindScheduleAsync(current.Scope, command.Id, recurring, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        var existing = await recurring.FindOccurrenceAsync(current.Scope, schedule.Id, command.On, ct);
        if (replay is not null || existing is not null) return (new(schedule.Id, schedule.Version, existing?.DocumentId, schedule.PendingReason), null);
        if (!schedule.Ready(command.On, clock.GetUtcNow()))
            throw new LedgerRuleException("This scheduled occurrence is paused, future or superseded.");
        var invoice = await GenerateAsync(current.Scope, book, schedule, command.On, recurring, ct);
        mutations.Record(current, command.OperationId, action, command, schedule.Id, schedule.Version);
        return (new(schedule.Id, schedule.Version, invoice, schedule.PendingReason), invoice is null ? null : Wake(schedule));
    }

    public async Task<ScheduleWake?> TriggerAsync(InvoiceScheduleDue command, IChartStore chart, IRecurringInvoices recurring, CancellationToken ct)
    {
        var scope = new ResourceScope(command.TenantId, command.WorkspaceId);
        var book = await chart.LockBookAsync(scope, ct) ?? throw new ResourceNotFoundException();
        var schedule = await recurring.FindAsync(scope, command.Id, ct);
        if (schedule is null || schedule.Version != command.Version || schedule.NextOn != command.On || schedule.Paused) return null;
        if (!schedule.Ready(command.On, clock.GetUtcNow())) return Wake(schedule);
        var invoice = await GenerateAsync(scope, book, schedule, command.On, recurring, ct);
        return invoice is null ? null : Wake(schedule);
    }

    private async Task<Guid?> GenerateAsync(ResourceScope scope, AccountingBook book, InvoiceSchedule schedule, DateOnly on,
        IRecurringInvoices recurring, CancellationToken ct)
    {
        var terms = schedule.Terms;
        CustomerDocument invoice;
        try
        {
            var amounts = await TaxAsync(scope, book, on, terms.ServiceId, terms.CustomerId, terms.UnitPrice, terms.Quantity, ct);
            var row = new InvoiceLine(null, terms.ServiceId, terms.ServiceName, terms.Quantity, terms.UnitPrice, amounts.Net,
                amounts.Tax, amounts.Components.ToArray());
            var number = FormattableString.Invariant($"R-{schedule.Id:N}-{on:yyyyMMdd}");
            invoice = new CustomerDocument(book, new(CustomerDocumentKind.Invoice, number, on, terms.CustomerId, terms.CustomerName,
                book.BaseCurrency, row.Net + row.Tax, [row], terms.Brand, DueOn: on.AddDays(terms.DueDays)),
                new(schedule.MakerIssuer, schedule.MakerSubject), clock.GetUtcNow());
        }
        catch (Exception error) when (error is LedgerRuleException or ArgumentException)
        {
            schedule.WaitFor(error.Message);
            return null;
        }
        receivables.Add(invoice);
        recurring.Add(new InvoiceOccurrence(scope.TenantId, scope.WorkspaceId, schedule.Id, on, schedule.Version, invoice.Id, clock.GetUtcNow()));
        schedule.Complete(on);
        return invoice.Id;
    }

    private static ScheduleWake? Wake(InvoiceSchedule schedule) => !schedule.Paused && schedule.NextOn is DateOnly on
        ? new(new(schedule.TenantId, schedule.WorkspaceId, schedule.Id, schedule.Version, on), InvoiceSchedule.DueAt(on, schedule.Terms.Brand.TimeZone))
        : null;

    private static async Task<InvoiceSchedule> FindScheduleAsync(ResourceScope scope, Guid id, IRecurringInvoices recurring, CancellationToken ct) =>
        await recurring.FindAsync(scope, id, ct) ?? throw new ResourceNotFoundException();
}
