using System.Net.Http.Headers;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Nexora.BuildingBlocks.Application;
using Nexora.BuildingBlocks.Grpc;
using Nexora.MasterData.Application;
using Nexora.Organization.Contracts.Grpc;

namespace Nexora.MasterData.Infrastructure;

public sealed class OrganizationCatalogAccess(IHttpContextAccessor accessor, IOrganizationGrpc organization) : ICatalogAccess
{
    public async Task<CatalogAccess> DemandAsync(Guid workspaceId, string permission, CancellationToken cancellationToken)
    {
        var http = accessor.HttpContext;
        var issuer = http?.User.FindFirstValue("iss");
        var subject = http?.User.FindFirstValue("sub");
        if (http?.User.Identity?.IsAuthenticated != true || string.IsNullOrWhiteSpace(issuer) || string.IsNullOrWhiteSpace(subject)
            || !AuthenticationHeaderValue.TryParse(http.Request.Headers.Authorization.ToString(), out var authorization)
            || !authorization.Scheme.Equals("Bearer", StringComparison.OrdinalIgnoreCase) || string.IsNullOrWhiteSpace(authorization.Parameter))
            throw new AccessDeniedException();

        Func<string, Exception> authorityUnavailable = _ => new CatalogAuthorityUnavailableException();
        var reply = await GrpcErrorMapper.CallAsync(
            () => organization.GetWorkspaceAccessAsync(
                new WorkspaceAccessRequest { WorkspaceId = workspaceId },
                GrpcCallContext.Forward(accessor, cancellationToken)),
            cancellationToken,
            authorityUnavailable,
            authorityUnavailable);
        if (reply.WorkspaceId != workspaceId || reply.TenantId == Guid.Empty || reply.Permissions is null)
            throw new CatalogAuthorityUnavailableException();
        if (!reply.Permissions.Contains(permission, StringComparer.Ordinal)) throw new AccessDeniedException();
        return new(new(reply.TenantId, workspaceId), new(issuer, subject), reply.Permissions);
    }
}
