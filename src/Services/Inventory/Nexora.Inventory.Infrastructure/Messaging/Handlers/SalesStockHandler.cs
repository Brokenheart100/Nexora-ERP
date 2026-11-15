using Nexora.Inventory.Application;
using Nexora.Sales.Contracts;
using Wolverine;
using Wolverine.Attributes;
using Wolverine.Persistence;

namespace Nexora.Inventory.Infrastructure;

public static class SalesStockHandler
{
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static async Task<OutgoingMessages> Handle(FulfillmentGrantedV1 command, InventoryDbContext db, InventoryUseCases service,
        ISalesStock sales, CancellationToken ct)
    {
        var (progress, expiries) = await service.ReserveAsync(command.Tickets, sales, ct);
        var messages = new OutgoingMessages();
        foreach (var acknowledgement in progress) messages.Add(acknowledgement);
        foreach (var expiry in expiries) messages.Schedule(expiry, command.Tickets[0].ExpiresAtUtc);
        return messages;
    }

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<FulfillmentProgressV1> Handle(FulfillmentFenceV1 command, InventoryDbContext db, InventoryUseCases service,
        ISalesStock sales, CancellationToken ct) => service.FenceAsync(command.Ticket, sales, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<FulfillmentProgressV1?> Handle(ExpireSalesReservation command, InventoryDbContext db, InventoryUseCases service,
        ISalesStock sales, CancellationToken ct) => service.ExpireAsync(command, sales, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<(InventoryChange, FulfillmentProgressV1?, SalesStockCostedV1?)> Handle(ShipStock command, InventoryDbContext db,
        InventoryUseCases service, ISalesStock sales, CancellationToken ct) => service.ShipAsync(command, sales, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<InventoryChange> Handle(AuthorizeSalesReturn command, InventoryDbContext db, InventoryUseCases service,
        ISalesStock sales, CancellationToken ct) => service.AuthorizeSalesReturnAsync(command, sales, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<(InventoryChange, SalesStockCostedV1?)> Handle(DecideSalesReturn command, InventoryDbContext db, InventoryUseCases service,
        ISalesStock sales, CancellationToken ct) => service.DecideSalesReturnAsync(command, sales, ct);
}
