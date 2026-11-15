using Nexora.Inventory.Application;
using Nexora.Purchasing.Contracts;
using Wolverine.Attributes;
using Wolverine.Persistence;

namespace Nexora.Inventory.Infrastructure;

public static class InventoryHandler
{
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<InventoryChange> Handle(AddWarehouse command, InventoryDbContext db, InventoryUseCases service, CancellationToken ct) =>
        service.AddAsync(command, ct);
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<InventoryChange> Handle(AssignWarehouse command, InventoryDbContext db, InventoryUseCases service, CancellationToken ct) =>
        service.AssignAsync(command, ct);
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static async Task<(InventoryChange, ReceiptProgressV1?, InventoryCostedV1?)> Handle(ReceiveStock command, InventoryDbContext db,
        InventoryUseCases service, CancellationToken ct)
    {
        var result = await service.ReceiveAsync(command, ct);
        return (result.Result, result.Progress, result.Costed);
    }
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<ReceiptProgressV1> Handle(ReceiptGrantedV1 command, InventoryDbContext db, InventoryUseCases service, CancellationToken ct) =>
        service.AcceptAsync(command.Ticket, false, ct);
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<ReceiptProgressV1> Handle(ReceiptFenceV1 command, InventoryDbContext db, InventoryUseCases service, CancellationToken ct) =>
        service.AcceptAsync(command.Ticket, true, ct);
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<InventoryChange> Handle(AuthorizeStockReturn command, InventoryDbContext db,
        InventoryUseCases service, CancellationToken ct) => service.AuthorizeReturnAsync(command, ct);
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<(InventoryChange, InventoryCostedV1?)> Handle(DecideStockReturn command, InventoryDbContext db,
        InventoryUseCases service, CancellationToken ct) => service.DecideReturnAsync(command, ct);
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<InventoryCostedV1> Handle(PurchaseVarianceV1 command, InventoryDbContext db, InventoryUseCases service, CancellationToken ct) =>
        service.ApplyVarianceAsync(command, ct);
}
