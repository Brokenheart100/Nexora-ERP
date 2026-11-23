using System.Security.Claims;
using Alba;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using Nexora.BuildingBlocks.Application;
using Nexora.BuildingBlocks.Infrastructure;
using Nexora.Organization.Api;
using Nexora.Organization.Application;
using Nexora.Organization.Domain;
using Nexora.Organization.Infrastructure;
using Nexora.Organization.Infrastructure.Messaging;
using Npgsql;
using Wolverine;
using Wolverine.Runtime;
using Wolverine.Configuration;
using RabbitMQ.Client;
using System.Text;

namespace Nexora.Tests;

public sealed partial class WorkspaceSliceTests
{
    private async Task<T> Api<T>(Claim subject, string url, object? body = null, int status = 200,
        string? email = null, bool verified = true, string? issuer = null)
    {
        var response = await org.Scenario(s =>
        {
            s.WithClaim(new("iss", issuer ?? Issuer.Value)); s.WithClaim(subject);
            s.WithClaim(new("email", email ?? (subject.Value.StartsWith("alice", StringComparison.Ordinal) ? "alice@example.com" : "bob@example.com")));
            s.WithClaim(new("email_verified", verified ? "true" : "false"));
            if (body is null) s.Get.Url(url); else s.Post.Json(body).ToUrl(url);
            s.StatusCodeShouldBe(status);
        });
        return status >= 400 ? default! : response.ReadAsJson<T>()!;
    }
    private Task<WorkspaceView> Create(Claim subject) => Api<WorkspaceView>(subject, "/api/workspaces", new CreateWorkspaceRequest(Guid.NewGuid(), "成员验证商贸"), 201);
    private Task<AccessView> Access(Guid workspaceId, Claim subject) => Api<AccessView>(subject, $"/api/workspaces/{workspaceId}/access");

    [Fact]
    public async Task Invitation_email_uses_the_configured_dashboard_origin()
    {
        var listener = new System.Net.Sockets.TcpListener(System.Net.IPAddress.Loopback, 0);
        listener.Start();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        try
        {
            var configuration = org.Services.GetRequiredService<IConfiguration>();
            configuration["OnboardingMail:Host"] = "127.0.0.1";
            configuration["OnboardingMail:Port"] = ((System.Net.IPEndPoint)listener.LocalEndpoint).Port.ToString();
            configuration["OnboardingMail:From"] = "noreply@example.invalid";
            configuration["OnboardingMail:StartTls"] = "false";
            configuration["OnboardingMail:PublicOrigin"] = "https://localhost:7444";
            var message = CaptureInvitationMail(listener, timeout.Token);
            var workspace = await Create(Alice);
            var receipt = await Api<InvitationCreatedResult>(Alice, $"/api/workspaces/{workspace.Id}/invitations",
                new InviteMemberRequest(Guid.NewGuid(), 1, "invite-from-test@example.invalid", GovernanceRoles.Reader), 201);
            Assert.Equal("Sent", receipt.MailStatus);
            Assert.True((await message).Contains($"https://localhost:7444/join#{receipt.Invitation.Id}.", StringComparison.Ordinal));
        }
        finally { listener.Stop(); }
    }

    private static async Task<string> CaptureInvitationMail(System.Net.Sockets.TcpListener listener, CancellationToken ct)
    {
        using var client = await listener.AcceptTcpClientAsync(ct);
        await using var stream = client.GetStream();
        using var reader = new StreamReader(stream, leaveOpen: true);
        await using var writer = new StreamWriter(stream, leaveOpen: true) { AutoFlush = true, NewLine = "\r\n" };
        await writer.WriteLineAsync("220 localhost");
        while (await reader.ReadLineAsync(ct) is { } command)
        {
            if (!command.Equals("DATA", StringComparison.OrdinalIgnoreCase))
            {
                await writer.WriteLineAsync("250 OK");
                continue;
            }
            await writer.WriteLineAsync("354 Enter message");
            var message = new StringBuilder();
            while (await reader.ReadLineAsync(ct) is { } line && line != ".") message.AppendLine(line);
            await writer.WriteLineAsync("250 Accepted");
            var parts = message.ToString().Split(Environment.NewLine + Environment.NewLine, 2, StringSplitOptions.None);
            if (parts.Length != 2) throw new InvalidOperationException("SMTP message has no body.");
            return parts[0].Contains("Content-Transfer-Encoding: base64", StringComparison.OrdinalIgnoreCase)
                ? Encoding.UTF8.GetString(Convert.FromBase64String(parts[1]))
                : parts[1].Replace("=" + Environment.NewLine, "", StringComparison.Ordinal);
        }
        throw new InvalidOperationException("SMTP message was not received.");
    }

