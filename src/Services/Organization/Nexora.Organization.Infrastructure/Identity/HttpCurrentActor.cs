using Microsoft.AspNetCore.Http;
using System.Security.Claims;
using Nexora.BuildingBlocks.Application;

namespace Nexora.Organization.Infrastructure;

public sealed class HttpCurrentActor(IHttpContextAccessor accessor) : ICurrentActor
{
    public ActorContext GetRequired()
    {
        var principal = accessor.HttpContext?.User;
        if (principal?.Identity?.IsAuthenticated != true) throw new AccessDeniedException();
        var issuer = principal.FindFirstValue("iss");
        var subject = principal.FindFirstValue("sub");
        if (string.IsNullOrWhiteSpace(issuer) || string.IsNullOrWhiteSpace(subject)) throw new AccessDeniedException();
        return new(issuer, subject, principal.FindFirstValue("email"),
            bool.TryParse(principal.FindFirstValue("email_verified"), out var verified) && verified);
    }
}
