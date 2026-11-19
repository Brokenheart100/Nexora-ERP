using Nexora.Finance.Application;
using Wolverine.Attributes;
using Wolverine.Persistence;

namespace Nexora.Finance.Infrastructure;

public static class DonationReceiptHandler
{
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<DonationFiscalTicketView> Handle(LinkDonationFiscalTicket command, FinanceDbContext db,
        DonationFiscalTickets tickets, CancellationToken ct) => tickets.LinkAsync(command, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<(DonationDispatchView, DeliverInvoiceMail?)> Handle(QueueDonationReceiptMail command, FinanceDbContext db,
        DonationReceiptMail mail, CancellationToken ct) => mail.QueueAsync(command, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<(DonationDispatchView, DeliverInvoiceMail?)> Handle(DecideDonationReceiptMail command, FinanceDbContext db,
        DonationReceiptMail mail, CancellationToken ct) => mail.DecideAsync(command, ct);
}