    [Fact]
    public async Task Record_changes_redact_historical_snapshots_for_queries_and_csv()
    {
        var workspace = await Create(Alice);
        var root = $"/api/workspaces/{workspace.Id}";
        var invitation = await Api<InvitationCreatedResult>(Alice, root + "/invitations",
            new InviteMemberRequest(Guid.NewGuid(), 1, "records@example.invalid", GovernanceRoles.Reader), 201);

        await using (var scope = org.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<OrganizationDbContext>();
            var changes = db.Set<RecordChange>();
            changes.Add(new RecordChange
            {
                Id = Guid.NewGuid(), WorkspaceId = workspace.Id, TenantId = workspace.TenantId,
                Service = "organization", EntityName = "WorkspaceInvitation", EntityId = invitation.Invitation.Id.ToString(),
                Operation = "updated", ActorIssuer = Issuer.Value, ActorSubject = Alice.Value, OccurredAtUtc = DateTimeOffset.UtcNow,
                ChangedProperties = "State,TokenHash", BeforeJson = "{\"State\":\"Pending\",\"TokenHash\":\"synthetic-historical-value\"}",
                AfterJson = "{\"TokenHash\":\"synthetic-truncated-value"
            });
            changes.Add(new RecordChange
            {
                Id = Guid.NewGuid(), WorkspaceId = workspace.Id, TenantId = workspace.TenantId,
                Service = "organization", EntityName = "WorkspaceInvitation", EntityId = invitation.Invitation.Id.ToString(),
                Operation = "created", ActorIssuer = Issuer.Value, ActorSubject = Alice.Value, OccurredAtUtc = DateTimeOffset.UtcNow,
                AfterJson = "{\"State\":\"Pending\"}"
            });
            await db.SaveChangesAsync();
        }

        var filter = $"?entityName=WorkspaceInvitation&entityId={invitation.Invitation.Id}&operation=updated";
        var result = await Api<RecordChangePage>(Alice, root + "/record-changes" + filter);
        var row = Assert.Single(result.Changes);
        Assert.Equal("State", row.ChangedProperties);
        Assert.Equal("{\"State\":\"Pending\"}", row.BeforeJson);
        Assert.Equal("[snapshot unavailable]", row.AfterJson);

        var csv = await org.Scenario(s =>
        {
            s.WithClaim(Issuer); s.WithClaim(Alice);
            s.Get.Url(root + "/record-changes.csv" + filter);
            s.StatusCodeShouldBeOk();
        });
        var text = csv.ReadAsText();
        Assert.Contains("WorkspaceInvitation", text);
        Assert.DoesNotContain("synthetic-", text);
        Assert.DoesNotContain("TokenHash", text);
        Assert.DoesNotContain(",created,", text);
    }

