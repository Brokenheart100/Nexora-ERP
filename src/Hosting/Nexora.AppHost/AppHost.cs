using System.Text.Json;
using Nexora.AppHost;

var builder = DistributedApplication.CreateBuilder(args);
if (!builder.ExecutionContext.IsRunMode)
    throw new InvalidOperationException("This P1 AppHost provisions local demo identities. Production identity provisioning is not implemented yet.");
const int gatewayPort = 7443;
const int dashboardPort = 7444;
const int identityPort = 8088;
var publicOrigin = $"https://localhost:{gatewayPort}";
var dashboardOrigin = $"https://localhost:{dashboardPort}";
var secretDefault = new GenerateParameterDefault { MinLength = 32, Special = false };
var clientSecret = builder.AddParameter("bff-client-secret", secretDefault, secret: true, persist: true);
var sessionKey = builder.AddParameter("bff-session-key", secretDefault, secret: true, persist: true);
var dashboardClientSecret = builder.AddParameter("dashboard-bff-client-secret", secretDefault, secret: true, persist: true);
var dashboardSessionKey = builder.AddParameter("dashboard-bff-session-key", secretDefault, secret: true, persist: true);
var otpSecret = builder.AddParameter("email-otp-key", secretDefault, secret: true, persist: true);
var alicePassword = builder.AddParameter("demo-alice-password", secretDefault, secret: true, persist: true);
var bobPassword = builder.AddParameter("demo-bob-password", secretDefault, secret: true, persist: true);
// Public issuer is a stable deployment setting; typed hosting 13.6 serves this endpoint over HTTPS.
var identityOrigin = builder.AddParameter("identity-public-origin", "https://localhost:" + identityPort);

var postgres = builder
    .AddPostgres("postgres", port: 6543)
    // .WithPgAdmin()
    .WithImageSHA256(ContainerImageDigests.Postgres)
    .WithDataVolume("nexora-postgres-data");

var orgDatabase = postgres.AddDatabase("organizationdb");
var reportingDatabase = postgres.AddDatabase("reportingdb");
var identityDatabase = postgres.AddDatabase("identitydb");
var masterDataDatabase = postgres.AddDatabase("masterdatadb");
var financeDatabase = postgres.AddDatabase("financedb");
var purchasingDatabase = postgres.AddDatabase("purchasingdb");
var salesDatabase = postgres.AddDatabase("salesdb");
var inventoryDatabase = postgres.AddDatabase("inventorydb");

var databaseAccess = builder.ConfigurePostgresAccess(postgres, orgDatabase, reportingDatabase, identityDatabase,
    masterDataDatabase, financeDatabase, purchasingDatabase, inventoryDatabase, salesDatabase);

var broker = builder.AddRabbitMQ("rabbitmq").WithImageTag("4.3-management").WithDataVolume();
broker.WithImageSHA256(ContainerImageDigests.Rabbit);
var brokerAccess = await builder.ConfigureRabbitAccessAsync(broker);
var cache = builder.AddRedis("cache").WithImageSHA256(ContainerImageDigests.Redis).WithDataVolume();

// Development realm imports contain generated secrets. They live only in the ignored runtime directory.
var realmDirectory = Path.GetFullPath("../../../artifacts/p1/runtime/keycloak", builder.AppHostDirectory);
Directory.CreateDirectory(realmDirectory);

object DemoUser(string username, string password) => new
{
    username,
    enabled = true,
    firstName = username,
    lastName = "LocalDemo",
    email = $"{username}@nexora.invalid",
    emailVerified = true,
    requiredActions = new[] { "CONFIGURE_TOTP" },
    credentials = new[] { new { type = "password", value = password, temporary = false } }
};

