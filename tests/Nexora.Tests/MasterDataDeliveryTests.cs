using System.Security.Claims;
using System.Text.Json;
using Alba;
using Alba.Security;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Nexora.BuildingBlocks.Application;
using Nexora.MasterData.Api;
using Nexora.MasterData.Application;
using Nexora.MasterData.Contracts;
using Npgsql;
using RabbitMQ.Client;
using Testcontainers.PostgreSql;
using Testcontainers.RabbitMq;
using MasterDataProgram = Nexora.MasterData.Api.Program;

namespace Nexora.Tests;

public sealed class MasterDataDeliveryTests
{
    [Fact]
    public async Task A_committed_change_survives_broker_outage_and_request_replay()
    {
        await using var database = new PostgreSqlBuilder("postgres:18.3").Build();
        await using var broker = new RabbitMqBuilder("rabbitmq:4.3-management")
            .WithPortBinding(FreePort(), 5672).WithPortBinding(FreePort(), 15672).Build();
        await Task.WhenAll(database.StartAsync(), broker.StartAsync());
        var factory = new ConnectionFactory { Uri = new Uri(broker.GetConnectionString()), AutomaticRecoveryEnabled = false };
        const string exchange = "nexora.masterdata.events";
        const string queue = "test.masterdata.changes";
        await using (var connection = await factory.CreateConnectionAsync())
        await using (var channel = await connection.CreateChannelAsync())
        {
            await channel.ExchangeDeclareAsync(exchange, ExchangeType.Fanout, durable: true);
            await channel.QueueDeclareAsync(queue, durable: true, exclusive: false, autoDelete: false);
            await channel.QueueBindAsync(queue, exchange, string.Empty);
        }
        var workspaceId = Guid.CreateVersion7();
        var access = new CatalogAccess(new(Guid.CreateVersion7(), workspaceId),
            new("https://test.invalid", "masterdata-delivery"), [CatalogPermissions.Read, CatalogPermissions.Manage]);
        await using var host = await AlbaHost.For<MasterDataProgram>(web =>
        {
            web.UseEnvironment("Development");
            web.UseSetting("ConnectionStrings:masterdatadb", database.GetConnectionString());
            web.UseSetting("ConnectionStrings:rabbitmq", broker.GetConnectionString());
            web.UseSetting("Authentication:Authority", "https://test.invalid");
            web.ConfigureTestServices(services =>
            {
                services.AddSingleton(access);
                services.AddScoped<ICatalogAccess, TestAccess>();
            });
        }, new AuthenticationStub());

        var input = new AddDefinitionRequest(Guid.CreateVersion7(), "unit", "ea", "件");
        async Task<CatalogMutation> Submit()
        {
            var result = await host.Scenario(scenario =>
            {
                scenario.WithClaim(new Claim("sub", "masterdata-delivery"));
                scenario.Post.Json(input).ToUrl($"/api/masterdata/workspaces/{workspaceId}/definitions");
                scenario.StatusCodeShouldBe(200);
            });
            return result.ReadAsJson<CatalogMutation>()!;
        }

        await broker.StopAsync();
        var created = await Submit();
        Assert.Equal(created, await Submit());
        await using var postgres = new NpgsqlConnection(database.GetConnectionString());
        await postgres.OpenAsync();
        await using (var command = new NpgsqlCommand("""
            SELECT (SELECT count(*) FROM masterdata.mutation_audit),
                   (SELECT count(*) FROM masterdata_messages.wolverine_outgoing_envelopes)
            """, postgres))
        await using (var rows = await command.ExecuteReaderAsync())
        {
            Assert.True(await rows.ReadAsync());
            Assert.Equal(1L, rows.GetInt64(0));
            Assert.Equal(1L, rows.GetInt64(1));
        }

        await broker.StartAsync();
        await using var consumer = await factory.CreateConnectionAsync();
        await using var delivery = await consumer.CreateChannelAsync();
        BasicGetResult? message = null;
        var deadline = DateTimeOffset.UtcNow.AddSeconds(60);
        while (message is null && DateTimeOffset.UtcNow < deadline)
        {
            message = await delivery.BasicGetAsync(queue, autoAck: true);
            if (message is null) await Task.Delay(250);
        }
        Assert.NotNull(message);
        var fact = JsonSerializer.Deserialize<MasterDataChangedV1>(message.Body.Span, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.NotNull(fact);
        Assert.Equal(workspaceId, fact.WorkspaceId);
        Assert.Equal(access.Scope.TenantId, fact.TenantId);
        Assert.Equal(created.Id, fact.ResourceId);
        Assert.Equal(1, fact.Version);
        Assert.Equal("unit", fact.ResourceKind);
        Assert.Equal("EA", fact.Code);
        Assert.Equal(created, await Submit());
        Assert.Null(await delivery.BasicGetAsync(queue, autoAck: true));
    }

    private static int FreePort()
    {
        using var listener = new System.Net.Sockets.TcpListener(System.Net.IPAddress.Loopback, 0);
        listener.Start();
        return ((System.Net.IPEndPoint)listener.LocalEndpoint).Port;
    }

    public sealed class TestAccess(CatalogAccess access) : ICatalogAccess
    {
        public Task<CatalogAccess> DemandAsync(Guid workspaceId, string permission, CancellationToken cancellationToken)
        {
            Assert.Equal(access.Scope.WorkspaceId, workspaceId);
            Assert.True(access.Allows(permission));
            return Task.FromResult(access);
        }
    }
}