    [Fact]
    public async Task Membership_invitation_and_application_authorization_lifecycle()
    {
        var workspace = await Create(Alice); var other = await Create(Bob);
        var otherMembers = await Api<MemberView[]>(Bob, $"/api/workspaces/{other.Id}/members");
        await Api<object>(Alice, $"/api/workspaces/{workspace.Id}/members/{otherMembers.Single().Id}",
            new ChangeMemberRequest(1, GovernanceRoles.Reader, false), 409);
        var invitation = await Api<InvitationCreatedResult>(Alice, $"/api/workspaces/{workspace.Id}/invitations",
            new InviteMemberRequest(Guid.NewGuid(), 1, "Bob@example.com", GovernanceRoles.Reader), 201);
        var inviteUrl = $"/api/invitations/{invitation.Invitation.Id}/redeem";
        var list = await Api<InvitationView[]>(Alice, $"/api/workspaces/{workspace.Id}/invitations");
        Assert.Single(list); Assert.DoesNotContain("Token", System.Text.Json.JsonSerializer.Serialize(list));
        await Api<object>(Alice, $"/api/workspaces/{workspace.Id}/invitations",
            new InviteMemberRequest(Guid.NewGuid(), 2, "bob@example.com", GovernanceRoles.Reader), 409);
        await Api<object>(Bob, inviteUrl, new { invitation.Token, actor = new { EmailVerified = true } }, 403, verified: false);
        await Api<object>(Bob, inviteUrl, new RedeemInvitationRequest(invitation.Token), 409, email: "wrong@example.com");
        await Api<object>(Bob, inviteUrl, new RedeemInvitationRequest(invitation.Token), 409, issuer: "https://other.invalid/erp");
        await Api<object>(Bob, inviteUrl, new RedeemInvitationRequest(new('c', 64)), 409);
        var accepted = await Api<GovernanceMutationResult>(Bob, inviteUrl, new { invitation.Token, Role = GovernanceRoles.Owner });
        Assert.Equal(3, accepted.AuthorizationVersion);
        await Api<object>(Bob, inviteUrl, new RedeemInvitationRequest(invitation.Token), 409);
        var accessible = await Api<WorkspaceView[]>(Bob, "/api/workspaces");
        Assert.Contains(accessible, w => w.Id == workspace.Id); Assert.Contains(accessible, w => w.Id == other.Id);
        var configuration = org.Services.GetRequiredService<IConfiguration>();
        var now = DateTimeOffset.UtcNow;
        var path = $"/api/workspaces/{workspace.Id}/announcements";
        ConfigureAnnouncement(0, "all", now.AddHours(1), workspace.Id);
        ConfigureAnnouncement(1, "members", now.AddHours(1), workspace.Id, WorkspacePermissions.MembersRead);
        ConfigureAnnouncement(2, "expired", now.AddMinutes(-1), workspace.Id);
        ConfigureAnnouncement(3, "different-workspace", now.AddHours(1), other.Id);
        Assert.Equal(["all", "members"], (await Api<AnnouncementView[]>(Alice, path)).Select(x => x.Id));
        Assert.Equal("all", Assert.Single(await Api<AnnouncementView[]>(Bob, path)).Id);

        void ConfigureAnnouncement(int index, string id, DateTimeOffset end, Guid target, string? permission = null)
        {
            var key = $"Announcements:{index}";
            configuration[key + ":Id"] = id;
            configuration[key + ":Title"] = id;
            configuration[key + ":Message"] = "Workspace notice";
            configuration[key + ":StartsAtUtc"] = now.AddDays(-1).ToString("O");
            configuration[key + ":EndsAtUtc"] = end.ToString("O");
            configuration[key + ":Workspaces:0"] = target.ToString();
            if (permission is not null) configuration[key + ":RequiredPermission"] = permission;
        }
        var alias = new Claim("sub", "different-subject-same-email");
        await Api<WorkspaceView>(alias, "/api/workspaces", new CreateWorkspaceRequest(Guid.NewGuid(), "Same email, independent account"), 201, email: "bob@example.com");
        var bobAccount = await Api<System.Text.Json.JsonElement>(Bob, "/api/me");
        var aliasAccount = await Api<System.Text.Json.JsonElement>(alias, "/api/me", email: "bob@example.com");
        Assert.NotEqual(bobAccount.GetProperty("id").GetGuid(), aliasAccount.GetProperty("id").GetGuid());
        await Api<object>(alias, $"/api/workspaces/{workspace.Id}", status: 404, email: "bob@example.com");
        await Api<object>(Bob, $"/api/workspaces/{workspace.Id}/members", status: 403);
        await Api<object>(Bob, $"/api/workspaces/{workspace.Id}/invitations", new InviteMemberRequest(Guid.NewGuid(), 3, "eve@example.com", GovernanceRoles.Owner), 403);
        await Api<object>(Alice, $"/api/workspaces/{workspace.Id}/authorization/finance.journal.post", status: 403);

        await using (var scope = org.Services.CreateAsyncScope())
        {
            var authorization = scope.ServiceProvider.GetRequiredService<IApplicationAuthorization>();
            var bob = new ActorContext(Issuer.Value, Bob.Value, "bob@example.com", true);
            Assert.False((await authorization.CheckAsync(bob, new(other.TenantId, workspace.Id), WorkspacePermissions.Read, default)).Allowed);
            await Assert.ThrowsAsync<AccessDeniedException>(() => scope.ServiceProvider.GetRequiredService<IMessageBus>()
                .InvokeAsync<InvitationCreatedResult>(new CreateInvitation(workspace.Id, 3, Guid.NewGuid(), "eve@example.com", GovernanceRoles.Reader, bob)));
            LocalUserCommandGuard.Before(new Envelope());
            Assert.Throws<AccessDeniedException>(() => LocalUserCommandGuard.Before(new Envelope { ReceivedAt = DateTimeOffset.UtcNow }));
            var db = scope.ServiceProvider.GetRequiredService<OrganizationDbContext>();
            var stored = await db.Invitations.SingleAsync(x => x.Id == invitation.Invitation.Id);
            Assert.NotEqual(invitation.Token, stored.TokenHash); Assert.Equal("Accepted", stored.State);
            Assert.Equal(1, await db.Accounts.CountAsync(x => x.Issuer == Issuer.Value && x.Subject == Bob.Value));
        }
        var members = await Api<MemberView[]>(Alice, $"/api/workspaces/{workspace.Id}/members");
        var owner = members.Single(x => x.Subject == Alice.Value); var member = members.Single(x => x.Subject == Bob.Value);
        Assert.Equal(GovernanceRoles.Reader, member.Role);
        await Api<object>(Alice, $"/api/workspaces/{workspace.Id}/members/{member.Id}", new { expectedVersion = 3, role = GovernanceRoles.Reader }, 400);
        await Api<object>(Alice, $"/api/workspaces/{workspace.Id}/members/{owner.Id}", new ChangeMemberRequest(3, GovernanceRoles.Reader, true), 409);
        await Api<GovernanceMutationResult>(Alice, $"/api/workspaces/{workspace.Id}/members/{member.Id}", new ChangeMemberRequest(3, GovernanceRoles.Administrator, true));
        await Api<object>(Bob, $"/api/workspaces/{workspace.Id}/members/{member.Id}", new ChangeMemberRequest(4, GovernanceRoles.Owner, true), 403);
        await Api<object>(Alice, $"/api/workspaces/{workspace.Id}/members/{member.Id}", new ChangeMemberRequest(3, GovernanceRoles.Reader, false), 409);

        var eve = new Claim("sub", "eve-subject");
        var revoked = await Api<InvitationCreatedResult>(Alice, $"/api/workspaces/{workspace.Id}/invitations",
            new InviteMemberRequest(Guid.NewGuid(), 4, "eve@example.com", GovernanceRoles.Reader), 201);
        await Api<GovernanceMutationResult>(Alice, $"/api/workspaces/{workspace.Id}/invitations/{revoked.Invitation.Id}/revoke", new RevokeInvitationRequest(5));
        await Api<object>(eve, $"/api/invitations/{revoked.Invitation.Id}/redeem", new RedeemInvitationRequest(revoked.Token), 409, email: "eve@example.com");
        await Api<GovernanceMutationResult>(Alice, $"/api/workspaces/{workspace.Id}/members/{member.Id}", new ChangeMemberRequest(6, GovernanceRoles.Reader, false));
        await Api<object>(Bob, $"/api/workspaces/{workspace.Id}", status: 404);
        await Api<object>(Bob, $"/api/workspaces/{workspace.Id}/access", status: 404);
        var afterSuspend = await Api<WorkspaceView[]>(Bob, "/api/workspaces");
        Assert.DoesNotContain(afterSuspend, x => x.Id == workspace.Id);
        Assert.Contains(afterSuspend, x => x.Id == other.Id);
        await Api<GovernanceMutationResult>(Alice, $"/api/workspaces/{workspace.Id}/members/{member.Id}", new ChangeMemberRequest(7, GovernanceRoles.Reader, true));
        Assert.Contains(WorkspacePermissions.Read, (await Access(workspace.Id, Bob)).Permissions);
        await Eventually(async () =>
        {
            await using var scope = reports.Services.CreateAsyncScope();
            return await scope.ServiceProvider.GetRequiredService<Nexora.Reporting.Infrastructure.ReportingDbContext>()
                .AuthorizationVersions.AnyAsync(x => x.WorkspaceId == workspace.Id && x.Version == 8);
        });

        // A test-only real RabbitMQ listener proves the generated middleware rejects serialized user identities.
        var runtime = org.Services.GetRequiredService<IWolverineRuntime>();
        var untrustedUri = new Uri("rabbitmq://queue/nexora.test.untrusted-user-intents");
        runtime.Endpoints.GetOrBuildSendingAgent(untrustedUri, configured => { configured.IsListener = true; configured.Mode = EndpointMode.Durable; });
        var endpoint = runtime.Endpoints.EndpointFor(untrustedUri) ?? throw new InvalidOperationException("Test listener was not configured.");
        await runtime.Endpoints.StartListenerAsync(endpoint, default);
        await using var rabbitConnection = await new ConnectionFactory { Uri = new Uri(broker.GetConnectionString()) }.CreateConnectionAsync();
        await using var channel = await rabbitConnection.CreateChannelAsync();
        await channel.QueueDeclareAsync("nexora.organization.deadletters", durable: true, exclusive: false, autoDelete: false);
        var invitationCount = await Count("organization.workspace_invitations");
        await using (var scope = org.Services.CreateAsyncScope())
            await scope.ServiceProvider.GetRequiredService<IMessageBus>().EndpointFor(untrustedUri)
                .SendAsync(new CreateInvitation(workspace.Id, 8, Guid.NewGuid(), "untrusted@example.com", GovernanceRoles.Reader,
                    new ActorContext(Issuer.Value, Alice.Value, "alice@example.com", true)));
        BasicGetResult? rejected = null;
        await Eventually(async () =>
        {
            rejected = await channel.BasicGetAsync("nexora.organization.deadletters", autoAck: true);
            return rejected is not null;
        });
        Assert.Equal(invitationCount, await Count("organization.workspace_invitations"));
        Assert.Contains("untrusted@example.com", Encoding.UTF8.GetString(rejected!.Body.Span));
        await runtime.Endpoints.StopListenerAsync(endpoint, default);

        // A failure in audit persistence must roll back membership, authorization version, and its outbox fact.
        await Eventually(async () => await Count("organization_messages.wolverine_outgoing_envelopes") == 0);
        var audits = await Count("organization.workspace_audit");
        await using (var scope = org.Services.CreateAsyncScope())
        {
            await scope.ServiceProvider.GetRequiredService<OrganizationDbContext>().Database.ExecuteSqlRawAsync("""
                CREATE FUNCTION organization.fail_member_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test audit rollback'; END $$;
                CREATE TRIGGER fail_member_audit BEFORE INSERT ON organization.workspace_audit FOR EACH ROW EXECUTE FUNCTION organization.fail_member_audit();
                """);
        }
        await Api<object>(Alice, $"/api/workspaces/{workspace.Id}/members/{member.Id}", new ChangeMemberRequest(8, GovernanceRoles.Reader, false), 500);
        Assert.Equal(8, (await Access(workspace.Id, Bob)).AuthorizationVersion);
        Assert.Equal(audits, await Count("organization.workspace_audit"));
        Assert.Equal(0, await Count("organization_messages.wolverine_outgoing_envelopes"));
        // Invalid tokens still pass through the authenticated redemption rate policy before any business write.
        var rateSubject = new Claim("sub", "redemption-rate-probe");
        var missingInvitation = Guid.NewGuid();
        for (var attempt = 0; attempt < 20; attempt++)
            await Api<object>(rateSubject, $"/api/invitations/{missingInvitation}/redeem", new RedeemInvitationRequest("invalid"), 400);
        await Api<object>(rateSubject, $"/api/invitations/{missingInvitation}/redeem", new RedeemInvitationRequest("invalid"), 429);
    }

