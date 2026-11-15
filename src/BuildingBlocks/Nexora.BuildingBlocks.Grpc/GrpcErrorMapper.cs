using Grpc.Core;
using Nexora.BuildingBlocks.Application;

namespace Nexora.BuildingBlocks.Grpc;

// Translates gRPC status codes back into the domain exceptions the HTTP integrations used to throw.
public static class GrpcErrorMapper
{
    public static async Task<T> CallAsync<T>(Func<Task<T>> call, CancellationToken cancellationToken,
        Func<string, Exception> unavailable, Func<string, Exception>? conflict = null)
    {
        ArgumentNullException.ThrowIfNull(call);
        ArgumentNullException.ThrowIfNull(unavailable);
        try
        {
            return await call();
        }
        catch (RpcException error)
        {
            throw Translate(error, cancellationToken, unavailable, conflict);
        }
    }

    public static Exception Translate(RpcException error, CancellationToken cancellationToken,
        Func<string, Exception> unavailable, Func<string, Exception>? conflict = null)
    {
        ArgumentNullException.ThrowIfNull(error);
        ArgumentNullException.ThrowIfNull(unavailable);
        if (cancellationToken.IsCancellationRequested) return new OperationCanceledException(cancellationToken);
        var detail = string.IsNullOrWhiteSpace(error.Status.Detail) ? error.StatusCode.ToString() : error.Status.Detail;
        return error.StatusCode switch
        {
            StatusCode.PermissionDenied or StatusCode.Unauthenticated => new AccessDeniedException(),
            StatusCode.NotFound => new ResourceNotFoundException(),
            StatusCode.FailedPrecondition or StatusCode.AlreadyExists or StatusCode.Aborted
                or StatusCode.InvalidArgument => conflict is not null ? conflict(detail) : new BusinessConflictException(detail),
            _ => unavailable(detail)
        };
    }
}
