#!/usr/bin/env dotnet
#:property ManagePackageVersionsCentrally=false
#:property PublishAot=false
#:property RestoreLockedMode=true
#:package RabbitMQ.Client@7.2.2
using System.Text.Json;
using RabbitMQ.Client;
using RabbitMQ.Client.Exceptions;

// Local-only acceptance probe. Secrets stay inside this process, never in command arguments or its report.
if (args.Length != 2) throw new ArgumentException("Broker endpoint and report path required.");
var root = OperatingSystem.IsWindows() ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Microsoft", "UserSecrets")
    : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".microsoft", "usersecrets");
using var secrets = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "2bf3a2f7-399e-4dda-89e4-926d2b0acc86", "secrets.json")));
var endpoint = new Uri(args[0]);
var checks = new List<object>();
foreach (var service in new[] { "organization", "reporting" })
{
    var factory = new ConnectionFactory
    {
        HostName = endpoint.Host, Port = endpoint.Port, UserName = "nexora-" + service, VirtualHost = "/",
        Password = secrets.RootElement.GetProperty("Parameters:" + service + "-rabbit-password").GetString()!,
        RequestedConnectionTimeout = TimeSpan.FromSeconds(3), AutomaticRecoveryEnabled = false
    };
    await using var connection = await factory.CreateConnectionAsync();
    foreach (var operation in new[] { "consume-other-service", "declare-unrelated-queue" })
    {
        await using var channel = await connection.CreateChannelAsync();
        var denied = false;
        try
        {
            if (operation == "consume-other-service")
                await channel.BasicGetAsync(service == "organization" ? "nexora.reporting.workspaces.v1" : "nexora.organization.deadletters", autoAck: false);
            else
                await channel.QueueDeclareAsync("nexora.security-probe." + Guid.NewGuid().ToString("N"), durable: false, exclusive: true, autoDelete: true);
        }
        catch (OperationInterruptedException error) when (error.ShutdownReason?.ReplyCode == 403) { denied = true; }
        checks.Add(new { service, operation, denied });
        if (!denied) throw new InvalidOperationException("Broker permission boundary failed: " + service + "/" + operation);
    }
}
await File.WriteAllTextAsync(args[1], JsonSerializer.Serialize(new { checks, passed = 4 }, new JsonSerializerOptions { WriteIndented = true }));
Console.WriteLine("Broker permission probes: 4 passed.");
