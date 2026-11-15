using Nexora.ApiGateway.Infrastructure.Authorization;
using Yarp.ReverseProxy.Configuration;

namespace Nexora.ApiGateway.Infrastructure.Proxy;

internal static class GatewayProxy
{
    public static void AddGatewayProxy(this WebApplicationBuilder builder)
    {
        RouteConfig[] routes =
        [
            BffRoute("bff", "/bff/{**rest}"),
            BffRoute("oidc-signin", "/signin-oidc"),
            BffRoute("oidc-signout", "/signout-oidc"),
            BffRoute("oidc-signout-callback", "/signout-callback-oidc"),
            ApiRoute("cli", "organization", "/api/cli/{**rest}", order: 0, policy: CliAuthorization.CliOnlyPolicy),
            ApiRoute("reports", "reporting", "/api/reports/{**rest}"),
            ApiRoute("masterdata", "masterdata", "/api/masterdata/{**rest}"),
            ApiRoute("finance", "finance", "/api/finance/{**rest}"),
            ApiRoute("sales", "sales", "/api/sales/{**rest}"),
            ApiRoute("purchasing", "purchasing", "/api/purchasing/{**rest}"),
            ApiRoute("inventory", "inventory", "/api/inventory/{**rest}"),
            ApiRoute("organization", "organization", "/api/{**rest}", order: 1),
            new RouteConfig
            {
                RouteId = "invoice-share-download",
                ClusterId = "finance",
                AuthorizationPolicy = "Anonymous",
                Match = new() { Path = "/public/invoice-pdf", Methods = [HttpMethods.Post] },
                Transforms = [RemoveHeader("Cookie"), RemoveHeader("Authorization")]
            },
            new RouteConfig
            {
                RouteId = "web",
                ClusterId = "web",
                Order = 100,
                AuthorizationPolicy = "Anonymous",
                Match = new() { Path = "/{**rest}" },
                Transforms = [RemoveHeader("Cookie"), RemoveHeader("Authorization")]
            }
        ];

        var readiness = builder.Services.AddHealthChecks();
        var clusters = new List<ClusterConfig>();
        foreach (var service in routes.Select(route => route.ClusterId!).Distinct())
        {
            var address = builder.Configuration[$"services:{service}:https:0"]
                ?? builder.Configuration[$"services:{service}:http:0"]
                ?? throw new InvalidOperationException($"Aspire service endpoint {service} required");
            clusters.Add(new ClusterConfig
            {
                ClusterId = service,
                Destinations = new Dictionary<string, DestinationConfig> { ["primary"] = new() { Address = address } }
            });
            readiness.AddHttpReadiness(service, new Uri(address.TrimEnd('/') + "/health"));
        }

        builder.Services.AddReverseProxy().LoadFromMemory(routes, clusters);
    }

    private static RouteConfig BffRoute(string id, string path) => new()
    {
        RouteId = id,
        ClusterId = "web",
        AuthorizationPolicy = "Anonymous",
        Match = new() { Path = path },
        Transforms = [new Dictionary<string, string> { ["RequestHeaderOriginalHost"] = "true" }, RemoveHeader("Authorization")]
    };

    private static RouteConfig ApiRoute(string id, string service, string path, int order = 0, string policy = CliAuthorization.WebOnlyPolicy) => new()
    {
        RouteId = id,
        ClusterId = service,
        Order = order,
        AuthorizationPolicy = policy,
        Match = new() { Path = path },
        Transforms = [RemoveHeader("Cookie"), RemoveHeader("X-CSRF-TOKEN"),
            new Dictionary<string, string> { ["ResponseHeader"] = "Cache-Control", ["Set"] = "no-store" }]
    };

    private static Dictionary<string, string> RemoveHeader(string name) => new() { ["RequestHeaderRemove"] = name };
}
