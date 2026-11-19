using Nexora.Finance.Application;
using Wolverine.Attributes;
using Wolverine.Persistence;

namespace Nexora.Finance.Infrastructure;

public static class ReceivableHandler
{
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<InvoiceNumberingView> Handle(ConfigureInvoiceNumbering command, FinanceDbContext db, ReceivableUseCases service, CancellationToken ct) =>
        service.ConfigureNumberingAsync(command, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<TradeChange> Handle(ConfigureReceivables command, FinanceDbContext db, ReceivableUseCases service, CancellationToken ct) =>
        service.ConfigureAsync(command, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<TradeChange> Handle(SubmitCustomerDocument command, FinanceDbContext db, ReceivableUseCases service, CancellationToken ct) =>
        service.SubmitAsync(command, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<TradeChange> Handle(ReviseCustomerInvoice command, FinanceDbContext db, ReceivableUseCases service, CancellationToken ct) =>
        service.ReviseAsync(command, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<TradeChange> Handle(DecideCustomerDocument command, FinanceDbContext db, ReceivableUseCases service, CancellationToken ct) =>
        service.DecideAsync(command, ct);
}