var realm = new
{
    realm = "nexora",
    enabled = true,
    displayName = "Nexora 本地验证",
    registrationAllowed = false,
    resetPasswordAllowed = false,
    bruteForceProtected = true,
    sslRequired = "external",
    accessTokenLifespan = 300,
    ssoSessionIdleTimeout = 1800,
    clients = new object[] { new
    {
        clientId = "nexora-bff", enabled = true, protocol = "openid-connect", publicClient = false,
        secret = await clientSecret.Resource.GetValueAsync(default), standardFlowEnabled = true,
        directAccessGrantsEnabled = false, serviceAccountsEnabled = false,
        redirectUris = new[] { $"{publicOrigin}/signin-oidc" },
        attributes = new Dictionary<string, string>
        {
            ["pkce.code.challenge.method"] = "S256",
            ["post.logout.redirect.uris"] = $"{publicOrigin}/signout-callback-oidc"
        },
        protocolMappers = new[] { new
        {
            name = "business-api-audience", protocol = "openid-connect", protocolMapper = "oidc-audience-mapper",
            consentRequired = false, config = new Dictionary<string, string>
            { ["included.custom.audience"] = "nexora-api", ["access.token.claim"] = "true", ["id.token.claim"] = "false" }
        }, new
        {
            name = "authentication-method-reference", protocol = "openid-connect", protocolMapper = "oidc-amr-mapper",
            consentRequired = false, config = new Dictionary<string, string>
            { ["access.token.claim"] = "true", ["id.token.claim"] = "true" }
        } }
    }, new
    {
        clientId = "nexora-cli", enabled = true, protocol = "openid-connect", publicClient = true,
        standardFlowEnabled = false, implicitFlowEnabled = false,
        directAccessGrantsEnabled = false, serviceAccountsEnabled = false,
        consentRequired = true, fullScopeAllowed = false,
        attributes = new Dictionary<string, string>
        {
            ["oauth2.device.authorization.grant.enabled"] = "true",
            ["pkce.code.challenge.method"] = "S256"
        },
        protocolMappers = new[] { new
        {
            name = "business-api-audience", protocol = "openid-connect", protocolMapper = "oidc-audience-mapper",
            consentRequired = false, config = new Dictionary<string, string>
            { ["included.custom.audience"] = "nexora-api", ["access.token.claim"] = "true", ["id.token.claim"] = "false" }
        } },
        defaultClientScopes = new[] { "basic", "profile", "email" },
        optionalClientScopes = new[] { "nexora.cli" }
    }, new
    {
        clientId = "nexora-mcp", enabled = true, protocol = "openid-connect", publicClient = true,
        standardFlowEnabled = false, implicitFlowEnabled = false,
        directAccessGrantsEnabled = false, serviceAccountsEnabled = false,
        consentRequired = true, fullScopeAllowed = false,
        attributes = new Dictionary<string, string>
        {
            ["oauth2.device.authorization.grant.enabled"] = "true",
            ["pkce.code.challenge.method"] = "S256"
        },
        protocolMappers = new[] { new
        {
            name = "business-api-audience", protocol = "openid-connect", protocolMapper = "oidc-audience-mapper",
            consentRequired = false, config = new Dictionary<string, string>
            { ["included.custom.audience"] = "nexora-api", ["access.token.claim"] = "true", ["id.token.claim"] = "false" }
        } },
        defaultClientScopes = new[] { "basic", "profile", "email" },
        optionalClientScopes = new[] { "nexora.mcp" }
    } },
    clientScopes = new object[]
    {
        new
        {
            name = "nexora.cli", protocol = "openid-connect",
            description = "Nexora CLI read-only workspace access",
            attributes = new Dictionary<string, string>
            {
                ["include.in.token.scope"] = "true",
                ["display.on.consent.screen"] = "true",
                ["consent.screen.text"] = "读取当前用户可访问的工作区（只读）"
            },
            protocolMappers = new[] { new
            {
                name = "nexora-cli-purpose", protocol = "openid-connect", protocolMapper = "oidc-hardcoded-claim-mapper",
                consentRequired = false, config = new Dictionary<string, string>
                {
                    ["claim.name"] = "nexora.purpose", ["claim.value"] = "cli",
                    ["jsonType.label"] = "String", ["access.token.claim"] = "true", ["id.token.claim"] = "false"
                }
            } }
        }, new
        {
            name = "nexora.mcp", protocol = "openid-connect",
            description = "Nexora finance MCP read-only access",
            attributes = new Dictionary<string, string>
            {
                ["include.in.token.scope"] = "true",
                ["display.on.consent.screen"] = "true",
                ["consent.screen.text"] = "读取工作区财务科目、总账与报表（只读）"
            },
            protocolMappers = new[] { new
            {
                name = "nexora-mcp-purpose", protocol = "openid-connect", protocolMapper = "oidc-hardcoded-claim-mapper",
                consentRequired = false, config = new Dictionary<string, string>
                {
                    ["claim.name"] = "nexora.purpose", ["claim.value"] = "mcp",
                    ["jsonType.label"] = "String", ["access.token.claim"] = "true", ["id.token.claim"] = "false"
                }
            } }
        }
    },
    users = new[] { DemoUser("alice", (await alicePassword.Resource.GetValueAsync(default))!),
        DemoUser("bob", (await bobPassword.Resource.GetValueAsync(default))!) }
};
await File.WriteAllTextAsync(Path.Combine(realmDirectory, "nexora-realm.json"), JsonSerializer.Serialize(realm));