    [Fact]
    public async Task Stale_concurrent_aggregate_snapshots_cannot_remove_both_owners()
    {
        var originalCreation = new CreateWorkspaceRequest(Guid.NewGuid(), "并发所有者验证");
        var workspace = await Api<WorkspaceView>(Alice, "/api/workspaces", originalCreation, 201); await Create(Bob);
        var invite = await Api<InvitationCreatedResult>(Alice, $"/api/workspaces/{workspace.Id}/invitations",
            new InviteMemberRequest(Guid.NewGuid(), 1, "bob@example.com", GovernanceRoles.Owner), 201);
        await Api<GovernanceMutationResult>(Bob, $"/api/invitations/{invite.Invitation.Id}/redeem", new RedeemInvitationRequest(invite.Token));
        await using var left = org.Services.CreateAsyncScope(); await using var right = org.Services.CreateAsyncScope();
        var a = (await left.ServiceProvider.GetRequiredService<IWorkspaceRepository>().FindAsync(workspace.Id, default))!;
        var b = (await right.ServiceProvider.GetRequiredService<IWorkspaceRepository>().FindAsync(workspace.Id, default))!;
        a.ChangeMember(new(Issuer.Value, Alice.Value), a.Members.Single(x => x.Subject == Alice.Value).Id, GovernanceRoles.Owner, false);
        b.ChangeMember(new(Issuer.Value, Bob.Value), b.Members.Single(x => x.Subject == Bob.Value).Id, GovernanceRoles.Owner, false);
        async Task<bool> Save(OrganizationDbContext db)
        { try { await db.SaveChangesAsync(); return true; } catch (DbUpdateConcurrencyException) { return false; } }
        var results = await Task.WhenAll(Save(left.ServiceProvider.GetRequiredService<OrganizationDbContext>()), Save(right.ServiceProvider.GetRequiredService<OrganizationDbContext>()));
        Assert.Single(results, x => x); Assert.Single(results, x => !x);
        await using var fresh = org.Services.CreateAsyncScope();
        var persisted = (await fresh.ServiceProvider.GetRequiredService<IWorkspaceRepository>().FindAsync(workspace.Id, default))!;
        Assert.Single(persisted.Members, x => x.IsActive && x.Role == GovernanceRoles.Owner);
        var suspendedSubject = persisted.Members.Single(x => !x.IsActive).Subject;
        await Api<object>(new("sub", suspendedSubject), $"/api/workspaces/{workspace.Id}", status: 404);
        var creator = persisted.Members.Single(x => x.Subject == Alice.Value);
        if (creator.IsActive)
        {
            var successor = persisted.Members.Single(x => x.Subject == Bob.Value);
            await Api<GovernanceMutationResult>(Alice, $"/api/workspaces/{workspace.Id}/members/{successor.Id}", new ChangeMemberRequest(persisted.Version, GovernanceRoles.Owner, true));
            var currentVersion = (await Access(workspace.Id, Bob)).AuthorizationVersion;
            await Api<GovernanceMutationResult>(Bob, $"/api/workspaces/{workspace.Id}/members/{creator.Id}", new ChangeMemberRequest(currentVersion, GovernanceRoles.Owner, false));
        }
        // Historical creation intent is not a read capability after the creator loses membership.
        await Api<object>(Alice, "/api/workspaces", originalCreation, 404);
    }

