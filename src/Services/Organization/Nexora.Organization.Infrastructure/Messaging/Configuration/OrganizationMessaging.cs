using System.Reflection;
using Microsoft.Extensions.Hosting;
using Nexora.Organization.Application;
using Nexora.Organization.Contracts;
using Nexora.Organization.Infrastructure.Messaging;
using Wolverine;
using Wolverine.EntityFrameworkCore;
using Wolverine.FluentValidation;
using Wolverine.Postgresql;
using Wolverine.RabbitMQ;

namespace Nexora.Organization.Infrastructure;

internal static class OrganizationMessaging
{
    public static void AddOrganizationMessaging(this IHostApplicationBuilder builder, Assembly applicationAssembly, string database, string broker)
    {
        builder.UseWolverine(options =>
        {
            options.ApplicationAssembly = applicationAssembly;
            options.Discovery.IncludeAssembly(typeof(OpenWorkspaceHandler).Assembly);
            options.Policies.AddMiddleware(typeof(LocalUserCommandGuard), chain => typeof(IUserGovernanceCommand).IsAssignableFrom(chain.MessageType));
            options.PersistMessagesWithPostgresql(database, "organization_messages");
            options.UseEntityFrameworkCoreTransactions();
            options.UseRuntimeCompilation();
            options.UseFluentValidation();
            options.UseRabbitMq(new Uri(broker)).AutoProvision()
                .DisableSystemRequestReplyQueueDeclaration()
                .CustomizeDeadLetterQueueing(new DeadLetterQueue("nexora.organization.deadletters"));
            options.PublishMessage<WorkspaceCreatedV1>().ToRabbitExchange("nexora.organization.events");
            options.PublishMessage<WorkspaceAuthorizationChangedV1>().ToRabbitExchange("nexora.organization.events");
            options.Policies.UseDurableOutboxOnAllSendingEndpoints();
        });
    }
}