var identityAccount = databaseAccess.For(identityDatabase);
var identity = builder.AddKeycloak("identity", identityPort)
    .WithDockerfile("../../../scripts/p0/keycloak-email-otp", "Dockerfile.onboarding")
    .WithRealmImport(realmDirectory).WithDataVolume()
    .WithEnvironment("NEXORA_OTP_HMAC_KEY", otpSecret)
    .WithEnvironment("KC_HOSTNAME", identityOrigin)
    .WithEnvironment("KC_DB", "postgres")
    .WithEnvironment("KC_DB_URL_HOST", postgres.Resource.Host)
    .WithEnvironment("KC_DB_URL_PORT", postgres.Resource.Port)
    .WithEnvironment("KC_DB_URL_DATABASE", "identitydb")
    .WithEnvironment("KC_DB_USERNAME", identityAccount.UserName)
    .WithEnvironment("KC_DB_PASSWORD", identityAccount.Password)
    .WaitFor(identityDatabase);

var authority = ReferenceExpression.Create($"{identity.GetEndpoint("http")}/realms/nexora");

var powerShellExecutable = builder.Configuration["Tools:PowerShellExecutable"] ?? "pwsh";
var identityOnboarding = builder.AddExecutable("identity-onboarding", powerShellExecutable, "../../../scripts/p1",
        "-NoProfile", "-File", "Configure-EmailOnboarding.ps1")
    .WithEnvironment("NEXORA_IDENTITY_ORIGIN", identityOrigin)
    .WithEnvironment("NEXORA_IDENTITY_ADMIN", "admin")
    .WithEnvironment("NEXORA_IDENTITY_PASSWORD", ReferenceExpression.Create($"{identity.Resource.AdminPasswordParameter}"))
    .WithEnvironment("NEXORA_DASHBOARD_ORIGIN", dashboardOrigin)
    .WithEnvironment("NEXORA_DASHBOARD_CLIENT_SECRET", dashboardClientSecret)
    .WaitFor(identity);

var organization = builder.AddProject<Projects.Nexora_Organization_Api>("organization")
    .WithReference(databaseAccess.AddConnection(orgDatabase), "organizationdb")
    .WithReference(brokerAccess.AddConnection("organization"), "rabbitmq")
    .WithEnvironment("Authentication__Authority", authority)
    .WithEnvironment("Billing__DefaultPlan", builder.Configuration["Billing:DefaultPlan"] ?? "pro")
    .WaitFor(orgDatabase).WaitFor(broker).WaitFor(identity);

var mailSettings = builder.Configuration.GetSection("OnboardingMail");
var smtpHost = mailSettings["Host"];
var smtpFrom = mailSettings["From"] ?? "noreply@nexora.invalid";
organization.WithEnvironment("OnboardingMail__PublicOrigin", dashboardOrigin)
    .WithEnvironment("OnboardingMail__From", smtpFrom);
identityOnboarding.WithEnvironment("NEXORA_SMTP_FROM", smtpFrom);
IResourceBuilder<MailPitContainerResource>? localMail = null;

localMail = builder.AddMailPit("mailpit", httpPort: 8025)
    .WithImageTag("v1.33.1")
    .WithImageSHA256(ContainerImageDigests.Mailpit);
// Keycloak reads the realm SMTP settings inside the identity container, so it must use the
// Mailpit resource name and the container port instead of the host-mapped endpoint.
identityOnboarding.WithEnvironment("NEXORA_SMTP_HOST", localMail.Resource.Name)
    .WithEnvironment("NEXORA_SMTP_PORT", "1025").WithEnvironment("NEXORA_SMTP_STARTTLS", "false").WaitFor(localMail);
organization.WithEnvironment("OnboardingMail__Host", ReferenceExpression.Create($"{localMail.Resource.PrimaryEndpoint.Property(EndpointProperty.Host)}"))
    .WithEnvironment("OnboardingMail__Port", ReferenceExpression.Create($"{localMail.Resource.PrimaryEndpoint.Property(EndpointProperty.Port)}"))
    .WithEnvironment("OnboardingMail__StartTls", "false").WaitFor(localMail);


