using System.Reflection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Wolverine;
using Wolverine.EntityFrameworkCore;
using Wolverine.Postgresql;
using Wolverine.RabbitMQ;
using Npgsql;
using Wolverine.ErrorHandling;

namespace Nexora.Reporting.Infrastructure;

internal static class ReportingMessaging
{
    public static void AddReportingMessaging(this IHostApplicationBuilder builder, Assembly applicationAssembly, string database, string broker)
    {
        builder.UseWolverine(options =>
        {
            options.ApplicationAssembly = applicationAssembly;
            options.Discovery.IncludeAssembly(typeof(WorkspaceCreatedHandler).Assembly);
            options.PersistMessagesWithPostgresql(database, "reporting_messages");
            options.UseEntityFrameworkCoreTransactions();
            // Read-model races are safe to retry: each handler re-checks the business key / monotonically increasing version.
            options.OnException<DbUpdateConcurrencyException>().RetryTimes(3);
            options.OnException<DbUpdateException>(error => error.InnerException is PostgresException { SqlState: "23505" }).RetryTimes(3);
            options.UseRuntimeCompilation();
            options.UseRabbitMq(new Uri(broker)).AutoProvision().DisableSystemRequestReplyQueueDeclaration()
                .BindExchange("nexora.organization.events").ToQueue("nexora.reporting.workspaces.v1");
            options.ListenToRabbitQueue("nexora.reporting.workspaces.v1").UseDurableInbox();
        });
    }
}
