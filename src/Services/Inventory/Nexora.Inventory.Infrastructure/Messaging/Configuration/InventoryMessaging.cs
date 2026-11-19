using Microsoft.Extensions.Hosting;
using System.Reflection;
using Nexora.Finance.Contracts.Opening;
using Nexora.Inventory.Application;
using Nexora.Purchasing.Contracts;
using Nexora.Sales.Contracts;
using Wolverine;
using Wolverine.EntityFrameworkCore;
using Wolverine.Postgresql;
using Wolverine.RabbitMQ;

namespace Nexora.Inventory.Infrastructure;

public static class InventoryMessaging
{
    public static void AddInventoryMessaging(this IHostApplicationBuilder builder, Assembly applicationAssembly, string connection, string broker)
    {
        builder.UseWolverine(options =>
        {
            options.ApplicationAssembly = applicationAssembly;
            options.Discovery.IncludeAssembly(typeof(InventoryHandler).Assembly);
            options.PersistMessagesWithPostgresql(connection, "inventory_messages");
            options.UseEntityFrameworkCoreTransactions();
            options.UseRuntimeCompilation();
            options.UseRabbitMq(new Uri(broker)).AutoProvision().DisableSystemRequestReplyQueueDeclaration()
                .DisableDeadLetterQueueing();
            options.ListenToRabbitQueue(FulfillmentRoutes.InventoryQueue).UseDurableInbox();
            options.PublishMessage<FulfillmentProgressV1>().ToRabbitExchange(FulfillmentRoutes.SalesExchange);
            options.PublishMessage<SalesStockCostedV1>().ToRabbitExchange(FulfillmentRoutes.CostExchange);
            options.PublishMessage<ExpireSalesReservation>().ToLocalQueue("reservation-expiry");
            options.LocalQueue("reservation-expiry").UseDurableInbox();
            options.ListenToRabbitQueue(ReceiptRoutes.InventoryQueue).UseDurableInbox();
            options.ListenToRabbitQueue(StockOpeningRoutes.Queue).UseDurableInbox();
            options.PublishMessage<ReceiptProgressV1>().ToRabbitExchange(ReceiptRoutes.PurchasingExchange);
            options.PublishMessage<InventoryCostedV1>().ToRabbitExchange(ReceiptRoutes.CostExchange);
            options.PublishMessage<StockAdjustedV1>().ToRabbitExchange(ReceiptRoutes.CostExchange);
            options.PublishMessage<OpeningStockAcknowledgedV1>().ToRabbitExchange(ReceiptRoutes.CostExchange);
            options.Policies.UseDurableOutboxOnAllSendingEndpoints();
        });
    }
}
