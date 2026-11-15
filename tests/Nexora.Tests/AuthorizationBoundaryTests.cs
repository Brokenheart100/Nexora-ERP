using Microsoft.AspNetCore.Authorization;

namespace Nexora.Tests;

public sealed class AuthorizationBoundaryTests
{
    [Fact]
    public void User_intents_cannot_omit_the_marker_that_applies_listener_rejection()
    {
        var intents = typeof(Nexora.Organization.Application.OpenWorkspace).Assembly.GetExportedTypes()
            .Where(type => type.GetProperty("Actor")?.PropertyType == typeof(Nexora.BuildingBlocks.Application.ActorContext)).ToArray();
        Assert.NotEmpty(intents);
        foreach (var intent in intents)
            Assert.True(typeof(Nexora.Organization.Application.IUserGovernanceCommand).IsAssignableFrom(intent), intent.FullName);
    }
    [Fact]
    public void All_business_http_endpoints_declare_authentication_or_resource_authorization()
    {
        var assemblies = new[] { typeof(Nexora.Organization.Api.Program).Assembly, typeof(Nexora.Reporting.Api.Program).Assembly };
        var httpVerbAttribute = typeof(Wolverine.Http.WolverineGetAttribute).BaseType!;
        Assert.NotEqual(typeof(Attribute), httpVerbAttribute);
        var endpoints = assemblies.SelectMany(a => a.GetExportedTypes()).SelectMany(t => t.GetMethods())
            .Where(m => m.CustomAttributes.Any(a => httpVerbAttribute.IsAssignableFrom(a.AttributeType))).ToArray();
        Assert.NotEmpty(endpoints);
        foreach (var endpoint in endpoints) Assert.NotEmpty(endpoint.GetCustomAttributes(true).OfType<IAuthorizeData>());
    }
}
