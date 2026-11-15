using Nexora.BuildingBlocks.Application;
using System.Security.Claims;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;

namespace Nexora.BuildingBlocks.Infrastructure;

public static class RecordChangeApplicationBuilderExtensions
{
    public static IApplicationBuilder UseRecordChanges(this IApplicationBuilder app) => app.Use(async (context, next) =>
    {
        var previous = RecordChangeContext.Actor;
        RecordChangeContext.Actor = ResolveActor(context.User);
        try
        {
            await next();
        }
        finally
        {
            RecordChangeContext.Actor = previous;
        }
    });

    private static ActorContext? ResolveActor(ClaimsPrincipal user)
    {
        if (user.Identity?.IsAuthenticated != true) return null;
        var issuer = user.FindFirst("iss")?.Value;
        var subject = user.FindFirst("sub")?.Value;
        if (string.IsNullOrEmpty(issuer) || string.IsNullOrEmpty(subject)) return null;
        return new ActorContext(issuer, subject);
    }
}
