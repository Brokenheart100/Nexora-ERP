namespace Nexora.Sales.Contracts;

public static class FulfillmentRoutes
{
    public const string InventoryExchange = "nexora.inventory.fulfillment.commands";
    public const string InventoryQueue = "nexora.inventory.fulfillments.v1";
    public const string SalesExchange = "nexora.sales.fulfillment.events";
    public const string SalesQueue = "nexora.sales.fulfillments.v1";
    public const string CostExchange = "nexora.inventory.cost.events";
    public const string FinanceQueue = "nexora.finance.inventory-cost.v1";
}

public sealed record FulfillmentTicketV1(Guid TenantId, Guid WorkspaceId, Guid PermitId, Guid OrderId, Guid LineId,
    long ApprovedVersion, Guid WarehouseId, Guid ItemId, Guid UnitId, Guid CustomerId, DateOnly OrderDate,
    string Quantity, string UnitPrice, string Currency, int MinorUnits, DateTimeOffset ExpiresAtUtc, string ItemName, string CustomerName);
public sealed record FulfillmentGrantedV1(Guid EventId, FulfillmentTicketV1[] Tickets, DateTimeOffset OccurredAtUtc);
public sealed record FulfillmentFenceV1(Guid EventId, FulfillmentTicketV1 Ticket, DateTimeOffset OccurredAtUtc);
public sealed record FulfillmentProgressV1(Guid EventId, Guid Id, Guid TenantId, Guid WorkspaceId, Guid OrderId,
    long Revision, string Executed, bool Fenced, DateTimeOffset OccurredAtUtc);
public sealed record SalesStockCostedV1(Guid EventId, Guid TenantId, Guid WorkspaceId, Guid WarehouseId, Guid ItemId,
    Guid OrderId, Guid LineId, Guid PermitId, Guid CustomerId, long Sequence, DateOnly On, string Quantity,
    string Cost, string Currency, DateTimeOffset OccurredAtUtc, string UnitPrice, string ItemName, string CustomerName,
    Guid? ReversesId = null);
