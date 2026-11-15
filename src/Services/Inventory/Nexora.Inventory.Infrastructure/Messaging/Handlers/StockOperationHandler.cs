using Nexora.Inventory.Application;
using Nexora.Purchasing.Contracts;
using Wolverine;
using Wolverine.Attributes;
using Wolverine.Persistence;

namespace Nexora.Inventory.Infrastructure;

public static class StockOperationHandler
{
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<InventoryChange> Handle(PrepareStockOperation command, InventoryDbContext db, InventoryUseCases service,
        IStockOperations operations, CancellationToken ct) => service.PrepareOperationAsync(command, operations, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<(InventoryChange, StockAdjustedV1?)> Handle(ReceiveStockTransfer command, InventoryDbContext db,
        InventoryUseCases service, IStockOperations operations, CancellationToken ct) => service.ReceiveTransferAsync(command, operations, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static async Task<(InventoryChange, OutgoingMessages)> Handle(DecideStockOperation command, InventoryDbContext db,
        InventoryUseCases service, IStockOperations operations, CancellationToken ct)
    {
        var result = await service.DecideOperationAsync(command, operations, ct);
        var messages = new OutgoingMessages();
        foreach (var fact in result.Facts) messages.Add(fact);
        return (result.Result, messages);
    }
}
