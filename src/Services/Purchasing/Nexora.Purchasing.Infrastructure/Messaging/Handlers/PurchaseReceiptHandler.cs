using Nexora.Purchasing.Application;
using Nexora.Purchasing.Contracts;
using Wolverine.Attributes;
using Wolverine.Persistence;

namespace Nexora.Purchasing.Infrastructure;

public static class PurchaseReceiptHandler
{
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<(PermitChange, ReceiptGrantedV1?)> Handle(IssueReceiptPermit command, PurchasingDbContext db,
        PurchaseReceiptUseCases service, CancellationToken ct) => service.IssueAsync(command, ct);
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<(PermitChange, ReceiptFenceV1?)> Handle(FenceReceiptPermit command, PurchasingDbContext db,
        PurchaseReceiptUseCases service, CancellationToken ct) => service.FenceAsync(command, ct);
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<PurchaseChange> Handle(CloseReceiving command, PurchasingDbContext db,
        PurchaseReceiptUseCases service, CancellationToken ct) => service.CloseAsync(command, ct);
}
