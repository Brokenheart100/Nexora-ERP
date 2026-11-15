using Nexora.Finance.Application;
using Wolverine.Attributes;
using Wolverine.Persistence;

namespace Nexora.Finance.Infrastructure;

public static class InvoiceShareHandler
{
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<InvoiceShareView> Handle(CreateInvoiceShare command, FinanceDbContext db, ReceivableUseCases service,
        IInvoiceShares shares, CancellationToken ct) => service.CreateShareAsync(command, shares, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<InvoiceShareView> Handle(RevokeInvoiceShare command, FinanceDbContext db, ReceivableUseCases service,
        IInvoiceShares shares, CancellationToken ct) => service.RevokeShareAsync(command, shares, ct);
}
