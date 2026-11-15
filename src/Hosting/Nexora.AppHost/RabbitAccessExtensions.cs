using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Nexora.AppHost;

internal static class RabbitAccessExtensions
{
    public static async Task<RabbitAccess> ConfigureRabbitAccessAsync(this IDistributedApplicationBuilder builder,
        IResourceBuilder<RabbitMQServerResource> broker)
    {
        var secret = new GenerateParameterDefault { MinLength = 32, Special = false };
        string[] services = ["organization", "reporting", "masterdata", "purchasing", "sales", "inventory", "finance"];
        var passwords = services.ToDictionary(service => service,
            service => builder.AddParameter($"{service}-rabbit-password", secret, secret: true, persist: true));
        var admin = await broker.Resource.UserNameReference.GetValueAsync(default)
            ?? throw new InvalidOperationException("RabbitMQ administrator required.");
        object User(string name, string password, params string[] tags)
        {
            // RabbitMQ's documented SHA-256 definition-file format: salt || SHA256(salt || UTF8(password)).
            var salt = RandomNumberGenerator.GetBytes(4);
            var hash = SHA256.HashData([.. salt, .. Encoding.UTF8.GetBytes(password)]);
            return new
            {
                name,
                password_hash = Convert.ToBase64String([.. salt, .. hash]),
                hashing_algorithm = "rabbit_password_hashing_sha256",
                tags
            };
        }
        var routes = new[]
        {
            (Exchange: "nexora.organization.events", Queue: "nexora.reporting.workspaces.v1", DeadLetter: true),
            (Exchange: "nexora.inventory.receipt.commands", Queue: "nexora.inventory.receipts.v1", DeadLetter: false),
            (Exchange: "nexora.purchasing.receipt.events", Queue: "nexora.purchasing.receipts.v1", DeadLetter: false),
            (Exchange: "nexora.inventory.fulfillment.commands", Queue: "nexora.inventory.fulfillments.v1", DeadLetter: false),
            (Exchange: "nexora.sales.fulfillment.events", Queue: "nexora.sales.fulfillments.v1", DeadLetter: false),
            (Exchange: "nexora.inventory.cost.events", Queue: "nexora.finance.inventory-cost.v1", DeadLetter: false)
        };
        var users = new List<object> { User(admin, (await broker.Resource.PasswordParameter.GetValueAsync(default))!, "administrator") };
        foreach (var (service, password) in passwords)
            users.Add(User($"nexora-{service}", (await password.Resource.GetValueAsync(default))!));

        var definitions = new
        {
            users,
            vhosts = new[] { new { name = "/" } },
            // Provision the binding before publishers start, including a fresh broker recovering a database Outbox.
            // Queue arguments match the existing durable P1 queue; importing definitions never purges messages.
            exchanges = routes.Select(x => x.Exchange).Append("nexora.masterdata.events").Select(name =>
                new
                {
                    name,
                    vhost = "/",
                    type = "fanout",
                    durable = true,
                    auto_delete = false,
                    @internal = false,
                    arguments = new Dictionary<string, object>()
                }).ToArray(),
            queues = routes.Select(x => new
            {
                name = x.Queue,
                vhost = "/",
                durable = true,
                auto_delete = false,
                arguments = x.DeadLetter
                    ? new Dictionary<string, object> { ["x-queue-type"] = "classic", ["x-dead-letter-exchange"] = "wolverine-dead-letter-queue" }
                    : new Dictionary<string, object> { ["x-queue-type"] = "classic" }
            }).ToArray(),
            bindings = routes.Select(x => new
            {
                source = x.Exchange,
                vhost = "/",
                destination = x.Queue,
                destination_type = "queue",
                routing_key = "",
                arguments = new Dictionary<string, object>()
            }).ToArray(),
            permissions = new[]
            {
                new { user = admin, vhost = "/", configure = ".*", write = ".*", read = ".*" },
                new { user = "nexora-organization", vhost = "/", configure = @"^nexora\.organization\.(events|deadletters)$",
                    write = @"^nexora\.organization\.(events|deadletters)$", read = @"^nexora\.organization\.deadletters$" },
                new { user = "nexora-reporting", vhost = "/",
                    configure = @"^(nexora\.organization\.events|nexora\.reporting\.workspaces\.v1|wolverine-dead-letter-queue)$",
                    write = @"^(nexora\.reporting\.workspaces\.v1|wolverine-dead-letter-queue)$",
                    read = @"^(nexora\.organization\.events|nexora\.reporting\.workspaces\.v1|wolverine-dead-letter-queue)$" },
                new { user = "nexora-masterdata", vhost = "/", configure = @"^nexora\.masterdata\.(events|deadletters)$",
                    write = @"^nexora\.masterdata\.(events|deadletters)$", read = @"^nexora\.masterdata\.deadletters$" },
                new { user = "nexora-purchasing", vhost = "/",
                    configure = @"^(nexora\.inventory\.receipt\.commands|nexora\.purchasing\.receipts\.v1)$",
                    write = @"^nexora\.inventory\.receipt\.commands$", read = @"^nexora\.purchasing\.receipts\.v1$" },
                new { user = "nexora-sales", vhost = "/",
                    configure = @"^(nexora\.inventory\.fulfillment\.commands|nexora\.sales\.fulfillments\.v1)$",
                    write = @"^nexora\.inventory\.fulfillment\.commands$", read = @"^nexora\.sales\.fulfillments\.v1$" },
                new { user = "nexora-inventory", vhost = "/",
                    configure = @"^(nexora\.purchasing\.receipt\.events|nexora\.sales\.fulfillment\.events|nexora\.inventory\.(receipts\.v1|fulfillments\.v1|cost\.events))$",
                    write = @"^(nexora\.purchasing\.receipt\.events|nexora\.sales\.fulfillment\.events|nexora\.inventory\.cost\.events)$",
                    read = @"^nexora\.inventory\.(receipts|fulfillments)\.v1$" },
                new { user = "nexora-finance", vhost = "/", configure = @"^(nexora\.finance\.inventory-cost\.v1|nexora\.inventory\.receipt\.commands)$",
                    write = @"^nexora\.inventory\.receipt\.commands$", read = @"^nexora\.finance\.inventory-cost\.v1$" }
            }
        };
        broker.WithContainerFiles("/etc/nexora", [new ContainerFile { Name = "definitions.json", Contents = JsonSerializer.Serialize(definitions) }])
            .WithContainerFiles("/etc/rabbitmq/conf.d", [new ContainerFile
            {
                Name = "90-nexora.conf",
                Contents = "definitions.import_backend = local_filesystem\ndefinitions.local.path = /etc/nexora/definitions.json\n"
            }]);
        return new RabbitAccess(builder, broker, passwords);
    }
}

internal sealed class RabbitAccess(IDistributedApplicationBuilder builder, IResourceBuilder<RabbitMQServerResource> broker,
    IReadOnlyDictionary<string, IResourceBuilder<ParameterResource>> passwords)
{
    public IResourceBuilder<ConnectionStringResource> AddConnection(string service)
    {
        var password = passwords[service];
        var connection = ReferenceExpression.Create($"amqp://nexora-{service}:{password:uri}@{broker.Resource.Host}:{broker.Resource.Port}/%2F");
        return builder.AddConnectionString($"{service}-amqp", connection);
    }
}
