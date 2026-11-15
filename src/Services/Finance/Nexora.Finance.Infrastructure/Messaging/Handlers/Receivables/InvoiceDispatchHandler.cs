using Nexora.Finance.Application;
using Nexora.Finance.Domain;
using Wolverine;
using Wolverine.Attributes;
using Wolverine.Persistence;

namespace Nexora.Finance.Infrastructure;

public static class InvoiceDispatchHandler
{
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<(DispatchView, DeliverInvoiceMail?)> Handle(QueueInvoiceMail command, FinanceDbContext db,
        ReceivableUseCases service, IInvoiceDispatches dispatches, CancellationToken ct) => service.QueueMailAsync(command, dispatches, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<(DispatchView, DeliverInvoiceMail?)> Handle(DecideInvoiceMail command, FinanceDbContext db,
        ReceivableUseCases service, IInvoiceDispatches dispatches, CancellationToken ct) => service.DecideMailAsync(command, dispatches, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static async Task<(DispatchStart, OutgoingMessages)> Handle(StartInvoiceMail command, FinanceDbContext db,
        ReceivableUseCases service, IChartStore chart, IInvoiceDispatches dispatches, CancellationToken ct)
    {
        var lease = await service.StartMailAsync(command.Delivery, chart, dispatches, ct);
        var messages = new OutgoingMessages();
        if (lease.LeaseUntilUtc is DateTimeOffset until) messages.Schedule(new InvoiceMailLeaseExpired(command.Delivery), until);
        return (lease, messages);
    }

    public static async Task Handle(DeliverInvoiceMail command, IMessageBus bus, IInvoiceRenderer renderer, IInvoiceMail mail, CancellationToken ct)
    {
        var claimed = await bus.InvokeAsync<DispatchStart>(new StartInvoiceMail(command), ct);
        if (claimed.Work is not { } work) return;
        DispatchOutcome outcome;
        try
        {
            var pdf = await renderer.RenderAsync(work.Invoice, false, ct);
            outcome = await mail.SendAsync(command.Id, command.Attempt, work.Recipient, work.Invoice, pdf, ct);
        }
        catch (InvoiceRenderingUnavailableException)
        {
            outcome = new(DispatchState.Failed, "The invoice PDF could not be rendered before sending.");
        }
        await bus.InvokeAsync(new FinishInvoiceMail(command, outcome), ct);
    }

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task Handle(FinishInvoiceMail command, FinanceDbContext db, ReceivableUseCases service, IChartStore chart,
        IInvoiceDispatches dispatches, CancellationToken ct) => service.FinishMailAsync(command.Delivery, command.Outcome, chart, dispatches, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task Handle(InvoiceMailLeaseExpired command, FinanceDbContext db, ReceivableUseCases service, IChartStore chart,
        IInvoiceDispatches dispatches, CancellationToken ct) => service.FinishMailAsync(command.Delivery, null, chart, dispatches, ct);
}