var reporting = builder.AddProject<Projects.Nexora_Reporting_Api>("reporting")
    .WithReference(databaseAccess.AddConnection(reportingDatabase), "reportingdb")
    .WithReference(brokerAccess.AddConnection("reporting"), "rabbitmq")
    .WithReference(organization)
    .WithEnvironment("Authentication__Authority", authority)
    .WaitFor(reportingDatabase).WaitFor(broker).WaitFor(identity).WaitFor(organization);

var masterData = builder.AddProject<Projects.Nexora_MasterData_Api>("masterdata", launchProfileName: null)
    .WithHttpsEndpoint()
    .WithReference(databaseAccess.AddConnection(masterDataDatabase), "masterdatadb")
    .WithReference(brokerAccess.AddConnection("masterdata"), "rabbitmq")
    .WithReference(organization)
    .WithEnvironment("ASPNETCORE_ENVIRONMENT", builder.Environment.EnvironmentName)
    .WithEnvironment("Authentication__Authority", authority)
    .WaitFor(masterDataDatabase).WaitFor(organization).WaitFor(broker);

var finance = builder.AddProject<Projects.Nexora_Finance_Api>("finance", launchProfileName: null)
    .WithHttpsEndpoint()
    .WithReference(databaseAccess.AddConnection(financeDatabase), "financedb")
    .WithReference(brokerAccess.AddConnection("finance"), "rabbitmq")
    .WithReference(organization).WithReference(masterData)
    .WithEnvironment("ASPNETCORE_ENVIRONMENT", builder.Environment.EnvironmentName)
    .WithEnvironment("InvoicePdf__FontPath", builder.Configuration["InvoicePdf:FontPath"]
        ?? Path.GetFullPath("../../../artifacts/p4/runtime/NotoSansSC.ttf", builder.AppHostDirectory))
    .WithEnvironment("Authentication__Authority", authority)
    .WaitFor(financeDatabase).WaitFor(organization).WaitFor(masterData).WaitFor(broker);

var useDashboardOutput = bool.TryParse(builder.Configuration["Dashboard:UseNodeOutput"], out var enabled) && enabled;
var dashboard = builder.AddJavaScriptApp("dashboard", "../../Web/nexora-dashboard", runScriptName: useDashboardOutput ? "start:live" : "dev").WithPnpm()
    .WithHttpEndpoint(port: 3002, env: useDashboardOutput ? "NITRO_PORT" : "NUXT_PORT")
    .WithEnvironment("NUXT_PUBLIC_DATA_MODE", "live")
    .WithEnvironment("NUXT_PUBLIC_BFF_ORIGIN", dashboardOrigin)
    .WithEnvironment("NUXT_BFF_ISSUER", ReferenceExpression.Create($"{identityOrigin}/realms/nexora"))
    .WithEnvironment("NUXT_BFF_CLIENT_SECRET", dashboardClientSecret)
    .WithEnvironment("NUXT_BFF_SESSION_KEY", dashboardSessionKey)
    .WithEnvironment("NUXT_BFF_REDIS_URL", cache.Resource.UriExpression)
    .WithEnvironment("NEXORA_BUILD_VERSION", builder.Configuration["Dashboard:BuildVersion"] ?? "0.1.0-dashboard-local")
    .WithDeveloperCertificateTrust(true)
    .WithCertificateTrustConfiguration(context =>
    {
        context.EnvironmentVariables["NODE_EXTRA_CA_CERTS"] = context.CertificateBundlePath;
        return Task.CompletedTask;
    })
    .WaitFor(cache).WaitFor(identity).WaitForCompletion(identityOnboarding);

if (useDashboardOutput)
{
    dashboard.WithEnvironment("NODE_ENV", "production")
        .WithEnvironment("NITRO_HOST", "127.0.0.1")
        .WithEnvironment("NEXORA_BUILD_ENV", "d14-local")
        .WithEnvironment("NEXORA_BUILD_ID", builder.Configuration["Dashboard:BuildId"] ?? string.Empty);
}

if (builder.Configuration["InvoiceMail:Host"] is { Length: > 0 })
{
    foreach (var setting in new[] { "Host", "Port", "From", "StartTls", "Username" })
        if (builder.Configuration[$"InvoiceMail:{setting}"] is { } value)
            finance.WithEnvironment($"InvoiceMail__{setting}", value);
    if (builder.Configuration["InvoiceMail:Username"] is { Length: > 0 })
        finance.WithEnvironment("InvoiceMail__Password", builder.AddParameter("invoice-smtp-password", secret: true));
}
else if (localMail is not null)
{
    // No external channel configured: capture invoice mail in the local Mailpit inbox as well.
    finance.WithEnvironment("InvoiceMail__Host", ReferenceExpression.Create($"{localMail.Resource.PrimaryEndpoint.Property(EndpointProperty.Host)}"))
        .WithEnvironment("InvoiceMail__Port", ReferenceExpression.Create($"{localMail.Resource.PrimaryEndpoint.Property(EndpointProperty.Port)}"))
        .WithEnvironment("InvoiceMail__From", builder.Configuration["InvoiceMail:From"] ?? smtpFrom)
        .WithEnvironment("InvoiceMail__StartTls", "false").WaitFor(localMail);
}

