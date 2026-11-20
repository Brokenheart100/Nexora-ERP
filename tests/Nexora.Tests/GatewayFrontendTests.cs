using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Nexora.ApiGateway.Infrastructure.Proxy;
using Yarp.ReverseProxy.Configuration;

namespace Nexora.Tests;

public sealed class GatewayFrontendTests
{
    [Fact]
    public void Dashboard_only_does_not_require_or_route_to_legacy_web()
    {
        var builder = CreateBuilder(false);
        builder.AddGatewayProxy();
        using var services = builder.Services.BuildServiceProvider();
        var config = services.GetRequiredService<IProxyConfigProvider>().GetConfig();
        Assert.DoesNotContain(config.Clusters, cluster => cluster.ClusterId == "web");
        Assert.DoesNotContain(config.Routes, route => route.ClusterId == "web");
        Assert.Contains(config.Routes, route => route.RouteId == "dashboard-web");
        Assert.Contains(config.Routes, route => route.RouteId == "purchasing");
    }

    [Fact]
    public void Configured_legacy_web_preserves_its_session_and_page_routes()
    {
        var builder = CreateBuilder(true);
        builder.AddGatewayProxy();
        using var services = builder.Services.BuildServiceProvider();
        var config = services.GetRequiredService<IProxyConfigProvider>().GetConfig();
        Assert.Contains(config.Clusters, cluster => cluster.ClusterId == "web");
        Assert.Contains(config.Routes, route => route.RouteId == "bff" && route.ClusterId == "web");
        Assert.Contains(config.Routes, route => route.RouteId == "web");
        Assert.Contains(config.Routes, route => route.RouteId == "dashboard-web");
    }

    [Fact]
    public void Required_business_endpoints_still_fail_fast()
    {
        var builder = CreateBuilder(false);
        builder.Configuration["services:inventory:https:0"] = null;
        Assert.Throws<InvalidOperationException>(() => builder.AddGatewayProxy());
    }

    private static WebApplicationBuilder CreateBuilder(bool legacy)
    {
        var builder = WebApplication.CreateBuilder();
        builder.Configuration.Sources.Clear();
        var entries = new Dictionary<string, string?> { ["Dashboard:Origin"] = "https://localhost:7444" };
        foreach (var service in new[] { "organization", "reporting", "masterdata", "finance", "sales", "purchasing", "inventory", "dashboard" })
            entries[$"services:{service}:https:0"] = $"https://{service}.example.invalid";
        if (legacy) entries["services:web:http:0"] = "http://web.example.invalid";
        builder.Configuration.AddInMemoryCollection(entries);
        return builder;
    }
}
