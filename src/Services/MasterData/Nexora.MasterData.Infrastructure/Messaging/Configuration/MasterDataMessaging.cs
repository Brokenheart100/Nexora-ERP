using Microsoft.Extensions.Hosting;
using System.Reflection;
using Nexora.MasterData.Contracts;
using Wolverine;
using Wolverine.EntityFrameworkCore;
using Wolverine.Postgresql;
using Wolverine.RabbitMQ;

namespace Nexora.MasterData.Infrastructure;

public static class MasterDataMessaging
{
    public static void AddMasterDataMessaging(this IHostApplicationBuilder builder, Assembly applicationAssembly, string connection, string broker)
    {
        builder.UseWolverine(options =>
        {
            options.ApplicationAssembly = applicationAssembly;
            options.Discovery.IncludeAssembly(typeof(CatalogHandler).Assembly);
            options.PersistMessagesWithPostgresql(connection, "masterdata_messages");
            options.UseEntityFrameworkCoreTransactions();
            options.UseRuntimeCompilation();
            options.UseRabbitMq(new Uri(broker)).AutoProvision().DisableSystemRequestReplyQueueDeclaration()
                .CustomizeDeadLetterQueueing(new DeadLetterQueue("nexora.masterdata.deadletters"));
            options.PublishMessage<MasterDataChangedV1>().ToRabbitExchange("nexora.masterdata.events");
            options.Policies.UseDurableOutboxOnAllSendingEndpoints();
        });
    }
}