    [Fact]
    public async Task Upgrade_backfills_accounts_and_owner_memberships_without_losing_workspaces()
    {
        await using (var connection = new NpgsqlConnection(organization.GetConnectionString()))
        {
            await connection.OpenAsync(); await using var command = new NpgsqlCommand("CREATE DATABASE upgrade_check", connection); await command.ExecuteNonQueryAsync();
        }
        var connectionString = new NpgsqlConnectionStringBuilder(organization.GetConnectionString()) { Database = "upgrade_check" }.ConnectionString;
        await using var db = new OrganizationDbContext(new DbContextOptionsBuilder<OrganizationDbContext>().UseNpgsql(connectionString).Options);
        var migrator = db.GetService<IMigrator>(); await migrator.MigrateAsync("20261106033844_InitialWorkspace");
        var id = Guid.NewGuid(); var tenant = Guid.NewGuid(); var operation = Guid.NewGuid(); var now = DateTimeOffset.UtcNow;
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO organization.workspaces ("Id", "TenantId", "OperationId", "Name", "OwnerIssuer", "OwnerSubject", "CountryCode", "BaseCurrency", "CreatedAtUtc", "Version")
            VALUES ({id}, {tenant}, {operation}, 'Existing company', {Issuer.Value}, {Alice.Value}, 'CN', 'CNY', {now}, 1)
            """);
        await migrator.MigrateAsync();
        var owner = await db.Members.SingleAsync(); Assert.Equal(GovernanceRoles.Owner, owner.Role);
        Assert.Equal(id, owner.WorkspaceId); Assert.Equal(Alice.Value, owner.Subject);
        Assert.Single(await db.Accounts.ToListAsync()); Assert.Single(await db.Workspaces.ToListAsync());
    }
}
