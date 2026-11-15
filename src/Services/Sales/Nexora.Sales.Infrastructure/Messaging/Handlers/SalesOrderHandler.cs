using Nexora.Sales.Application;
using Wolverine.Attributes;
using Wolverine.Persistence;

namespace Nexora.Sales.Infrastructure;

public static class SalesOrderHandler
{
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<SalesChange> Handle(ConvertQuote command, SalesDbContext db, SalesCommands commands, CancellationToken ct) =>
        commands.ConvertAsync(command, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<SalesChange> Handle(CreateSales command, SalesDbContext db, SalesCommands commands, CancellationToken ct) =>
        commands.CreateAsync(command, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<SalesChange> Handle(EditSales command, SalesDbContext db, SalesCommands commands, CancellationToken ct) =>
        commands.EditAsync(command, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<SalesChange> Handle(DecideSales command, SalesDbContext db, SalesCommands commands, CancellationToken ct) =>
        commands.DecideAsync(command, ct);
}
