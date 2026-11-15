using System.Globalization;
using Nexora.Finance.Application;
using Nexora.Finance.Domain;
using Nexora.Purchasing.Contracts;
using Nexora.Sales.Contracts;
using Wolverine;
using Wolverine.Attributes;
using Wolverine.Persistence;

namespace Nexora.Finance.Infrastructure;

public static class TradeHandler
{
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<TradeChange> Handle(ConfigureTrade command, FinanceDbContext db, TradeUseCases service, CancellationToken ct) =>
        service.ConfigureAsync(command, ct);
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<TradeChange> Handle(OpenBank command, FinanceDbContext db, TradeUseCases service, CancellationToken ct) =>
        service.OpenAsync(command, ct);
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<TradeChange> Handle(DefaultBank command, FinanceDbContext db, TradeUseCases service, CancellationToken ct) =>
        service.DefaultAsync(command, ct);
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<TradeChange> Handle(SubmitTrade command, FinanceDbContext db, TradeUseCases service, CancellationToken ct) =>
        service.SubmitAsync(command, ct);
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static async Task<(TradeChange, OutgoingMessages)> Handle(DecideTrade command, FinanceDbContext db,
        TradeUseCases service, StatementAllocation allocation, CancellationToken ct)
    {
        var result = await service.DecideAsync(command, allocation, ct);
        var messages = new OutgoingMessages();
        foreach (var plan in result.Variances)
            messages.Add(new PurchaseVarianceV1(Guid.CreateVersion7(), plan.Scope.TenantId, plan.Scope.WorkspaceId,
                plan.BillId, plan.ReceiptId, plan.On, plan.Quantity.ToString("0.######", CultureInfo.InvariantCulture),
                plan.Amount.ToString("0.######", CultureInfo.InvariantCulture), plan.Currency, plan.OccurredAtUtc,
                plan.SourceQuantity.ToString("0.######", CultureInfo.InvariantCulture), plan.AdjustmentId));
        return (result.Change, messages);
    }
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<TradeChange> Handle(ProcessAccrual command, FinanceDbContext db, TradeUseCases service, CancellationToken ct) =>
        service.ProcessAsync(command, ct);
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task Handle(InventoryCostedV1 fact, FinanceDbContext db, TradeUseCases service, CancellationToken ct) =>
        service.ReceiveFactAsync(new ReceiptFact(fact.EventId, fact.TenantId, fact.WorkspaceId, fact.WarehouseId, fact.ItemId,
            fact.OrderId, fact.LineId, fact.PermitId, fact.SupplierId, fact.Sequence, fact.On, Parse(fact.Quantity), Parse(fact.Cost),
            fact.Currency, fact.ReversesId, fact.AdjustmentForBillId), ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task Handle(SalesStockCostedV1 fact, FinanceDbContext db, TradeUseCases service, CancellationToken ct) =>
        service.ReceiveFactAsync(new ReceiptFact(fact.EventId, fact.TenantId, fact.WorkspaceId, fact.WarehouseId, fact.ItemId,
            fact.OrderId, fact.LineId, fact.PermitId, Guid.Empty, fact.Sequence, fact.On, Parse(fact.Quantity), Parse(fact.Cost),
            fact.Currency, fact.ReversesId, Sale: new(fact.CustomerId, fact.CustomerName, fact.ItemName, Parse(fact.UnitPrice))), ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task Handle(StockAdjustedV1 fact, FinanceDbContext db, TradeUseCases service, CancellationToken ct) =>
        service.ReceiveFactAsync(new ReceiptFact(fact.EventId, fact.TenantId, fact.WorkspaceId, fact.WarehouseId, fact.ItemId,
            Guid.Empty, Guid.Empty, fact.StockOperationId, Guid.Empty, fact.Sequence, fact.On, Parse(fact.Quantity), Parse(fact.Cost),
            fact.Currency, null, Stock: new(fact.StockOperationId, fact.Transfer)), ct);

    private static decimal Parse(string value) => value is { Length: >= 1 and <= 26 }
        && decimal.TryParse(value, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var amount)
        ? amount : throw new ArgumentException("A cost fact must carry decimal strings.");
}