var inventory = builder.AddProject<Projects.Nexora_Inventory_Api>("inventory", launchProfileName: null)
    .WithHttpsEndpoint()
    .WithReference(databaseAccess.AddConnection(inventoryDatabase), "inventorydb")
    .WithReference(brokerAccess.AddConnection("inventory"), "rabbitmq")
    .WithReference(organization)
    .WithEnvironment("ASPNETCORE_ENVIRONMENT", builder.Environment.EnvironmentName)
    .WithEnvironment("Authentication__Authority", authority)
    .WaitFor(inventoryDatabase).WaitFor(organization).WaitFor(broker);
organization.WithReference(inventory);
finance.WithReference(inventory);

var sales = builder.AddProject<Projects.Nexora_Sales_Api>("sales", launchProfileName: null)
    .WithHttpsEndpoint()
    .WithReference(databaseAccess.AddConnection(salesDatabase), "salesdb")
    .WithReference(brokerAccess.AddConnection("sales"), "rabbitmq")
    .WithReference(organization).WithReference(masterData).WithReference(finance).WithReference(inventory)
    .WithEnvironment("ASPNETCORE_ENVIRONMENT", builder.Environment.EnvironmentName)
    .WithEnvironment("Authentication__Authority", authority)
    .WaitFor(salesDatabase).WaitFor(organization).WaitFor(masterData).WaitFor(finance).WaitFor(inventory).WaitFor(broker);

var purchasing = builder.AddProject<Projects.Nexora_Purchasing_Api>("purchasing", launchProfileName: null)
    .WithHttpsEndpoint()
    .WithReference(databaseAccess.AddConnection(purchasingDatabase), "purchasingdb")
    .WithReference(brokerAccess.AddConnection("purchasing"), "rabbitmq")
    .WithReference(organization).WithReference(masterData).WithReference(finance).WithReference(inventory)
    .WithEnvironment("ASPNETCORE_ENVIRONMENT", builder.Environment.EnvironmentName)
    .WithEnvironment("Authentication__Authority", authority)
    .WaitFor(purchasingDatabase).WaitFor(organization).WaitFor(masterData).WaitFor(finance).WaitFor(inventory).WaitFor(broker);

var gateway = builder.AddProject<Projects.Nexora_ApiGateway>("gateway", launchProfileName: null)
    .WithHttpsEndpoint(port: gatewayPort)
    .WithHttpsEndpoint(port: dashboardPort, name: "dashboard-https")
    // .WithHttpHealthCheck("/health", endpointName: "https")
    .WithEnvironment("ASPNETCORE_ENVIRONMENT", builder.Environment.EnvironmentName)
    .WithEnvironment("Authentication__Authority", authority)
    .WithEnvironment("Dashboard__Origin", dashboardOrigin)
    .WithEnvironment("Ai__Provider", builder.Configuration["Ai:Provider"] ?? "stub")
    .WithEnvironment("Ai__Model", builder.Configuration["Ai:Model"] ?? "nexora-stub")
    .WithEnvironment("Ai__Endpoint", builder.Configuration["Ai:Endpoint"] ?? string.Empty)
    .WithEnvironment("Ai__ApiKey", builder.Configuration["Ai:ApiKey"] ?? string.Empty)
    .WithReference(cache)
    .WithReference(dashboard).WithReference(organization).WithReference(reporting).WithReference(masterData)
    .WithReference(finance).WithReference(purchasing).WithReference(inventory).WithReference(sales)
    .WithExternalHttpEndpoints()
    .WaitFor(cache)
    .WaitFor(dashboard).WaitFor(organization).WaitFor(reporting).WaitFor(masterData)
    .WaitFor(finance).WaitFor(purchasing).WaitFor(inventory).WaitFor(sales);

// web.WithEnvironment("NUXT_BFF_GATEWAY_URL", gateway.GetEndpoint("https"));
dashboard.WithEnvironment("NUXT_BFF_GATEWAY_URL", gateway.GetEndpoint("https"));

await builder.Build().RunAsync();
