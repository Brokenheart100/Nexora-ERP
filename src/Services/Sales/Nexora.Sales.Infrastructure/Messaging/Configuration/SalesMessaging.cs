using Microsoft.Extensions.Hosting;
using System.Reflection;
using Nexora.Sales.Contracts;
using Wolverine;
using Wolverine.EntityFrameworkCore;
using Wolverine.Postgresql;
using Wolverine.RabbitMQ;

namespace Nexora.Sales.Infrastructure;

public static class SalesMessaging
{
    public static void AddSalesMessaging(this IHostApplicationBuilder builder, Assembly applicationAssembly, string connection, string broker)
    {
        builder.UseWolverine(options =>
        {
            options.ApplicationAssembly = applicationAssembly;
            options.Discovery.IncludeAssembly(typeof(SalesOrderHandler).Assembly);
            options.PersistMessagesWithPostgresql(connection, "sales_messages");
            options.UseEntityFrameworkCoreTransactions();
            options.UseRuntimeCompilation();
            options.UseRabbitMq(new Uri(broker)).AutoProvision().DisableSystemRequestReplyQueueDeclaration()
                .DisableDeadLetterQueueing();
            options.ListenToRabbitQueue(FulfillmentRoutes.SalesQueue).UseDurableInbox();
            options.PublishMessage<FulfillmentGrantedV1>().ToRabbitExchange(FulfillmentRoutes.InventoryExchange);
            options.PublishMessage<FulfillmentFenceV1>().ToRabbitExchange(FulfillmentRoutes.InventoryExchange);
            options.Policies.UseDurableOutboxOnAllSendingEndpoints();
        });
    }
}
