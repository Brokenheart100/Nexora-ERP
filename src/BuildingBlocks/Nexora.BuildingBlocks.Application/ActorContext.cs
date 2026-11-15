namespace Nexora.BuildingBlocks.Application;

// Identity comes from a validated boundary, never from a request body or company header.
public sealed record ActorContext(string Issuer, string Subject, string? Email = null, bool EmailVerified = false);

public interface ICurrentActor
{
    ActorContext GetRequired();
}

public sealed class AccessDeniedException : Exception;
public sealed class ResourceNotFoundException : Exception;
public sealed class IdempotencyConflictException : Exception;
public class BusinessConflictException(string message) : Exception(message);

public sealed class RevisionConflictException(string message) : BusinessConflictException(message);

public sealed record ResourceScope(Guid TenantId, Guid WorkspaceId);
public sealed record ScopedPermission(string Permission, Guid? DepartmentId, Guid? WarehouseId,
    DateOnly? StartsOn = null, DateOnly? EndsOn = null);
public sealed record AccessDecision(bool IsMember, bool Allowed, long Version);

// Resource authorization is available to use cases and message adapters without HTTP dependencies.
public interface IApplicationAuthorization
{
    Task<AccessDecision> CheckAsync(ActorContext actor, ResourceScope scope, string permission, CancellationToken cancellationToken);
}

public static class ApplicationAuthorizationExtensions
{
    public static async Task DemandAsync(this IApplicationAuthorization authorization, ActorContext actor,
        ResourceScope scope, string permission, CancellationToken cancellationToken)
    {
        var decision = await authorization.CheckAsync(actor, scope, permission, cancellationToken);
        if (!decision.IsMember) throw new ResourceNotFoundException();
        if (!decision.Allowed) throw new AccessDeniedException();
    }
}
