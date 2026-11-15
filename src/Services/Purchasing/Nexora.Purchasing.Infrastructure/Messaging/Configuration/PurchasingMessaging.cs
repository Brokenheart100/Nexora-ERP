using Microsoft.Extensions.Hosting;
using System.Reflection;
using Nexora.Purchasing.Contracts;
using Wolverine;
using Wolverine.EntityFrameworkCore;
using Wolverine.Postgresql;
using Wolverine.RabbitMQ;

namespace Nexora.Purchasing.Infrastructure;

public static class PurchasingMessaging
{
    public static void AddPurchasingMessaging(this IHostApplicationBuilder builder, Assembly applicationAssembly, string connection, string broker)
    {
        builder.UseWolverine(options =>
        {
            options.ApplicationAssembly = applicationAssembly;
            options.Discovery.IncludeAssembly(typeof(PurchaseOrderHandler).Assembly);
            options.PersistMessagesWithPostgresql(connection, "purchasing_messages");
            options.UseEntityFrameworkCoreTransactions();
            options.UseRuntimeCompilation();
            options.UseRabbitMq(new Uri(broker)).AutoProvision().DisableSystemRequestReplyQueueDeclaration()
                .DisableDeadLetterQueueing();
            options.ListenToRabbitQueue(ReceiptRoutes.PurchasingQueue).UseDurableInbox();
            options.PublishMessage<ReceiptGrantedV1>().ToRabbitExchange(ReceiptRoutes.InventoryExchange);
            options.PublishMessage<ReceiptFenceV1>().ToRabbitExchange(ReceiptRoutes.InventoryExchange);
            options.Policies.UseDurableOutboxOnAllSendingEndpoints();
        });
    }
}
