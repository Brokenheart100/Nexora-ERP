using Nexora.Purchasing.Application;
using Wolverine.Attributes;
using Wolverine.Persistence;

namespace Nexora.Purchasing.Infrastructure;

public static class PurchaseOrderHandler
{
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<PurchaseChange> Handle(CreatePurchase command, PurchasingDbContext db, PurchaseCommands commands, CancellationToken ct) =>
        commands.CreateAsync(command, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<PurchaseChange> Handle(EditPurchase command, PurchasingDbContext db, PurchaseCommands commands, CancellationToken ct) =>
        commands.EditAsync(command, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<PurchaseChange> Handle(DecidePurchase command, PurchasingDbContext db, PurchaseCommands commands, CancellationToken ct) =>
        commands.DecideAsync(command, ct);
}
