using Grpc.Core;
using Microsoft.AspNetCore.Http;
using Nexora.BuildingBlocks.Application;
using ProtoBuf.Grpc;

namespace Nexora.BuildingBlocks.Grpc;

public static class GrpcCallContext
{
    private const string AuthorizationHeader = "authorization";
    private static readonly TimeSpan Deadline = TimeSpan.FromSeconds(20);

    // Forward the caller's bearer token; an anonymous call still reaches the server and is
    // rejected there exactly like the previous HTTP hop.
    public static CallContext Forward(IHttpContextAccessor accessor, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(accessor);
        var headers = new Metadata();
        var authorization = accessor.HttpContext?.Request.Headers.Authorization.ToString();
        if (!string.IsNullOrWhiteSpace(authorization)) headers.Add(AuthorizationHeader, authorization);
        return Build(headers, cancellationToken);
    }

    public static CallContext Forward(HttpContext? context, CancellationToken cancellationToken = default)
    {
        var headers = new Metadata();
        var authorization = context?.Request.Headers.Authorization.ToString();
        if (!string.IsNullOrWhiteSpace(authorization)) headers.Add(AuthorizationHeader, authorization);
        return Build(headers, cancellationToken);
    }

    public static CallContext RequireBearer(IHttpContextAccessor accessor, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(accessor);
        var authorization = accessor.HttpContext?.Request.Headers.Authorization.ToString();
        if (string.IsNullOrWhiteSpace(authorization)) throw new AccessDeniedException();
        return Build(new Metadata { { AuthorizationHeader, authorization } }, cancellationToken);
    }

    private static CallContext Build(Metadata headers, CancellationToken cancellationToken)
        => new(new CallOptions(headers: headers, deadline: DateTime.UtcNow + Deadline, cancellationToken: cancellationToken));
}
