using Nexora.Finance.Application;
using Wolverine;
using Wolverine.Attributes;
using Wolverine.Persistence;

namespace Nexora.Finance.Infrastructure;

public static class RecurringHandler
{
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static async Task<(ScheduleChange, OutgoingMessages)> Handle(SkipInvoiceSchedule command, FinanceDbContext db,
        ReceivableUseCases service, IRecurringInvoices recurring, CancellationToken ct) =>
        Wrap(await service.SkipScheduleAsync(command, recurring, ct));

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static async Task<(ScheduleChange, OutgoingMessages)> Handle(SaveInvoiceSchedule command, FinanceDbContext db,
        ReceivableUseCases service, IRecurringInvoices recurring, CancellationToken ct) =>
        Wrap(await service.SaveScheduleAsync(command, recurring, ct));

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static async Task<(ScheduleChange, OutgoingMessages)> Handle(PauseInvoiceSchedule command, FinanceDbContext db,
        ReceivableUseCases service, IRecurringInvoices recurring, CancellationToken ct) =>
        Wrap(await service.PauseScheduleAsync(command, recurring, ct));

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static async Task<(ScheduleChange, OutgoingMessages)> Handle(RunInvoiceSchedule command, FinanceDbContext db,
        ReceivableUseCases service, IRecurringInvoices recurring, CancellationToken ct) =>
        Wrap(await service.RunScheduleAsync(command, recurring, ct));

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static async Task<OutgoingMessages> Handle(InvoiceScheduleDue command, FinanceDbContext db,
        ReceivableUseCases service, IChartStore chart, IRecurringInvoices recurring, CancellationToken ct) =>
        Messages(await service.TriggerAsync(command, chart, recurring, ct));

    private static (ScheduleChange, OutgoingMessages) Wrap((ScheduleChange Change, ScheduleWake? Wake) result) =>
        (result.Change, Messages(result.Wake));

    private static OutgoingMessages Messages(ScheduleWake? wake)
    {
        var messages = new OutgoingMessages();
        if (wake is not null) messages.Schedule(wake.Command, wake.At);
        return messages;
    }
}
