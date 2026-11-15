using System.Security.Claims;
using Alba;
using Alba.Security;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Nexora.Organization.Api;
using Nexora.Organization.Application;
using Nexora.Organization.Contracts;
using Nexora.Organization.Infrastructure;
using Nexora.Reporting.Infrastructure;
using Npgsql;
using Testcontainers.PostgreSql;
using Testcontainers.RabbitMq;
using Wolverine;
using OrgProgram = Nexora.Organization.Api.Program;
using ReportingProgram = Nexora.Reporting.Api.Program;

namespace Nexora.Tests;

// Test-only authentication stub isolates authorization/HTTP from OIDC. Real OIDC is checked separately through the live BFF.
public sealed partial class WorkspaceSliceTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer organization = new PostgreSqlBuilder("postgres:18.3").Build();
    private readonly PostgreSqlContainer reporting = new PostgreSqlBuilder("postgres:18.3").Build();
    // Docker can reassign random host ports on container restart. Keep test endpoints stable for recovery checks.
    private readonly RabbitMqContainer broker = new RabbitMqBuilder("rabbitmq:4.3-management")
        .WithPortBinding(FreePort(), 5672).WithPortBinding(FreePort(), 15672).Build();
    private IAlbaHost org = null!;
    private IAlbaHost reports = null!;
    private static readonly Claim Issuer = new("iss", "https://test.invalid/realms/nexora");
    private static readonly Claim Alice = new("sub", "alice-stable-subject");
    private static readonly Claim Bob = new("sub", "bob-stable-subject");

    private static int FreePort()
    {
        var listener = new System.Net.Sockets.TcpListener(System.Net.IPAddress.Loopback, 0);
        listener.Start();
        var port = ((System.Net.IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return port;
    }

    public async Task InitializeAsync()
    {
        await Task.WhenAll(organization.StartAsync(), reporting.StartAsync(), broker.StartAsync());
        var configuration = new Dictionary<string, string?>
        {
            ["ConnectionStrings:organizationdb"] = organization.GetConnectionString(),
            ["ConnectionStrings:reportingdb"] = reporting.GetConnectionString(),
            ["ConnectionStrings:rabbitmq"] = broker.GetConnectionString(),
            ["Authentication:Authority"] = "https://test.invalid/realms/nexora",
            ["Billing:DefaultPlan"] = "pro"
        };
        void Configure(IWebHostBuilder web)
        {
            web.UseEnvironment("Development").ConfigureLogging(logging => logging.SetMinimumLevel(LogLevel.Warning));
            foreach (var (key, value) in configuration) web.UseSetting(key, value);
        }
        org = await AlbaHost.For<OrgProgram>(Configure, new AuthenticationStub());
        reports = await AlbaHost.For<ReportingProgram>(Configure, new AuthenticationStub());
    }

    [Fact]
    public async Task Http_validation_authorization_idempotency_transaction_and_durable_delivery()
    {
        await org.Scenario(s =>
        {
            s.WithClaim(Issuer); s.WithClaim(Alice);
            s.Post.Json(new CreateWorkspaceRequest(Guid.Empty, "")).ToUrl("/api/workspaces");
            s.StatusCodeShouldBe(400);
        });
        var command = new CreateWorkspaceRequest(Guid.NewGuid(), "事务与投影验证");
        var result = await org.Scenario(s =>
        {
            s.WithClaim(Issuer); s.WithClaim(Alice); s.Post.Json(command).ToUrl("/api/workspaces"); s.StatusCodeShouldBe(201);
        });
        var created = result.ReadAsJson<WorkspaceView>()!;
        Assert.NotEqual(Guid.Empty, created.TenantId);
        await org.Scenario(s =>
        {
            s.WithClaim(Issuer); s.WithClaim(Alice); s.Post.Json(command).ToUrl("/api/workspaces"); s.StatusCodeShouldBe(200);
        });
        await org.Scenario(s =>
        {
            s.WithClaim(Issuer); s.WithClaim(Alice);
            s.Post.Json(command with { Name = "冲突名称" }).ToUrl("/api/workspaces"); s.StatusCodeShouldBe(409);
        });
        await org.Scenario(s => { s.WithClaim(Issuer); s.WithClaim(Bob); s.Get.Url($"/api/workspaces/{created.Id}"); s.StatusCodeShouldBe(404); });
        await Eventually(async () => await ReadProjection(created.Id) == 1);

        // Re-enter the real handler transaction with the same business fact, deliberately bypassing transport Inbox deduplication.
        await using (var duplicateScope = reports.Services.CreateAsyncScope())
        {
            await duplicateScope.ServiceProvider.GetRequiredService<IMessageBus>().InvokeAsync(new WorkspaceCreatedV1(created.Id, created.TenantId,
                created.Id, created.Name, "CN", "CNY", DateTimeOffset.UtcNow, 1));
        }
        await Eventually(async () => await ReadProjection(created.Id) == 1);

        await broker.StopAsync();
        var offline = new CreateWorkspaceRequest(Guid.NewGuid(), "消息队列离线时提交");
        var offlineResult = await org.Scenario(s =>
        {
            s.WithClaim(Issuer); s.WithClaim(Alice); s.Post.Json(offline).ToUrl("/api/workspaces"); s.StatusCodeShouldBe(201);
        });
        var offlineWorkspace = offlineResult.ReadAsJson<WorkspaceView>()!;
        Assert.True(await Count("organization_messages.wolverine_outgoing_envelopes") > 0);
        var pending = await Count("organization_messages.wolverine_outgoing_envelopes");
        var business = await Count("organization.workspaces");
        var audit = await Count("organization.workspace_audit");
        await using (var scope = org.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<OrganizationDbContext>();
            await db.Database.ExecuteSqlRawAsync("""
                CREATE FUNCTION organization.reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test injected audit failure'; END $$;
                CREATE TRIGGER reject_audit BEFORE INSERT ON organization.workspace_audit FOR EACH ROW EXECUTE FUNCTION organization.reject_audit();
                """);
        }
        await org.Scenario(s =>
        {
            s.WithClaim(Issuer); s.WithClaim(Alice);
            s.Post.Json(new CreateWorkspaceRequest(Guid.NewGuid(), "必须整体回滚")).ToUrl("/api/workspaces"); s.StatusCodeShouldBe(500);
        });
        Assert.Equal(business, await Count("organization.workspaces"));
        Assert.Equal(audit, await Count("organization.workspace_audit"));
        Assert.Equal(pending, await Count("organization_messages.wolverine_outgoing_envelopes"));
        await broker.StartAsync();
        await Eventually(async () => await ReadProjection(offlineWorkspace.Id) == 1, TimeSpan.FromSeconds(90));
    }

    private async Task<long> Count(string table)
    {
        await using var connection = new NpgsqlConnection(organization.GetConnectionString());
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand("SELECT count(*) FROM " + table, connection);
        return (long)(await command.ExecuteScalarAsync())!;
    }
    private async Task<int> ReadProjection(Guid id)
    {
        await using var scope = reports.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<ReportingDbContext>().Workspaces.CountAsync(x => x.WorkspaceId == id);
    }
    private static async Task Eventually(Func<Task<bool>> predicate, TimeSpan? timeout = null)
    {
        var until = DateTimeOffset.UtcNow + (timeout ?? TimeSpan.FromSeconds(30));
        while (DateTimeOffset.UtcNow < until) { if (await predicate()) return; await Task.Delay(200); }
        Assert.Fail("Expected durable projection did not arrive within the bounded deadline.");
    }
    public async Task DisposeAsync()
    {
        if (reports is not null) await reports.DisposeAsync();
        if (org is not null) await org.DisposeAsync();
        await broker.DisposeAsync(); await reporting.DisposeAsync(); await organization.DisposeAsync();
    }
}
